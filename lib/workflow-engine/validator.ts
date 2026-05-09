/**
 * Workflow Validator for Workflow Automation System
 * 
 * This module implements workflow validation logic to ensure workflows are
 * correctly configured before execution. It validates:
 * - Graph structure (no cycles)
 * - Node types exist in registry
 * - Node configurations match schemas
 * - Edges connect to valid nodes
 * 
 * Requirement 26: Workflow Validation
 */

import { nodeRegistry } from './registry';
import { ValidationResult } from './types';

/**
 * Represents a node in the workflow graph
 */
export interface WorkflowNode {
  id: string;
  type: string;
  config: Record<string, any>;
  position?: { x: number; y: number };
}

/**
 * Represents an edge connecting two nodes
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Workflow definition structure
 */
export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /**
   * Global error handler node ID
   * When specified, this node will execute if any node fails
   * 
   * Requirement 25: Workflow Executor SHALL support global error handlers that execute when any node fails
   */
  globalErrorHandler?: string;
}

/**
 * Validation error with context
 * 
 * Requirement 26: System SHALL return a list of validation errors with node identifiers and error descriptions
 */
export interface ValidationError {
  /**
   * Node ID where the error occurred (if applicable)
   */
  nodeId?: string;

  /**
   * Edge ID where the error occurred (if applicable)
   */
  edgeId?: string;

  /**
   * Error type/category
   */
  type: 'cycle' | 'missing-node-type' | 'invalid-config' | 'invalid-edge' | 'missing-node';

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Additional error details
   */
  details?: any;
}

/**
 * Workflow validation result
 * 
 * Requirement 26: System SHALL provide a validation API for workflow definitions
 */
export interface WorkflowValidationResult {
  /**
   * Whether the workflow is valid
   */
  valid: boolean;

  /**
   * List of validation errors
   */
  errors: ValidationError[];

  /**
   * Optional warnings (non-blocking issues)
   */
  warnings?: ValidationError[];
}

/**
 * Validates a workflow definition
 * 
 * @param workflow - Workflow definition to validate
 * @returns Validation result with errors and warnings
 * 
 * Requirement 26: System SHALL validate that all nodes have valid types registered in the Node_Registry
 * Requirement 26: System SHALL validate that all node configurations match their schema requirements
 * Requirement 26: System SHALL validate that all edges connect to valid node input and output ports
 * Requirement 26: System SHALL detect circular dependencies in the workflow graph
 */
export function validateWorkflow(workflow: WorkflowDefinition): WorkflowValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate workflow structure
  if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
    errors.push({
      type: 'missing-node',
      message: 'Workflow must have a nodes array',
    });
    return { valid: false, errors, warnings };
  }

  if (!workflow.edges || !Array.isArray(workflow.edges)) {
    errors.push({
      type: 'invalid-edge',
      message: 'Workflow must have an edges array',
    });
    return { valid: false, errors, warnings };
  }

  // Validate nodes exist and have valid types
  const nodeValidationErrors = validateNodes(workflow.nodes);
  errors.push(...nodeValidationErrors);

  // Validate edges connect to valid nodes
  const edgeValidationErrors = validateEdges(workflow.edges, workflow.nodes);
  errors.push(...edgeValidationErrors);

  // Detect cycles in the workflow graph
  const cycleErrors = detectCycles(workflow.nodes, workflow.edges);
  errors.push(...cycleErrors);

  // Validate node configurations against schemas
  const configErrors = validateNodeConfigurations(workflow.nodes);
  errors.push(...configErrors);

  // [FIXED - Bug 15] Validate globalErrorHandler references an existing node
  if (workflow.globalErrorHandler) {
    const nodeIds = new Set(workflow.nodes.map(n => n.id));
    if (!nodeIds.has(workflow.globalErrorHandler)) {
      errors.push({
        type: 'invalid-config',
        message: `globalErrorHandler references non-existent node: '${workflow.globalErrorHandler}'`,
        details: { globalErrorHandler: workflow.globalErrorHandler },
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that all nodes have valid types in the registry
 * 
 * @param nodes - Array of workflow nodes
 * @returns Array of validation errors
 * 
 * Requirement 26: System SHALL validate that all nodes have valid types registered in the Node_Registry
 */
function validateNodes(nodes: WorkflowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    // Check node has required fields
    if (!node.id) {
      errors.push({
        type: 'missing-node',
        message: 'Node is missing required field: id',
        details: { node },
      });
      continue;
    }

    if (!node.type) {
      errors.push({
        nodeId: node.id,
        type: 'missing-node-type',
        message: `Node '${node.id}' is missing required field: type`,
      });
      continue;
    }

    // Check node type exists in registry
    if (!nodeRegistry.has(node.type)) {
      errors.push({
        nodeId: node.id,
        type: 'missing-node-type',
        message: `Node '${node.id}' has unknown type: '${node.type}'`,
        details: { availableTypes: nodeRegistry.list().map(n => n.type) },
      });
    }
  }

  return errors;
}

/**
 * Validate that all edges connect to valid nodes
 * 
 * @param edges - Array of workflow edges
 * @param nodes - Array of workflow nodes
 * @returns Array of validation errors
 * 
 * Requirement 26: System SHALL validate that all edges connect to valid node input and output ports
 */
function validateEdges(edges: WorkflowEdge[], nodes: WorkflowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const edge of edges) {
    // Check edge has required fields
    if (!edge.id) {
      errors.push({
        type: 'invalid-edge',
        message: 'Edge is missing required field: id',
        details: { edge },
      });
      continue;
    }

    if (!edge.source) {
      errors.push({
        edgeId: edge.id,
        type: 'invalid-edge',
        message: `Edge '${edge.id}' is missing required field: source`,
      });
      continue;
    }

    if (!edge.target) {
      errors.push({
        edgeId: edge.id,
        type: 'invalid-edge',
        message: `Edge '${edge.id}' is missing required field: target`,
      });
      continue;
    }

    // Check source node exists
    if (!nodeIds.has(edge.source)) {
      errors.push({
        edgeId: edge.id,
        type: 'invalid-edge',
        message: `Edge '${edge.id}' references non-existent source node: '${edge.source}'`,
      });
    }

    // Check target node exists
    if (!nodeIds.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        type: 'invalid-edge',
        message: `Edge '${edge.id}' references non-existent target node: '${edge.target}'`,
      });
    }

    // Check for self-loops
    if (edge.source === edge.target) {
      errors.push({
        edgeId: edge.id,
        type: 'cycle',
        message: `Edge '${edge.id}' creates a self-loop on node '${edge.source}'`,
      });
    }
  }

  return errors;
}

