/**
 * Node Types API Endpoint
 * 
 * GET /api/node-types - List all available node types
 * 
 * Requirement 20: Node Registry and SDK
 */

import { NextRequest } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/node-types
 * 
 * List all available node types with their schemas
 * 
 * Query Parameters:
 * - category: Filter by category (logic, data, trigger, action)
 * - is_system: Filter by system vs custom nodes (true/false)
 * 
 * Response:
 * {
 *   "nodes": [
 *     {
 *       "type": "if-else",
 *       "name": "If/Else Branch",
 *       "category": "logic",
 *       "description": "Route execution based on conditions",
 *       "configSchema": {...},
 *       "inputSchema": {...},
 *       "outputSchema": {...},
 *       "isSystem": true
 *     },
 *     ...
 *   ]
 * }
 * 
 * Requirement 20: Node Registry SHALL provide an API to query available node types
 * Requirement 20: Node Registry SHALL store node metadata (name, category, description, input schema, output schema)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const isSystemParam = searchParams.get('is_system');

    // Build query
    let query = supabase
      .from('node_types')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (isSystemParam !== null) {
      const isSystem = isSystemParam === 'true';
      query = query.eq('is_system', isSystem);
    }

    const { data, error } = await query;

    if (error) {
      return ApiResponse.error(error.message, 500);
    }

    // Transform data to match API response format
    const nodes = (data || []).map((node: any) => ({
      type: node.type,
      name: node.name,
      category: node.category,
      description: node.description,
      configSchema: node.config_schema,
      inputSchema: node.input_schema,
      outputSchema: node.output_schema,
      isSystem: node.is_system,
      createdAt: node.created_at,
      updatedAt: node.updated_at,
    }));

    return ApiResponse.success({ nodes });
  } catch (error) {
    return errorResponse(error);
  }
}
