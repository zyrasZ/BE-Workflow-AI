/**
 * Trigger Management API Endpoints
 * 
 * POST /api/workflows/[id]/triggers - Create trigger configuration
 * GET /api/workflows/[id]/triggers - List trigger configurations
 * 
 * Requirement 22: Trigger Manager - Event Monitoring
 */

import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { validateRequired, errorResponse } from '@/lib/utils/errors';
import { triggerManager } from '@/lib/workflow-engine/triggers/trigger-manager';
import { TriggerConfig } from '@/lib/workflow-engine/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/[id]/triggers
 * 
 * Create a new trigger configuration for a workflow
 * 
 * Request Body:
 * {
 *   "type": "schedule" | "email" | "webhook" | "manual",
 *   "config": {
 *     // For schedule: { cronExpression: string, timezone?: string }
 *     // For email: { emailAccountId: string, filters: {...} }
 *     // For webhook: { secret?: string, authType?: string }
 *     // For manual: {}
 *   },
 *   "is_active": boolean  // Optional, defaults to true
 * }
 * 
 * Response (201 Created):
 * {
 *   "id": "uuid",
 *   "workflow_id": "uuid",
 *   "type": "schedule",
 *   "config": {...},
 *   "is_active": true,
 *   "created_at": "timestamp",
 *   "updated_at": "timestamp"
 * }
 * 
 * Task 31.1: Accept trigger configuration, validate, save to database, register with TriggerManager
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id: workflowId } = await params;

    // Parse request body
    const body = await request.json();
    const { type, config, is_active } = body;

    // Validate required fields
    validateRequired({ type, config }, ['type', 'config']);

    // Validate trigger type
    const validTypes = ['manual', 'schedule', 'email', 'webhook'];
    if (!validTypes.includes(type)) {
      return ApiResponse.badRequest(
        `Invalid trigger type. Must be one of: ${validTypes.join(', ')}`
      );
    }

    // Validate config is an object
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      return ApiResponse.badRequest('Config must be an object');
    }

    // Validate type-specific configuration
    const configValidation = validateTriggerConfig(type, config);
    if (!configValidation.valid) {
      return ApiResponse.badRequest(configValidation.error || 'Invalid trigger configuration');
    }

    // Check if workflow exists and user has access
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single();

    if (workflowError || !workflow) {
      return ApiResponse.notFound('Workflow not found');
    }

    // Insert trigger configuration into database
    const { data: triggerConfig, error: insertError } = await supabase
      .from('trigger_configs')
      .insert({
        workflow_id: workflowId,
        type,
        config,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create trigger config:', insertError);
      return ApiResponse.error(insertError.message, 500);
    }

    // Register trigger with TriggerManager if active
    if (triggerConfig.is_active) {
      try {
        await triggerManager.register({
          id: triggerConfig.id,
          workflowId: triggerConfig.workflow_id,
          type: triggerConfig.type as 'manual' | 'schedule' | 'email' | 'webhook',
          config: triggerConfig.config,
          isActive: triggerConfig.is_active,
          lastTriggeredAt: triggerConfig.last_triggered_at ? new Date(triggerConfig.last_triggered_at) : undefined,
          createdAt: new Date(triggerConfig.created_at),
          updatedAt: new Date(triggerConfig.updated_at),
        });
      } catch (registerError) {
        console.error('Failed to register trigger with TriggerManager:', registerError);
        // Don't fail the request - trigger is saved in DB and can be registered later
      }
    }

    return ApiResponse.success(triggerConfig, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * GET /api/workflows/[id]/triggers
 * 
 * List all trigger configurations for a workflow
 * 
 * Response (200 OK):
 * {
 *   "triggers": [
 *     {
 *       "id": "uuid",
 *       "workflow_id": "uuid",
 *       "type": "schedule",
 *       "config": {...},
 *       "is_active": true,
 *       "last_triggered_at": "timestamp",
 *       "created_at": "timestamp",
 *       "updated_at": "timestamp"
 *     }
 *   ]
 * }
 * 
 * Task 31.2: Query trigger_configs for workflow and return list
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id: workflowId } = await params;

    // Check if workflow exists and user has access
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single();

    if (workflowError || !workflow) {
      return ApiResponse.notFound('Workflow not found');
    }

    // Query trigger configurations
    const { data: triggers, error: queryError } = await supabase
      .from('trigger_configs')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('Failed to query trigger configs:', queryError);
      return ApiResponse.error(queryError.message, 500);
    }

    return ApiResponse.success({
      triggers: triggers || [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Validate trigger configuration based on type
 * 
 * @param type - Trigger type
 * @param config - Configuration object
 * @returns Validation result
 */
function validateTriggerConfig(
  type: string,
  config: Record<string, any>
): { valid: boolean; error?: string } {
  switch (type) {
    case 'manual':
      // Manual triggers don't require specific configuration
      return { valid: true };

    case 'schedule':
      // Schedule triggers require cronExpression
      if (!config.cronExpression || typeof config.cronExpression !== 'string') {
        return {
          valid: false,
          error: 'Schedule trigger requires cronExpression (string)',
        };
      }
      // Basic cron expression validation (5 or 6 fields)
      const cronParts = config.cronExpression.trim().split(/\s+/);
      if (cronParts.length < 5 || cronParts.length > 6) {
        return {
          valid: false,
          error: 'Invalid cron expression format. Expected 5 or 6 fields.',
        };
      }
      return { valid: true };

    case 'email':
      // Email triggers require emailAccountId
      if (!config.emailAccountId || typeof config.emailAccountId !== 'string') {
        return {
          valid: false,
          error: 'Email trigger requires emailAccountId (string)',
        };
      }
      // Filters are optional but should be an object if provided
      if (config.filters !== undefined && typeof config.filters !== 'object') {
        return {
          valid: false,
          error: 'Email trigger filters must be an object',
        };
      }
      return { valid: true };

    case 'webhook':
      // Webhook triggers have optional configuration
      if (config.authType !== undefined) {
        const validAuthTypes = ['none', 'apiKey', 'signature'];
        if (!validAuthTypes.includes(config.authType)) {
          return {
            valid: false,
            error: `Webhook authType must be one of: ${validAuthTypes.join(', ')}`,
          };
        }
      }
      return { valid: true };

    default:
      return {
        valid: false,
        error: `Unknown trigger type: ${type}`,
      };
  }
}
