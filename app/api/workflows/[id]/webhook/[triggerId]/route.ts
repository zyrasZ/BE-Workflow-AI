/**
 * Webhook Trigger API Endpoint
 * 
 * POST /api/workflows/[id]/webhook/[triggerId] - Receive webhook requests and trigger workflow execution
 * 
 * Requirement 12: Trigger - Webhook Trigger
 */

import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { triggerManager } from '@/lib/workflow-engine/triggers/trigger-manager';
import { WebhookWorker } from '@/lib/workflow-engine/triggers/webhook-worker';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/[id]/webhook/[triggerId]
 * 
 * Receive webhook requests and trigger workflow execution
 * 
 * Request Body:
 * - JSON: { "key": "value", ... }
 * - Form data: key1=value1&key2=value2
 * 
 * Request Headers:
 * - X-API-Key: API key for authentication (if authType is 'apiKey')
 * - X-Webhook-Signature: HMAC signature for validation (if authType is 'signature')
 * - Content-Type: application/json or application/x-www-form-urlencoded
 * 
 * Response (200 OK):
 * {
 *   "success": true,
 *   "message": "Workflow execution started",
 *   "executionId": "uuid"
 * }
 * 
 * Response (401 Unauthorized):
 * {
 *   "error": "Authentication failed",
 *   "code": "AUTH_ERROR"
 * }
 * 
 * Response (400 Bad Request):
 * {
 *   "error": "Invalid request data",
 *   "code": "BAD_REQUEST"
 * }
 * 
 * Task 33.2: Accept HTTP POST requests at webhook URL, parse request body,
 * validate request against optional authentication, initiate workflow execution
 * 
 * Requirement 12: Webhook Trigger SHALL accept HTTP POST requests at the generated URL
 * Requirement 12: Webhook Trigger SHALL parse the request body (JSON or form data)
 * Requirement 12: Webhook Trigger SHALL validate the request against optional authentication configuration
 * Requirement 12: Webhook Trigger SHALL initiate workflow execution with the request data as input
 * Requirement 12: Webhook Trigger SHALL return HTTP 200 when workflow execution starts successfully
 * Requirement 12: Webhook Trigger SHALL return HTTP 401 when authentication fails
 * Requirement 12: Webhook Trigger SHALL return HTTP 400 when request data is malformed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; triggerId: string } }
) {
  try {
    const supabase = createServiceClient();
    const { id: workflowId, triggerId } = params;

    // Get trigger configuration from database
    const { data: triggerConfig, error: triggerError } = await supabase
      .from('trigger_configs')
      .select('*')
      .eq('id', triggerId)
      .eq('workflow_id', workflowId)
      .eq('type', 'webhook')
      .single();

    if (triggerError || !triggerConfig) {
      return ApiResponse.notFound('Webhook trigger not found');
    }

    // Check if trigger is active
    if (!triggerConfig.is_active) {
      return ApiResponse.badRequest('Webhook trigger is not active');
    }

    // Get request method
    const method = request.method;

    // Get request headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse request body based on content type
    let body: any;
    const contentType = headers['content-type'] || headers['Content-Type'] || '';

    try {
      if (contentType.includes('application/json')) {
        // Parse JSON body
        body = await request.json();
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        // Parse form data
        const formData = await request.formData();
        body = {};
        formData.forEach((value, key) => {
          body[key] = value;
        });
      } else if (contentType.includes('multipart/form-data')) {
        // Parse multipart form data
        const formData = await request.formData();
        body = {};
        formData.forEach((value, key) => {
          body[key] = value;
        });
      } else {
        // Try to parse as JSON by default
        const text = await request.text();
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            // If not JSON, store as text
            body = { data: text };
          }
        } else {
          body = {};
        }
      }
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return ApiResponse.badRequest('Invalid request data: Failed to parse request body');
    }

    // Get or create WebhookWorker instance
    let webhookWorker: WebhookWorker;

    // Check if trigger is registered in TriggerManager
    if (triggerManager.isRegistered(triggerId)) {
      // Get existing worker from TriggerManager (we need to access it)
      // Since TriggerManager doesn't expose workers, we'll create a new instance for validation
      webhookWorker = new WebhookWorker({
        id: triggerConfig.id,
        workflowId: triggerConfig.workflow_id,
        type: 'webhook',
        config: triggerConfig.config,
        isActive: triggerConfig.is_active,
        lastTriggeredAt: triggerConfig.last_triggered_at ? new Date(triggerConfig.last_triggered_at) : undefined,
        createdAt: new Date(triggerConfig.created_at),
        updatedAt: new Date(triggerConfig.updated_at),
      });
    } else {
      // Create new WebhookWorker instance for validation
      webhookWorker = new WebhookWorker({
        id: triggerConfig.id,
        workflowId: triggerConfig.workflow_id,
        type: 'webhook',
        config: triggerConfig.config,
        isActive: triggerConfig.is_active,
        lastTriggeredAt: triggerConfig.last_triggered_at ? new Date(triggerConfig.last_triggered_at) : undefined,
        createdAt: new Date(triggerConfig.created_at),
        updatedAt: new Date(triggerConfig.updated_at),
      });

      // Start the worker (this is a no-op for webhook workers but sets isActive flag)
      await webhookWorker.start();
    }

    // Validate request using WebhookWorker
    const validation = webhookWorker.validateRequest(method, headers, body);

    if (!validation.valid) {
      // Authentication or validation failed
      if (validation.error?.includes('API key') || validation.error?.includes('signature')) {
        return ApiResponse.unauthorized(validation.error || 'Authentication failed');
      }
      return ApiResponse.badRequest(validation.error || 'Invalid request');
    }

    // Prepare event data for workflow execution
    const eventData = {
      method,
      headers,
      body,
      timestamp: new Date().toISOString(),
      triggerId,
      workflowId,
    };

    // Trigger workflow execution using TriggerManager
    let executionId: string | null = null;

    try {
      // Get workflow to determine user_id
      const { data: workflow, error: workflowError } = await supabase
        .from('workflows')
        .select('user_id')
        .eq('id', workflowId)
        .single();

      if (workflowError || !workflow) {
        return ApiResponse.notFound('Workflow not found');
      }

      // Trigger execution through TriggerManager
      executionId = await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        workflow.user_id,
        eventData
      );

      // Update last_triggered_at timestamp
      await supabase
        .from('trigger_configs')
        .update({ last_triggered_at: new Date().toISOString() })
        .eq('id', triggerId);

      // Return success response
      return ApiResponse.success({
        success: true,
        message: 'Workflow execution started',
        executionId,
      });
    } catch (executionError) {
      console.error('Failed to trigger workflow execution:', executionError);
      return ApiResponse.error(
        'Failed to start workflow execution',
        500
      );
    }
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * GET /api/workflows/[id]/webhook/[triggerId]
 * 
 * Get webhook information (for testing/debugging)
 * 
 * Response (200 OK):
 * {
 *   "webhookUrl": "/api/workflows/[id]/webhook/[triggerId]",
 *   "workflowId": "uuid",
 *   "triggerId": "uuid",
 *   "isActive": true,
 *   "authType": "none" | "apiKey" | "signature",
 *   "allowedMethods": ["POST"],
 *   "allowedContentTypes": ["application/json", "application/x-www-form-urlencoded"]
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; triggerId: string } }
) {
  try {
    const supabase = createServiceClient();
    const { id: workflowId, triggerId } = params;

    // Get trigger configuration from database
    const { data: triggerConfig, error: triggerError } = await supabase
      .from('trigger_configs')
      .select('*')
      .eq('id', triggerId)
      .eq('workflow_id', workflowId)
      .eq('type', 'webhook')
      .single();

    if (triggerError || !triggerConfig) {
      return ApiResponse.notFound('Webhook trigger not found');
    }

    // Create WebhookWorker instance to get configuration
    const webhookWorker = new WebhookWorker({
      id: triggerConfig.id,
      workflowId: triggerConfig.workflow_id,
      type: 'webhook',
      config: triggerConfig.config,
      isActive: triggerConfig.is_active,
      lastTriggeredAt: triggerConfig.last_triggered_at ? new Date(triggerConfig.last_triggered_at) : undefined,
      createdAt: new Date(triggerConfig.created_at),
      updatedAt: new Date(triggerConfig.updated_at),
    });

    const webhookConfig = webhookWorker.getWebhookConfig();

    // Return webhook information
    return ApiResponse.success({
      webhookUrl: `/api/workflows/${workflowId}/webhook/${triggerId}`,
      workflowId,
      triggerId,
      isActive: triggerConfig.is_active,
      authType: webhookConfig.authType,
      allowedMethods: webhookConfig.allowedMethods,
      allowedContentTypes: webhookConfig.allowedContentTypes,
      maxBodySize: webhookConfig.maxBodySize,
      hasSecret: webhookConfig.hasSecret,
      hasApiKey: webhookConfig.hasApiKey,
      customHeadersCount: webhookConfig.customHeadersCount,
      lastTriggeredAt: triggerConfig.last_triggered_at,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
