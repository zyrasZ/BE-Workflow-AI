/**
 * Individual Trigger Management API Endpoints
 * 
 * PATCH /api/workflows/[id]/triggers/[triggerId] - Update trigger configuration
 * DELETE /api/workflows/[id]/triggers/[triggerId] - Delete trigger configuration
 * 
 * Requirement 22: Trigger Manager - Event Monitoring
 */

import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { triggerManager } from '@/lib/workflow-engine/triggers/trigger-manager';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/workflows/[id]/triggers/[triggerId]
 * 
 * Update an existing trigger configuration
 * 
 * Request Body:
 * {
 *   "type": "schedule" | "email" | "webhook" | "manual",  // Optional
 *   "config": {...},  // Optional
 *   "is_active": boolean  // Optional
 * }
 * 
 * Response (200 OK):
 * {
 *   "id": "uuid",
 *   "workflow_id": "uuid",
 *   "type": "schedule",
 *   "config": {...},
 *   "is_active": true,
 *   "last_triggered_at": "timestamp",
 *   "created_at": "timestamp",
 *   "updated_at": "timestamp"
 * }
 * 
 * Task 31.3: Update trigger configuration, unregister old trigger, register updated trigger
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; triggerId: string }> }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id: workflowId, triggerId } = await params;

    // Parse request body
    const body = await request.json();
    const { type, config, is_active } = body;

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

    // Get existing trigger configuration
    const { data: existingTrigger, error: getTriggerError } = await supabase
      .from('trigger_configs')
      .select('*')
      .eq('id', triggerId)
      .eq('workflow_id', workflowId)
      .single();

    if (getTriggerError || !existingTrigger) {
      return ApiResponse.notFound('Trigger configuration not found');
    }

    // Prepare update data
    const updateData: Record<string, any> = {};

    // Validate and update type if provided
    if (type !== undefined) {
      const validTypes = ['manual', 'schedule', 'email', 'webhook'];
      if (!validTypes.includes(type)) {
        return ApiResponse.badRequest(
          `Invalid trigger type. Must be one of: ${validTypes.join(', ')}`
        );
      }
      updateData.type = type;
    }

    // Validate and update config if provided
    if (config !== undefined) {
      if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        return ApiResponse.badRequest('Config must be an object');
      }

      // Validate type-specific configuration
      const typeToValidate = type || existingTrigger.type;
      const configValidation = validateTriggerConfig(typeToValidate, config);
      if (!configValidation.valid) {
        return ApiResponse.badRequest(configValidation.error || 'Invalid trigger configuration');
      }

      updateData.config = config;
    }

    // Update is_active if provided
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return ApiResponse.badRequest('is_active must be a boolean');
      }
      updateData.is_active = is_active;
    }

    // If no updates provided, return error
    if (Object.keys(updateData).length === 0) {
      return ApiResponse.badRequest('No update fields provided');
    }

    // Unregister old trigger from TriggerManager if it was active
    if (existingTrigger.is_active && triggerManager.isRegistered(triggerId)) {
      try {
        await triggerManager.unregister(triggerId);
      } catch (unregisterError) {
        console.error('Failed to unregister trigger from TriggerManager:', unregisterError);
        // Continue with update even if unregister fails
      }
    }

    // Update trigger configuration in database
    const { data: updatedTrigger, error: updateError } = await supabase
      .from('trigger_configs')
      .update(updateData)
      .eq('id', triggerId)
      .eq('workflow_id', workflowId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update trigger config:', updateError);
      return ApiResponse.error(updateError.message, 500);
    }

    // Register updated trigger with TriggerManager if active
    if (updatedTrigger.is_active) {
      try {
        await triggerManager.register({
          id: updatedTrigger.id,
          workflowId: updatedTrigger.workflow_id,
          type: updatedTrigger.type as 'manual' | 'schedule' | 'email' | 'webhook',
          config: updatedTrigger.config,
          isActive: updatedTrigger.is_active,
          lastTriggeredAt: updatedTrigger.last_triggered_at ? new Date(updatedTrigger.last_triggered_at) : undefined,
          createdAt: new Date(updatedTrigger.created_at),
          updatedAt: new Date(updatedTrigger.updated_at),
        });
      } catch (registerError) {
        console.error('Failed to register updated trigger with TriggerManager:', registerError);
        // Don't fail the request - trigger is saved in DB and can be registered later
      }
    }

    return ApiResponse.success(updatedTrigger);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/workflows/[id]/triggers/[triggerId]
 * 
 * Delete a trigger configuration
 * 
 * Response (200 OK):
 * {
 *   "success": true,
 *   "deleted_id": "uuid",
 *   "message": "Trigger configuration deleted successfully"
 * }
 * 
 * Task 31.4: Unregister trigger from TriggerManager and delete from database
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; triggerId: string }> }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id: workflowId, triggerId } = await params;

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

    // Get existing trigger configuration
    const { data: existingTrigger, error: getTriggerError } = await supabase
      .from('trigger_configs')
      .select('*')
      .eq('id', triggerId)
      .eq('workflow_id', workflowId)
      .single();

    if (getTriggerError || !existingTrigger) {
      return ApiResponse.notFound('Trigger configuration not found');
    }

    // Unregister trigger from TriggerManager if it was active
    if (existingTrigger.is_active && triggerManager.isRegistered(triggerId)) {
      try {
        await triggerManager.unregister(triggerId);
      } catch (unregisterError) {
        console.error('Failed to unregister trigger from TriggerManager:', unregisterError);
        // Continue with deletion even if unregister fails
      }
    }

    // Delete trigger configuration from database
    const { error: deleteError } = await supabase
      .from('trigger_configs')
      .delete()
      .eq('id', triggerId)
      .eq('workflow_id', workflowId);

    if (deleteError) {
      console.error('Failed to delete trigger config:', deleteError);
      return ApiResponse.error(deleteError.message, 500);
    }

    return ApiResponse.success({
      success: true,
      deleted_id: triggerId,
      message: 'Trigger configuration deleted successfully',
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
