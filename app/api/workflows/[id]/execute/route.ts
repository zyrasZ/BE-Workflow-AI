/**
 * Workflow Execution API Endpoint
 * 
 * POST /api/workflows/[id]/execute - Trigger workflow execution
 * 
 * Requirements: 11 (Manual Trigger), 19 (Workflow Executor)
 */

import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { WorkflowExecutor } from '@/lib/workflow-engine/executor';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/[id]/execute
 * 
 * Trigger manual execution of a workflow
 * 
 * Request Body:
 * {
 *   "input": {                    // Optional trigger input data
 *     "email": {...},             // For email trigger
 *     "data": {...}               // For manual trigger
 *   }
 * }
 * 
 * Response (202 Accepted):
 * {
 *   "executionId": "uuid",
 *   "status": "running",
 *   "message": "Workflow execution started"
 * }
 * 
 * Requirement 11: Manual Trigger SHALL initiate workflow execution immediately
 * Requirement 19: Workflow Executor SHALL execute nodes efficiently
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const { id: workflowId } = params;

    // Parse request body
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is acceptable
    }

    const triggerInput = body.input || {};

    // Create execution record first
    const supabase = createServiceClient();
    const { data: execution, error: executionError } = await supabase
      .from('executions')
      .insert({
        workflow_id: workflowId,
        user_id: user.id,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (executionError || !execution) {
      throw new Error('Failed to create execution record');
    }

    const executionId = execution.id;

    // Execute workflow in background (fire and forget)
    // Pass existing execution ID to avoid creating duplicate records
    const executor = new WorkflowExecutor();
    executor.execute(workflowId, user.id, triggerInput, executionId).catch(error => {
      console.error('Workflow execution failed:', error);
      // Error is already logged in executor, no need to rethrow
    });

    // Return 202 Accepted immediately with execution ID
    return ApiResponse.success(
      {
        executionId,
        status: 'running',
        message: 'Workflow execution started',
      },
      202
    );
  } catch (error) {
    return errorResponse(error);
  }
}
