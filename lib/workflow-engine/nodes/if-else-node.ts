/**
 * If/Else Node Implementation
 * 
 * Routes workflow execution based on conditional expressions.
 * Evaluates a condition and branches to either the "true" or "false" output.
 * 
 * Requirement 1: Logic Node - If/Else Branching
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';
import { validateExpression } from '../expression';

/**
 * If/Else Node - Conditional branching logic
 * 
 * Configuration:
 * - condition: Expression to evaluate (e.g., "{{variables.score > 80}}")
 * - trueNodeId: Node ID to execute when condition is true
 * - falseNodeId: Node ID to execute when condition is false
 * 
 * Requirement 1: If/Else Node SHALL accept a condition expression as configuration input
 */
export class IfElseNode extends BaseNode {
  readonly type = 'if-else';

  /**
   * Execute the if/else logic
   * 
   * Requirement 1: If/Else Node SHALL evaluate the condition expression against the Execution Context
   * Requirement 1: If/Else Node SHALL route execution to the "true" or "false" output branch
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      // Resolve the condition expression
      const condition = config.condition;
      const result = this.resolveExpression(condition, context);

      // Determine which branch to take
      const isTruthy = this.evaluateCondition(result);

      // Get the appropriate node ID
      const nextNodeId = isTruthy ? config.trueNodeId : config.falseNodeId;

      // Return result with branch information
      return this.success(
        {
          condition: condition,
          result: isTruthy,
          branch: isTruthy ? 'true' : 'false',
          input: input,
        },
        nextNodeId ? [nextNodeId] : []
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to evaluate condition: ${message}`);
    }
  }

  /**
   * Validate if/else node configuration
   * 
   * Requirement 1: If/Else Node SHALL provide clear error messages when condition expressions are malformed
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    // Check required fields
    const requiredValidation = this.validateRequiredFields(config, ['condition']);
    if (!requiredValidation.valid) {
      return requiredValidation;
    }

    // Validate condition is a string
    const typeValidation = this.validateFieldType(config, 'condition', 'string');
    if (!typeValidation.valid) {
      return typeValidation;
    }

    // Validate condition expression syntax
    const exprValidation = validateExpression(config.condition);
    if (!exprValidation.valid) {
      return {
        valid: false,
        errors: [
          {
            field: 'condition',
            message: exprValidation.error || 'Invalid condition expression',
          },
        ],
      };
    }

    // Validate trueNodeId and falseNodeId if provided
    const errors: Array<{ field: string; message: string }> = [];

    if (config.trueNodeId !== undefined && typeof config.trueNodeId !== 'string') {
      errors.push({
        field: 'trueNodeId',
        message: 'trueNodeId must be a string',
      });
    }

    if (config.falseNodeId !== undefined && typeof config.falseNodeId !== 'string') {
      errors.push({
        field: 'falseNodeId',
        message: 'falseNodeId must be a string',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Evaluate a condition result to boolean
   * 
   * Handles various truthy/falsy values:
   * - Boolean: true/false
   * - Number: 0 is false, non-zero is true
   * - String: empty string is false, non-empty is true
   *   - Special cases: "false", "0", "null", "undefined" → false
   *   - Special cases: "true" → true
   * - null/undefined: false
   * - Object/Array: true
   * 
   * Requirement 1: If/Else Node SHALL support comparison operators (==, !=, >, <, contains)
   * Requirement 1: If/Else Node SHALL support logical operators (AND, OR, NOT)
   */
  private evaluateCondition(value: any): boolean {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return false;
    }

    // Handle boolean
    if (typeof value === 'boolean') {
      return value;
    }

    // Handle number
    if (typeof value === 'number') {
      return value !== 0 && !isNaN(value);
    }

    // Handle string - special cases for string representations of falsy values
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      
      // Explicit false values
      if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'null' || lowerValue === 'undefined') {
        return false;
      }
      
      // Explicit true value
      if (lowerValue === 'true') {
        return true;
      }
      
      // Empty string is false, non-empty is true
      return value.length > 0;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    // Handle objects
    if (typeof value === 'object') {
      return true;
    }

    // Default to truthy
    return Boolean(value);
  }
}
