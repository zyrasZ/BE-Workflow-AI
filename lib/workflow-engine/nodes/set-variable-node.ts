/**
 * Set Variable Node Implementation
 * 
 * Initializes and assigns values to variables in the execution context.
 * Supports arithmetic and string operations.
 * 
 * Requirement 6: Data Transformation - Set Variable
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';
import { validateExpression } from '../expression';

/**
 * Set Variable Node - Variable assignment and manipulation
 * 
 * Configuration:
 * - variableName: Name of the variable to set
 * - valueExpression: Expression to evaluate for the value
 * 
 * Requirement 6: Set Variable Node SHALL accept variable name and value expression as configuration
 */
export class SetVariableNode extends BaseNode {
  readonly type = 'set-variable';

  /**
   * Execute the set variable logic
   * 
   * Requirement 6: Set Variable Node SHALL evaluate the value expression
   * Requirement 6: Set Variable Node SHALL store the evaluated value in the Execution Context
   * Requirement 6: Set Variable Node SHALL support arithmetic operations (add, subtract, multiply, divide)
   * Requirement 6: Set Variable Node SHALL support string operations (concatenate, substring, replace)
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      const variableName = config.variableName;
      const valueExpression = config.valueExpression;

      // Resolve the value expression
      const value = this.resolveExpression(valueExpression, context);

      // Store the value in the execution context
      this.setVariable(variableName, value, context);

      return this.success({
        variableName: variableName,
        value: value,
        input: input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to set variable: ${message}`);
    }
  }

  /**
   * Validate set variable node configuration
   * 
   * Requirement 6: Set Variable Node SHALL validate variable names follow identifier rules (alphanumeric and underscore only)
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Check required fields
    if (!config.variableName || typeof config.variableName !== 'string') {
      errors.push({
        field: 'variableName',
        message: 'variableName is required and must be a string',
      });
    } else {
      // Validate variable name format (alphanumeric and underscore only)
      const variableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
      if (!variableNameRegex.test(config.variableName)) {
        errors.push({
          field: 'variableName',
          message: 'variableName must contain only alphanumeric characters and underscores, and cannot start with a number',
        });
      }
    }

    if (!config.valueExpression || typeof config.valueExpression !== 'string') {
      errors.push({
        field: 'valueExpression',
        message: 'valueExpression is required and must be a string',
      });
    } else {
      // Validate expression syntax
      const exprValidation = validateExpression(config.valueExpression);
      if (!exprValidation.valid) {
        errors.push({
          field: 'valueExpression',
          message: exprValidation.error || 'Invalid value expression',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