/**
 * Detect cycles in the workflow graph using DFS
 * 
 * @param nodes - Array of workflow nodes
 * @param edges - Array of workflow edges
 * @returns Array of validation errors
 * 
 * Requirement 26: System SHALL detect circular dependencies in the workflow graph
 */
function detectCycles(nodes: WorkflowNode[], edges: WorkflowEdge[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const neighbors = adjacency.get(edge.source);
    if (neighbors) {
      neighbors.push(edge.target);
    }
  }

  // DFS state tracking
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cyclePath: string[] = [];

  /**
   * DFS helper function to detect cycles
   * 
   * @param nodeId - Current node being visited
   * @param path - Current path from root to this node
   * @returns True if a cycle is detected
   */
  function dfs(nodeId: string, path: string[]): boolean {
    // Mark node as visited and add to recursion stack
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    // Visit all neighbors
    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      // If neighbor is not visited, recurse
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, path)) {
          return true;
        }
      }
      // If neighbor is in recursion stack, we found a cycle
      else if (recursionStack.has(neighbor)) {
        // Build cycle path
        const cycleStartIndex = path.indexOf(neighbor);
        cyclePath.push(...path.slice(cycleStartIndex), neighbor);
        return true;
      }
    }

    // Remove from recursion stack before backtracking
    recursionStack.delete(nodeId);
    path.pop();
    return false;
  }

  // Run DFS from each unvisited node
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id, [])) {
        errors.push({
          type: 'cycle',
          message: `Workflow contains a cycle: ${cyclePath.join(' → ')}`,
          details: { cyclePath },
        });
        // Only report the first cycle found
        break;
      }
    }
  }

  return errors;
}

/**
 * Validate node configurations against their schemas
 * 
 * @param nodes - Array of workflow nodes
 * @returns Array of validation errors
 * 
 * Requirement 26: System SHALL validate that all node configurations match their schema requirements
 */
function validateNodeConfigurations(nodes: WorkflowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    // Skip if node type is invalid (already reported)
    if (!nodeRegistry.has(node.type)) {
      continue;
    }

    try {
      // Get node instance from registry
      const nodeInstance = nodeRegistry.create(node.type);

      // Validate configuration
      const config = node.config || {};
      const validationResult: ValidationResult = nodeInstance.validateConfig(config);

      // Add validation errors
      if (!validationResult.valid) {
        for (const error of validationResult.errors) {
          errors.push({
            nodeId: node.id,
            type: 'invalid-config',
            message: `Node '${node.id}' (${node.type}): ${error.message}`,
            details: {
              field: error.field,
              config,
            },
          });
        }
      }
    } catch (error) {
      // Handle unexpected errors during validation
      errors.push({
        nodeId: node.id,
        type: 'invalid-config',
        message: `Node '${node.id}' (${node.type}): Validation failed - ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  return errors;
}

/**
 * Validate a single node configuration
 * 
 * @param nodeType - Type of the node
 * @param config - Node configuration to validate
 * @returns Validation result
 * 
 * Utility function for validating individual node configs
 */
export function validateNodeConfig(
  nodeType: string,
  config: Record<string, any>
): ValidationResult {
  if (!nodeRegistry.has(nodeType)) {
    return {
      valid: false,
      errors: [
        {
          field: 'type',
          message: `Unknown node type: '${nodeType}'`,
        },
      ],
    };
  }

  try {
    const nodeInstance = nodeRegistry.create(nodeType);
    return nodeInstance.validateConfig(config);
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          field: 'config',
          message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
