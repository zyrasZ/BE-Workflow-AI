/**
 * Base Node Class for Workflow Automation System
 * 
 * Provides common functionality and helper methods for all node implementations.
 * All custom nodes should extend this class to inherit validation and error handling utilities.
 * 
 * Requirement 20: Node SDK SHALL provide a base class or interface for creating custom nodes
 */

import { LogicNode, NodeResult, ValidationResult, ExecutionContext } from '../types';
import { resolveExpression, buildExpressionScope } from '../expression';

/**
 * Abstract base class for all node implementations
 * 
 * Provides helper methods for:
 * - Config validation
 * - Error handling
 * - Accessing ExecutionContext
 * - Expression resolution
 * 
 * Requirement 20: Node SDK SHALL provide helper functions for accessing the Execution Context
 */
export abstract class BaseNode implements LogicNode {
  /**
   * Node type identifier
   * Must be overridden by subclasses
   */
  abstract readonly type: string;

  /**
   * Execute the node logic
   * Must be implemented by subclasses
   * 
   * @param input - Data from previous node or trigger input
   * @param config - Node configuration from workflow definition
   * @param context - Runtime execution context
   * @returns Promise resolving to node execution result
   */
  abstract execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult>;

  /**
   * Validate node configuration
   * Must be implemented by subclasses
   * 
   * @param config - Configuration to validate
   * @returns Validation result with errors if invalid
   */
  abstract validateConfig(config: Record<string, any>): ValidationResult;

  /**
   * Helper: Resolve an expression using the execution context
   * 
   * @param expr - Expression string to resolve (e.g., "{{variables.name}}")
   * @param context - Execution context
   * @returns Resolved value
   * 
   * Requirement 20: Node SDK SHALL provide helper functions for accessing the Execution Context
   */
  protected resolveExpression(expr: string, context: ExecutionContext): any {
    const scope = buildExpressionScope(context.variables, context.nodeOutputs);
    return resolveExpression(expr, scope);
  }

  /**
   * Helper: Get a variable from the execution context
   * 
   * @param key - Variable name
   * @param context - Execution context
   * @returns Variable value or undefined if not found
   * 
   * Requirement 20: Node SDK SHALL provide helper functions for accessing the Execution Context
   */
  protected getVariable(key: string, context: ExecutionContext): any {
    return context.getVariable(key);
  }

  /**
   * Helper: Set a variable in the execution context
   * 
   * @param key - Variable name
   * @param value - Variable value
   * @param context - Execution context
   * 
   * Requirement 20: Node SDK SHALL provide helper functions for accessing the Execution Context
   */
  protected setVariable(key: string, value: any, context: ExecutionContext): void {
    context.setVariable(key, value);
  }

  /**
   * Helper: Get output from a previous node
   * 
   * @param nodeId - ID of the node to get output from
   * @param context - Execution context
   * @returns Node output data or undefined if not found
   * 
   * Requirement 20: Node SDK SHALL provide helper functions for accessing the Execution Context
   */
  protected getNodeOutput(nodeId: string, context: ExecutionContext): Record<string, any> | undefined {
    return context.getNodeOutput(nodeId);
  }

  /**
   * Helper: Validate that required config fields are present
   * 
   * @param config - Configuration object
   * @param requiredFields - Array of required field names
   * @returns Validation result
   * 
   * Requirement 20: Node SDK SHALL provide error handling utilities for consistent error reporting
   */
  protected validateRequiredFields(
    config: Record<string, any>,
    requiredFields: string[]
  ): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    for (const field of requiredFields) {
      if (!(field in config) || config[field] === undefined || config[field] === null || config[field] === '') {
        errors.push({
          field,
          message: `Required field '${field}' is missing or empty`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Helper: Create a success result
   * 
   * @param output - Output data to pass to downstream nodes
   * @param branches - Optional array of node IDs to execute next (for branching nodes)
   * @returns Success node result
   * 
   * Requirement 20: Node SDK SHALL provide error handling utilities for consistent error reporting
   */
  protected success(output: Record<string, any>, branches?: string[]): NodeResult {
    return {
      success: true,
      output,
      branches,
    };
  }

  /**
   * Helper: Create a failure result
   * 
   * @param error - Error message
   * @param output - Optional partial output data
   * @returns Failure node result
   * 
   * Requirement 20: Node SDK SHALL provide error handling utilities for consistent error reporting
   */
  protected failure(error: string, output: Record<string, any> = {}): NodeResult {
    return {
      success: false,
      output,
      error,
    };
  }

  /**
   * Helper: Safely execute an async operation with error handling
   * 
   * @param operation - Async operation to execute
   * @param errorMessage - Error message prefix
   * @returns Node result (success or failure)
   * 
   * Requirement 20: Node SDK SHALL provide error handling utilities for consistent error reporting
   */
  protected async safeExecute(
    operation: () => Promise<Record<string, any>>,
    errorMessage: string
  ): Promise<NodeResult> {
    try {
      const output = await operation();
      return this.success(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`${errorMessage}: ${message}`);
    }
  }

  /**
   * Helper: Validate field type
   * 
   * @param config - Configuration object
   * @param field - Field name
   * @param expectedType - Expected type ('string', 'number', 'boolean', 'object', 'array')
   * @returns Validation result
   * 
   * Requirement 20: Node SDK SHALL provide error handling utilities for consistent error reporting
   */
  protected validateFieldType(
    config: Record<string, any>,
    field: string,
    expectedType: 'string' | 'number' | 'boolean' | 'object' | 'array'
  ): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    if (field in config) {
      const value = config[field];
      let isValid = false;

      switch (expectedType) {
        case 'string':
          isValid = typeof value === 'string';
          break;
        case 'number':
          isValid = typeof value === 'number';
          break;
        case 'boolean':
          isValid = typeof value === 'boolean';
          break;
        case 'object':
          isValid = typeof value === 'object' && value !== null && !Array.isArray(value);
          break;
        case 'array':
          isValid = Array.isArray(value);
          break;
      }

      if (!isValid) {
        errors.push({
          field,
          message: `Field '${field}' must be of type ${expectedType}`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Helper: Merge multiple validation results
   * 
   * @param results - Array of validation results
   * @returns Combined validation result
   * 
   * Requirement 20: Node SDK SHALL provide error handling utilities for consistent error reporting
   */
  protected mergeValidationResults(...results: ValidationResult[]): ValidationResult {
    const allErrors: Array<{ field: string; message: string }> = [];

    for (const result of results) {
      allErrors.push(...result.errors);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
    };
  }
}
