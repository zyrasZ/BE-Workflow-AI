import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { validateRequired, errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

// GET /api/executions/[id] - Get execution details with logs
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id } = params;

    // Fetch execution with workflow details
    const { data, error } = await supabase
      .from('executions')
      .select(`
        id,
        workflow_id,
        status,
        results,
        error,
        started_at,
        completed_at,
        workflows (
          name,
          description
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return ApiResponse.notFound('Execution not found');
    }

    // Fetch execution logs for this execution
    const { data: logs, error: logsError } = await supabase
      .from('execution_logs')
      .select('*')
      .eq('execution_id', id)
      .order('started_at', { ascending: true });

    if (logsError) {
      console.error('Error fetching execution logs:', logsError);
      // Don't fail the request if logs can't be fetched
    }

    // Calculate duration
    let duration = null;
    if (data.started_at && data.completed_at) {
      const start = new Date(data.started_at).getTime();
      const end = new Date(data.completed_at).getTime();
      duration = (end - start) / 1000; // seconds
    }

    // Type assertion for workflows relation (Supabase returns array for relations)
    const workflows = Array.isArray(data.workflows) && data.workflows.length > 0 
      ? data.workflows[0] as { name: string; description: string }
      : null;

    const execution = {
      id: data.id,
      workflow_id: data.workflow_id,
      workflow_name: workflows?.name || 'Unknown',
      workflow_description: workflows?.description || null,
      status: data.status,
      results: data.results,
      error: data.error,
      started_at: data.started_at,
      completed_at: data.completed_at,
      duration,
      logs: logs || [],
    };

    return ApiResponse.success(execution);
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/executions/[id] - Update execution status and results
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id } = params;
    const body = await request.json();

    const { status, results, error: executionError } = body;

    // Validation - at least one field must be provided
    if (!status && !results && executionError === undefined) {
      return ApiResponse.badRequest('At least one field (status, results, error) must be provided');
    }

    // Validate status if provided
    if (status && !['running', 'completed', 'failed'].includes(status)) {
      return ApiResponse.badRequest('Invalid status. Must be: running, completed, or failed');
    }

    // Verify execution exists and belongs to user
    const { data: existingExecution, error: fetchError } = await supabase
      .from('executions')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingExecution) {
      return ApiResponse.notFound('Execution not found');
    }

    // Build update object
    const updates: any = {};
    
    if (status) {
      updates.status = status;
      
      // Auto-set completed_at when status changes to completed or failed
      if ((status === 'completed' || status === 'failed') && existingExecution.status === 'running') {
        updates.completed_at = new Date().toISOString();
      }
    }
    
    if (results !== undefined) {
      updates.results = results;
    }
    
    if (executionError !== undefined) {
      updates.error = executionError;
    }

    // Update execution
    const { data, error: updateError } = await supabase
      .from('executions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      return ApiResponse.error(updateError.message, 500);
    }

    return ApiResponse.success(data);
  } catch (error) {
    return errorResponse(error);
  }
}
