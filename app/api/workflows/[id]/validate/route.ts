/**
 * Workflow Validation API Endpoint
 * 
 * GET /api/workflows/[id]/validate - Validate workflow before execution
 * 
 * Requirement 26: Workflow Validation
 */

import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { validateWorkflow, WorkflowDefinition } from '@/lib/workflow-engine/validator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workflows/[id]/validate
 * 
 * Validate a workflow definition before execution
 * 
 * Response:
 * {
 *   "valid": true,
 *   "errors": [],
 *   "warnings": [
 *     {
 *       "nodeId": "node-3",
 *       "type": "missing-config",
 *       "message": "Code node has empty code field"
 *     }
 *   ]
 * }
 * 
 * Requirement 26: System SHALL provide a validation API for workflow definitions
 * Requirement 26: System SHALL validate that all nodes have valid types registered in the Node_Registry
 * Requirement 26: System SHALL validate that all node configurations match their schema requirements
 * Requirement 26: System SHALL validate that all edges connect to valid node input and output ports
 * Requirement 26: System SHALL detect circular dependencies in the workflow graph
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id: workflowId } = await params;

    // Load workflow from database
    const { data: workflow, error: loadError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single();

    if (loadError || !workflow) {
      return ApiResponse.notFound('Workflow not found');
    }

    // Validate workflow structure
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      return ApiResponse.badRequest('Workflow must have a nodes array');
    }

    if (!workflow.edges || !Array.isArray(workflow.edges)) {
      return ApiResponse.badRequest('Workflow must have an edges array');
    }

    // Build workflow definition for validator
    const workflowDefinition: WorkflowDefinition = {
      nodes: workflow.nodes,
      edges: workflow.edges,
    };

    // Validate workflow
    const validationResult = validateWorkflow(workflowDefinition);

    // Return validation result
    return ApiResponse.success({
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings || [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
