import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { validateRequired, errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

// GET /api/executions - List user's executions
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();

    // Get query params
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get('workflow_id');
    const status = searchParams.get('status');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate limit and offset
    if (limit < 1 || limit > 100) {
      return ApiResponse.badRequest('Limit must be between 1 and 100');
    }
    if (offset < 0) {
      return ApiResponse.badRequest('Offset must be non-negative');
    }

    // Build query
    let query = supabase
      .from('executions')
      .select(`
        id,
        workflow_id,
        status,
        started_at,
        completed_at,
        error,
        workflows (
          name
        )
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Add filters
    if (workflowId) {
      query = query.eq('workflow_id', workflowId);
    }
    if (status) {
      // Validate status value
      if (!['running', 'completed', 'failed'].includes(status)) {
        return ApiResponse.badRequest('Invalid status. Must be: running, completed, or failed');
      }
      query = query.eq('status', status);
    }
    if (startDate) {
      // Validate date format
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return ApiResponse.badRequest('Invalid start_date format. Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)');
      }
      query = query.gte('started_at', start.toISOString());
    }
    if (endDate) {
      // Validate date format
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return ApiResponse.badRequest('Invalid end_date format. Use ISO 8601 format (e.g., 2024-01-31T23:59:59Z)');
      }
      query = query.lte('started_at', end.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      return ApiResponse.error(error.message, 500);
    }

    // Calculate duration for each execution
    const executions = (data || []).map((exec: any) => {
      let duration = null;
      if (exec.started_at && exec.completed_at) {
        const start = new Date(exec.started_at).getTime();
        const end = new Date(exec.completed_at).getTime();
        duration = (end - start) / 1000; // seconds
      }

      return {
        id: exec.id,
        workflow_id: exec.workflow_id,
        workflow_name: exec.workflows?.name || 'Unknown',
        status: exec.status,
        started_at: exec.started_at,
        completed_at: exec.completed_at,
        duration,
        error: exec.error,
      };
    });

    return ApiResponse.success({
      executions,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/executions - Create execution record
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const body = await request.json();

    const { workflow_id, status = 'running' } = body;

    // Validation
    validateRequired({ workflow_id }, ['workflow_id']);

    // Verify workflow exists and belongs to user
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', workflow_id)
      .eq('user_id', user.id)
      .single();

    if (workflowError || !workflow) {
      return ApiResponse.notFound('Workflow not found');
    }

    // Create execution record
    const { data, error } = await supabase
      .from('executions')
      .insert({
        workflow_id,
        user_id: user.id,
        status,
      })
      .select()
      .single();

    if (error) {
      return ApiResponse.error(error.message, 500);
    }

    return ApiResponse.success(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
