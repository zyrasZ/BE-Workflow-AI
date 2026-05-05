import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * Workflow structure interface for validation
 */
interface WorkflowNode {
  id: string;
  type: string;
  [key: string]: any;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: any;
}

interface WorkflowDefinition {
  id?: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

interface ImportReport {
  success: boolean;
  successCount: number;
  failedCount: number;
  importedWorkflowIds: string[];
  errors: Array<{
    workflowName?: string;
    error: string;
  }>;
  warnings: Array<{
    workflowName: string;
    warning: string;
  }>;
  missingNodeTypes: string[];
}

/**
 * POST /api/workflows/import - Import workflow(s) from JSON
 * 
 * Requirement 29: Workflow Import and Export
 * - Accepts workflow JSON (single workflow or multiple workflows array)
 * - Validates workflow structure before importing
 * - Generates new unique identifiers for imported workflows
 * - Handles missing node types gracefully during import
 * - Provides a report of any issues encountered during import
 * 
 * Request Body Format (single workflow):
 * {
 *   workflow: {
 *     name: "Workflow Name",
 *     description: "Description",
 *     nodes: [...],
 *     edges: [...],
 *     metadata: {...}
 *   }
 * }
 * 
 * Request Body Format (multiple workflows):
 * {
 *   workflows: [...]
 * }
 * 
 * Response Format:
 * {
 *   success: boolean,
 *   successCount: number,
 *   failedCount: number,
 *   importedWorkflowIds: string[],
 *   errors: [...],
 *   warnings: [...],
 *   missingNodeTypes: string[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();
    const body = await request.json();

    // Initialize import report
    const report: ImportReport = {
      success: true,
      successCount: 0,
      failedCount: 0,
      importedWorkflowIds: [],
      errors: [],
      warnings: [],
      missingNodeTypes: [],
    };

    // Determine if single workflow or multiple workflows
    let workflowsToImport: WorkflowDefinition[] = [];

    if (body.workflow) {
      // Single workflow format
      workflowsToImport = [body.workflow];
    } else if (body.workflows && Array.isArray(body.workflows)) {
      // Multiple workflows format
      workflowsToImport = body.workflows;
    } else {
      return ApiResponse.badRequest(
        'Invalid request format. Expected { workflow: {...} } or { workflows: [...] }'
      );
    }

    if (workflowsToImport.length === 0) {
      return ApiResponse.badRequest('No workflows provided for import');
    }

    // Fetch all available node types from the registry
    const { data: nodeTypes, error: nodeTypesError } = await supabase
      .from('node_types')
      .select('type');

    if (nodeTypesError) {
      return ApiResponse.error('Failed to fetch node types registry', 500);
    }

    const availableNodeTypes = new Set(nodeTypes?.map(nt => nt.type) || []);

    // Process each workflow
    for (const workflow of workflowsToImport) {
      try {
        // Validate workflow structure
        const validationResult = validateWorkflowStructure(workflow);
        
        if (!validationResult.valid) {
          report.failedCount++;
          report.errors.push({
            workflowName: workflow.name || 'Unknown',
            error: validationResult.error || 'Invalid workflow structure',
          });
          continue;
        }

        // Check for missing node types
        const missingTypes = checkMissingNodeTypes(workflow.nodes, availableNodeTypes);
        
        if (missingTypes.length > 0) {
          // Add to missing node types list (unique)
          missingTypes.forEach(type => {
            if (!report.missingNodeTypes.includes(type)) {
              report.missingNodeTypes.push(type);
            }
          });

          // Add warning but continue with import
          report.warnings.push({
            workflowName: workflow.name,
            warning: `Missing node types: ${missingTypes.join(', ')}. Workflow imported but may not execute correctly.`,
          });
        }

        // Generate new UUIDs for workflow and nodes
        const { transformedWorkflow, idMapping } = generateNewIdentifiers(workflow);

        // Prepare workflow data for insertion
        const workflowData = {
          user_id: user.id,
          name: transformedWorkflow.name,
          description: transformedWorkflow.description || null,
          nodes: transformedWorkflow.nodes,
          edges: transformedWorkflow.edges,
          metadata: {
            ...(transformedWorkflow.metadata || {}),
            importedAt: new Date().toISOString(),
            importedBy: user.email || user.id,
            originalId: workflow.id || null,
          },
        };

        // Insert workflow into database
        const { data: insertedWorkflow, error: insertError } = await supabase
          .from('workflows')
          .insert(workflowData)
          .select('id')
          .single();

        if (insertError) {
          report.failedCount++;
          report.errors.push({
            workflowName: workflow.name,
            error: `Database insertion failed: ${insertError.message}`,
          });
          continue;
        }

        // Success
        report.successCount++;
        report.importedWorkflowIds.push(insertedWorkflow.id);

      } catch (error) {
        report.failedCount++;
        report.errors.push({
          workflowName: workflow.name || 'Unknown',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    // Set overall success flag
    report.success = report.failedCount === 0;

    // Return appropriate status code
    if (report.successCount === 0) {
      // All imports failed - return 400 with report in data field
      return NextResponse.json(
        { data: report, error: 'All workflow imports failed' },
        { status: 400 }
      );
    }

    if (report.failedCount > 0) {
      return ApiResponse.success(report, 207); // 207 Multi-Status (partial success)
    }

    return ApiResponse.success(report, 201);

  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Validate workflow structure
 */
function validateWorkflowStructure(workflow: any): { valid: boolean; error?: string } {
  // Check required fields
  if (!workflow.name || typeof workflow.name !== 'string') {
    return { valid: false, error: 'Workflow name is required and must be a string' };
  }

  if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
    return { valid: false, error: 'Workflow nodes are required and must be an array' };
  }

