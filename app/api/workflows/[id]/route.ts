import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { validateRequired, errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

// GET /api/workflows/[id] - Get single workflow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id } = await params;

    // Select all fields including metadata, created_at, updated_at
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return ApiResponse.notFound('Workflow not found');
    }

    return ApiResponse.success(data);
  } catch (error) {
    return errorResponse(error);
  }
}

// PUT /api/workflows/[id] - Update workflow
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id } = await params;
    const body = await request.json();

    const { name, description, nodes, edges, metadata } = body;

    // Check ownership and get current workflow
    const { data: existing, error: checkError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (checkError || !existing) {
      return ApiResponse.notFound('Workflow not found');
    }

    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) {
      if (!Array.isArray(nodes)) {
        return ApiResponse.badRequest('Nodes must be an array');
      }
      updateData.nodes = nodes;
    }
    if (edges !== undefined) {
      if (!Array.isArray(edges)) {
        return ApiResponse.badRequest('Edges must be an array');
      }
      updateData.edges = edges;
    }
    
    // Handle metadata update with version increment
    if (metadata !== undefined || Object.keys(updateData).length > 0) {
      const currentMetadata = existing.metadata || {};
      const currentVersion = currentMetadata.version || 1;
      
      updateData.metadata = {
        ...currentMetadata,
        ...(metadata || {}),
        author: currentMetadata.author || user.email || user.id,
        version: currentVersion + 1,
        tags: metadata?.tags || currentMetadata.tags || [],
      };
    }

    // Update workflow (updated_at is auto-updated by database trigger)
    const { data, error } = await supabase
      .from('workflows')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return ApiResponse.error(error.message, 500);
    }

    return ApiResponse.success(data);
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/workflows/[id] - Delete workflow
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const { id } = await params;

    // Check ownership
    const { data: existing, error: checkError } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (checkError || !existing) {
      return ApiResponse.notFound('Workflow not found');
    }

    // Delete workflow (will cascade delete executions)
    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return ApiResponse.error(error.message, 500);
    }

    return ApiResponse.success({ success: true, deleted_id: id });
  } catch (error) {
    return errorResponse(error);
  }
}
