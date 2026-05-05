/**
 * Execution Context Implementation
 * 
 * Manages runtime state during workflow execution, including:
 * - Global variables storage
 * - Node output data storage
 * - Expression resolution
 * - Execution path tracking
 * 
 * Requirement 21: Execution Context Management
 */

import { ExecutionContext } from './types';
import { resolveExpression as resolveExpr, buildExpressionScope } from './expression';

/**
 * Implementation of ExecutionContext interface
 * 
 * Requirement 21: Execution Context SHALL store all variables and data produced during workflow execution
 */
export class ExecutionContextImpl implements ExecutionContext {
  /**
   * User ID executing the workflow
   */
  public readonly userId: string;

  /**
   * Workflow ID being executed
   */
  public readonly workflowId: string;

  /**
   * Unique execution ID for this run
   */
  public readonly executionId: string;

  /**
   * Global variables storage
   * 
   * Requirement 21: Execution Context SHALL store all variables and data produced during workflow execution
   */
  public variables: Record<string, any>;

  /**
   * Output data from each executed node, keyed by node ID
   * 
   * Requirement 21: Execution Context SHALL store all variables and data produced during workflow execution
   */
  public nodeOutputs: Map<string, Record<string, any>>;

  /**
   * Current node being executed
   */
  public currentNodeId: string;

  /**
   * History of executed node IDs in order
   * 
   * Requirement 21: Execution Context SHALL maintain a history of all data changes for debugging
   */
  public executionPath: string[];

  /**
   * Create a new execution context
   * 
   * @param userId - User ID executing the workflow
   * @param workflowId - Workflow ID being executed
   * @param executionId - Unique execution ID for this run
   * 
   * Requirement 21: Execution Context SHALL be isolated between different workflow executions
   */
  constructor(userId: string, workflowId: string, executionId: string) {
    this.userId = userId;
    this.workflowId = workflowId;
    this.executionId = executionId;
    this.variables = {};
    this.nodeOutputs = new Map();
    this.currentNodeId = '';
    this.executionPath = [];
  }

  /**
   * Get output data from a specific node
   * 
   * @param nodeId - ID of the node to get output from
   * @returns Node output data or undefined if not found
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  getNodeOutput(nodeId: string): Record<string, any> | undefined {
    return this.nodeOutputs.get(nodeId);
  }

  /**
   * Set a global variable value
   * 
   * @param key - Variable name
   * @param value - Variable value
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  setVariable(key: string, value: any): void {
    this.variables[key] = value;
  }

  /**
   * Get a global variable value
   * 
   * @param key - Variable name
   * @returns Variable value or undefined if not found
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  getVariable(key: string): any {
    return this.variables[key];
  }

  /**
   * Resolve an expression using context data
   * Supports syntax like: {{variables.name}}, {{node-1.output.field}}
   * 
   * @param expr - Expression string to resolve
   * @returns Resolved value
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  resolveExpression(expr: string): any {
    // Build scope from current context
    const scope = buildExpressionScope(this.variables, this.nodeOutputs);
    
    // Use the expression resolver module
    return resolveExpr(expr, scope);
  }

  /**
   * Get value by path (e.g., "user.email", "variables.name")
   * 
   * @param path - Dot-separated path to value
   * @returns Value at path or undefined if not found
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  getValueByPath(path: string): any {
    const parts = path.split('.');
    let current: any = this;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }

      // Handle Map access for nodeOutputs
      if (current instanceof Map) {
        current = current.get(part);
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Set value by path (e.g., "variables.user.email")
   * 
   * @param path - Dot-separated path to value
   * @param value - Value to set
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  setValueByPath(path: string, value: any): void {
    const parts = path.split('.');
    
    if (parts.length === 0) {
      return;
    }

    // If path starts with 'variables', use variables object
    if (parts[0] === 'variables') {
      let current = this.variables;
      
      for (let i = 1; i < parts.length - 1; i++) {
        const part = parts[i];
        
        if (!(part in current) || typeof current[part] !== 'object') {
          current[part] = {};
        }
        
        current = current[part];
      }
      
      current[parts[parts.length - 1]] = value;
    } else {
      // For other paths, set directly on variables
      this.setVariable(path, value);
    }
  }

  /**
   * Merge data from multiple sources into the context
   * 
   * @param data - Data object to merge
   * 
   * Requirement 21: Execution Context SHALL provide a method to merge data from multiple sources
   */
  mergeData(data: Record<string, any>): void {
    this.variables = {
      ...this.variables,
      ...data,
    };
  }

  /**
   * Serialize context to JSON for persistence
   * 
   * @returns JSON-serializable object
   * 
   * Requirement 21: Execution Context SHALL support serialization to JSON for persistence
   */
  toJSON(): Record<string, any> {
    return {
      userId: this.userId,
      workflowId: this.workflowId,
      executionId: this.executionId,
      variables: this.variables,
      nodeOutputs: Object.fromEntries(this.nodeOutputs),
      currentNodeId: this.currentNodeId,
      executionPath: this.executionPath,
    };
  }

  /**
   * Restore context from JSON
   * 
   * @param data - JSON data to restore from
   * @returns Restored ExecutionContext instance
   * 
   * Requirement 21: Execution Context SHALL support serialization to JSON for persistence
   */
  static fromJSON(data: Record<string, any>): ExecutionContextImpl {
    const context = new ExecutionContextImpl(
      data.userId,
      data.workflowId,
      data.executionId
    );

    context.variables = data.variables || {};
    context.nodeOutputs = new Map(Object.entries(data.nodeOutputs || {}));
    context.currentNodeId = data.currentNodeId || '';
    context.executionPath = data.executionPath || [];

    return context;
  }

  /**
   * Create a shallow copy of the context
   * Useful for testing or branching execution paths
   * 
   * @returns New ExecutionContext instance with copied data
   */
  clone(): ExecutionContextImpl {
    const cloned = new ExecutionContextImpl(
      this.userId,
      this.workflowId,
      this.executionId
    );

    cloned.variables = { ...this.variables };
    cloned.nodeOutputs = new Map(this.nodeOutputs);
    cloned.currentNodeId = this.currentNodeId;
    cloned.executionPath = [...this.executionPath];

    return cloned;
  }

  /**
   * Clear all data from the context
   * Useful for cleanup or reset
   */
  clear(): void {
    this.variables = {};
    this.nodeOutputs.clear();
    this.currentNodeId = '';
    this.executionPath = [];
  }
}