  if (!workflow.edges || !Array.isArray(workflow.edges)) {
    return { valid: false, error: 'Workflow edges are required and must be an array' };
  }

  // Validate nodes structure
  for (let i = 0; i < workflow.nodes.length; i++) {
    const node = workflow.nodes[i];
    
    if (!node.id || typeof node.id !== 'string') {
      return { valid: false, error: `Node at index ${i} is missing required 'id' field` };
    }

    if (!node.type || typeof node.type !== 'string') {
      return { valid: false, error: `Node '${node.id}' is missing required 'type' field` };
    }
  }

  // Validate edges structure
  const nodeIds = new Set(workflow.nodes.map((n: WorkflowNode) => n.id));

  for (let i = 0; i < workflow.edges.length; i++) {
    const edge = workflow.edges[i];

    if (!edge.id || typeof edge.id !== 'string') {
      return { valid: false, error: `Edge at index ${i} is missing required 'id' field` };
    }

    if (!edge.source || typeof edge.source !== 'string') {
      return { valid: false, error: `Edge '${edge.id}' is missing required 'source' field` };
    }

    if (!edge.target || typeof edge.target !== 'string') {
      return { valid: false, error: `Edge '${edge.id}' is missing required 'target' field` };
    }

    // Validate that source and target nodes exist
    if (!nodeIds.has(edge.source)) {
      return { valid: false, error: `Edge '${edge.id}' references non-existent source node '${edge.source}'` };
    }

    if (!nodeIds.has(edge.target)) {
      return { valid: false, error: `Edge '${edge.id}' references non-existent target node '${edge.target}'` };
    }
  }

  return { valid: true };
}

/**
 * Check for missing node types
 */
function checkMissingNodeTypes(
  nodes: WorkflowNode[],
  availableNodeTypes: Set<string>
): string[] {
  const missingTypes: string[] = [];
  const checkedTypes = new Set<string>();

  for (const node of nodes) {
    if (!checkedTypes.has(node.type)) {
      checkedTypes.add(node.type);
      
      if (!availableNodeTypes.has(node.type)) {
        missingTypes.push(node.type);
      }
    }
  }

  return missingTypes;
}

/**
 * Generate new UUIDs for workflow and nodes, update edge references
 */
function generateNewIdentifiers(workflow: WorkflowDefinition): {
  transformedWorkflow: WorkflowDefinition;
  idMapping: Map<string, string>;
} {
  const idMapping = new Map<string, string>();

  // Generate new node IDs
  const transformedNodes = workflow.nodes.map(node => {
    const newId = uuidv4();
    idMapping.set(node.id, newId);

    return {
      ...node,
      id: newId,
    };
  });

  // Update edge references with new node IDs
  const transformedEdges = workflow.edges.map(edge => {
    const newSourceId = idMapping.get(edge.source) || edge.source;
    const newTargetId = idMapping.get(edge.target) || edge.target;

    return {
      ...edge,
      id: uuidv4(), // Generate new edge ID as well
      source: newSourceId,
      target: newTargetId,
    };
  });

  return {
    transformedWorkflow: {
      ...workflow,
      nodes: transformedNodes,
      edges: transformedEdges,
    },
    idMapping,
  };
}
