import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workflows/[id]/export - Export workflow definition as JSON
 * 
 * Requirement 29: Workflow Import and Export
 * - Returns workflow definition as JSON including metadata, nodes, edges, configurations
 * - Supports exporting multiple workflows via query parameter
 * - Includes export timestamp and version information
 * 
 * Query Parameters:
 * - ids: Comma-separated list of workflow IDs to export multiple workflows
 * 
 * Response Format (single workflow):
 * {
 *   exportVersion: "1.0",
 *   exportedAt: "2024-01-01T00:00:00.000Z",
 *   workflow: {
 *     id: "uuid",
 *     name: "Workflow Name",
 *     description: "Description",
 *     nodes: [...],
 *     edges: [...],
 *     metadata: {...},
 *     created_at: "...",
 *     updated_at: "..."
 *   }
 * }
 * 
 * Response Format (multiple workflows):
 * {
 *   exportVersion: "1.0",
 *   exportedAt: "2024-01-01T00:00:00.000Z",
 *   workflows: [...]
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id } = params;

    // Check if multiple workflows are requested via query parameter
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');

    // If 'ids' query parameter is provided, export multiple workflows
    if (idsParam) {
      const workflowIds = idsParam.split(',').map(id => id.trim()).filter(Boolean);
      
      if (workflowIds.length === 0) {
        return ApiResponse.badRequest('No valid workflow IDs provided');
      }

      // Fetch all requested workflows
      const { data: workflows, error } = await supabase
        .from('workflows')
        .select('id, name, description, nodes, edges, metadata, created_at, updated_at')
        .in('id', workflowIds)
        .eq('user_id', user.id);

      if (error) {
        return ApiResponse.error(error.message, 500);
      }

      if (!workflows || workflows.length === 0) {
        return ApiResponse.notFound('No workflows found with the provided IDs');
      }

      // Return multiple workflows export format
      const exportData = {
        exportVersion: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: user.email || user.id,
        count: workflows.length,
        workflows: workflows.map(workflow => ({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          nodes: workflow.nodes || [],
          edges: workflow.edges || [],
          metadata: {
            ...(workflow.metadata || {}),
            originalId: workflow.id,
            exportedAt: new Date().toISOString(),
          },
          created_at: workflow.created_at,
          updated_at: workflow.updated_at,
        })),
      };

      return ApiResponse.success(exportData);
    }

    // Single workflow export
    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('id, name, description, nodes, edges, metadata, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !workflow) {
      return ApiResponse.notFound('Workflow not found');
    }

    // Construct export data with complete workflow definition
    const exportData = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.email || user.id,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes || [],
        edges: workflow.edges || [],
        metadata: {
          ...(workflow.metadata || {}),
          author: (workflow.metadata as any)?.author || user.email || user.id,
          version: (workflow.metadata as any)?.version || 1,
          tags: (workflow.metadata as any)?.tags || [],
          originalId: workflow.id,
          exportedAt: new Date().toISOString(),
        },
        created_at: workflow.created_at,
        updated_at: workflow.updated_at,
      },
    };

    return ApiResponse.success(exportData);
  } catch (error) {
    return errorResponse(error);
  }
}
