/**
 * Switch/Router Node Implementation
 * 
 * Routes workflow execution to different branches based on data values.
 * Evaluates an input value against multiple case conditions and routes to the matching case.
 * 
 * Requirement 2: Logic Node - Switch/Router
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';

/**
 * Case definition for switch node
 */
interface SwitchCase {
  /**
   * Match type: 'exact', 'pattern', or 'range'
   */
  matchType: 'exact' | 'pattern' | 'range';

  /**
   * Value to match against (for exact match)
   */
  value?: any;

  /**
   * Pattern to match (for pattern match) - supports wildcards
   */
  pattern?: string;

  /**
   * Range definition (for range match)
   */
  range?: {
    min?: number;
    max?: number;
  };

  /**
   * Node ID to execute when this case matches
   */
  nodeId: string;
}

/**
 * Switch Node - Multi-way branching logic
 * 
 * Configuration:
 * - inputPath: Path to extract value from input (e.g., "customer.type")
 * - cases: Array of case definitions
 * - defaultNodeId: Node ID to execute when no cases match
 * 
 * Requirement 2: Switch Node SHALL accept an input field path and multiple case definitions as configuration
 */
export class SwitchNode extends BaseNode {
  readonly type = 'switch';

  /**
   * Execute the switch logic
   * 
   * Requirement 2: Switch Node SHALL extract the value from the specified input field path
   * Requirement 2: Switch Node SHALL compare the extracted value against each case condition in order
   * Requirement 2: Switch Node SHALL route execution to that case's output branch when a case condition matches
   * Requirement 2: Switch Node SHALL route execution to the default output branch when no case conditions match
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      // Extract value from input using the specified path
      const inputPath = config.inputPath;
      const value = this.extractValueByPath(input, inputPath);

      // Evaluate cases in order
      const cases: SwitchCase[] = config.cases || [];
      
      for (let i = 0; i < cases.length; i++) {
        const caseItem = cases[i];
        
        if (this.matchesCase(value, caseItem)) {
          // First matching case wins
          return this.success(
            {
              inputPath: inputPath,
              value: value,
              matchedCase: i,
              matchType: caseItem.matchType,
              input: input,
            },
            [caseItem.nodeId]
          );
        }
      }

      // No cases matched, use default
      const defaultNodeId = config.defaultNodeId;
      
      return this.success(
        {
          inputPath: inputPath,
          value: value,
          matchedCase: -1,
          matchType: 'default',
          input: input,
        },
        defaultNodeId ? [defaultNodeId] : []
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to evaluate switch: ${message}`);
    }
  }

  /**
   * Validate switch node configuration
   * 
   * Requirement 2: Switch Node SHALL support exact match, pattern match, and range match conditions
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Check required fields
    if (!config.inputPath || typeof config.inputPath !== 'string') {
      errors.push({
        field: 'inputPath',
        message: 'inputPath is required and must be a string',
      });
    }

    // Validate cases array
    if (!config.cases || !Array.isArray(config.cases)) {
      errors.push({
        field: 'cases',
        message: 'cases is required and must be an array',
      });
    } else {
      // Validate each case
      config.cases.forEach((caseItem: any, index: number) => {
        if (!caseItem.matchType) {
          errors.push({
            field: `cases[${index}].matchType`,
            message: 'matchType is required',
          });
        } else if (!['exact', 'pattern', 'range'].includes(caseItem.matchType)) {
          errors.push({
            field: `cases[${index}].matchType`,
            message: 'matchType must be "exact", "pattern", or "range"',
          });
        }

        if (!caseItem.nodeId || typeof caseItem.nodeId !== 'string') {
          errors.push({
            field: `cases[${index}].nodeId`,
            message: 'nodeId is required and must be a string',
          });
        }

        // Validate match type specific fields
        if (caseItem.matchType === 'exact' && caseItem.value === undefined) {
          errors.push({
            field: `cases[${index}].value`,
            message: 'value is required for exact match',
          });
        }

        if (caseItem.matchType === 'pattern' && !caseItem.pattern) {
          errors.push({
            field: `cases[${index}].pattern`,
            message: 'pattern is required for pattern match',
          });
        }

        if (caseItem.matchType === 'range' && !caseItem.range) {
          errors.push({
            field: `cases[${index}].range`,
            message: 'range is required for range match',
          });
        }
      });
    }

    // Validate defaultNodeId if provided
    if (config.defaultNodeId !== undefined && typeof config.defaultNodeId !== 'string') {
      errors.push({
        field: 'defaultNodeId',
        message: 'defaultNodeId must be a string',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract value from object by path
   * 
   * @param obj - Object to extract from
   * @param path - Dot-separated path (e.g., "customer.type")
   * @returns Extracted value
   */
  private extractValueByPath(obj: Record<string, any>, path: string): any {
    const parts = path.split('.');
    let current: any = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Check if a value matches a case condition
   * 
   * Requirement 2: Switch Node SHALL support exact match, pattern match, and range match conditions
   * Requirement 2: Switch Node SHALL execute only the first matching case and skip remaining cases
   */
  private matchesCase(value: any, caseItem: SwitchCase): boolean {
    switch (caseItem.matchType) {
      case 'exact':
        return this.exactMatch(value, caseItem.value);

      case 'pattern':
        return this.patternMatch(value, caseItem.pattern || '');

      case 'range':
        return this.rangeMatch(value, caseItem.range);

      default:
        return false;
    }
  }

  /**
   * Exact match comparison
   */
  private exactMatch(value: any, expected: any): boolean {
    // Use strict equality for primitives
    if (typeof value !== 'object' || value === null) {
      return value === expected;
    }

    // For objects/arrays, use JSON comparison
    try {
      return JSON.stringify(value) === JSON.stringify(expected);
    } catch {
      return false;
    }
  }

  /**
   * Pattern match using wildcards
   * 
   * Supports:
   * - * for any characters
   * - ? for single character
   */
  private patternMatch(value: any, pattern: string): boolean {
    // Convert value to string
    const str = String(value);

    // Convert pattern to regex
    // Escape special regex characters except * and ?
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(str);
  }

  /**
   * Range match for numeric values
   */
  private rangeMatch(value: any, range: { min?: number; max?: number } | undefined): boolean {
    if (!range) {
      return false;
    }

    // Convert value to number
    const num = Number(value);
    
    if (isNaN(num)) {
      return false;
    }

    // Check min bound
    if (range.min !== undefined && num < range.min) {
      return false;
    }

    // Check max bound
    if (range.max !== undefined && num > range.max) {
      return false;
    }

    return true;
  }
}
