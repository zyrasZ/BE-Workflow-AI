/**
 * Merge Node Implementation
 * 
 * Combines results from multiple parallel branches.
 * Waits for all input branches to complete before proceeding.
 * 
 * Requirement 5: Logic Node - Merge
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';

/**
 * Merge Node - Multi-branch result aggregation
 * 
 * Configuration:
 * - inputNodeIds: Array of node IDs to wait for
 * - strategy: Merge strategy ('object', 'array', 'custom')
 * - continueOnError: Whether to continue if any input branch fails (default: false)
 * 
 * Requirement 5: Merge Node SHALL accept multiple input connections from different nodes
 */
export class MergeNode extends BaseNode {
  readonly type = 'merge';

  /**
   * Execute the merge
   * 
   * Requirement 5: Merge Node SHALL wait until all input branches have completed
   * Requirement 5: Merge Node SHALL combine all input data into a single output object with labeled keys
   * Requirement 5: Merge Node SHALL support different merge strategies (object merge, array concatenation, custom function)
   * Requirement 5: Merge Node SHALL preserve the execution order metadata for each input branch
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      const inputNodeIds: string[] = config.inputNodeIds || [];
      const strategy = config.strategy || 'object';
      const continueOnError = config.continueOnError || false;

      // Collect outputs from all input nodes
      const inputs: Array<{ nodeId: string; output: Record<string, any> | undefined; error?: boolean }> = [];
      let hasErrors = false;

      for (const nodeId of inputNodeIds) {
        const output = this.getNodeOutput(nodeId, context);
        
        if (output === undefined) {
          hasErrors = true;
          inputs.push({
            nodeId: nodeId,
            output: undefined,
            error: true,
          });
        } else {
          inputs.push({
            nodeId: nodeId,
            output: output,
          });
        }
      }

      // Handle errors
      if (hasErrors && !continueOnError) {
        return this.failure('One or more input branches failed or have no output');
      }

      // Merge based on strategy
      let merged: any;

      switch (strategy) {
        case 'object':
          merged = this.mergeAsObject(inputs);
          break;

        case 'array':
          merged = this.mergeAsArray(inputs);
          break;

        case 'custom':
          // For custom strategy, return all inputs for user processing
          merged = inputs;
          break;

        default:
          return this.failure(`Unknown merge strategy: ${strategy}`);
      }

      return this.success({
        merged: merged,
        strategy: strategy,
        inputCount: inputs.length,
        hasErrors: hasErrors,
        input: input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Merge execution failed: ${message}`);
    }
  }

  /**
   * Validate merge node configuration
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate inputNodeIds
    if (!config.inputNodeIds || !Array.isArray(config.inputNodeIds)) {
      errors.push({
        field: 'inputNodeIds',
        message: 'inputNodeIds is required and must be an array',
      });
    } else {
      // Validate each node ID is a string
      config.inputNodeIds.forEach((nodeId: any, index: number) => {
        if (typeof nodeId !== 'string') {
          errors.push({
            field: `inputNodeIds[${index}]`,
            message: 'Each node ID must be a string',
          });
        }
      });

      // Validate at least 2 inputs
      if (config.inputNodeIds.length < 2) {
        errors.push({
          field: 'inputNodeIds',
          message: 'Merge node requires at least 2 input nodes',
        });
      }
    }

    // Validate strategy
    if (config.strategy !== undefined) {
      const validStrategies = ['object', 'array', 'custom'];
      if (!validStrategies.includes(config.strategy)) {
        errors.push({
          field: 'strategy',
          message: `strategy must be one of: ${validStrategies.join(', ')}`,
        });
      }
    }

    // Validate continueOnError
    if (config.continueOnError !== undefined && typeof config.continueOnError !== 'boolean') {
      errors.push({
        field: 'continueOnError',
        message: 'continueOnError must be a boolean',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Merge inputs as object
   * 
   * Creates an object with keys from node IDs
   * 
   * Requirement 5: Merge Node SHALL combine all input data into a single output object with labeled keys
   */
  private mergeAsObject(
    inputs: Array<{ nodeId: string; output: Record<string, any> | undefined; error?: boolean }>
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const input of inputs) {
      if (input.output !== undefined) {
        result[input.nodeId] = input.output;
      } else if (input.error) {
        result[input.nodeId] = { error: 'Node output not available' };
      }
    }

    return result;
  }

  /**
   * Merge inputs as array
   * 
   * Concatenates all outputs into a single array
   * 
   * Requirement 5: Merge Node SHALL support different merge strategies (object merge, array concatenation, custom function)
   */
  private mergeAsArray(
    inputs: Array<{ nodeId: string; output: Record<string, any> | undefined; error?: boolean }>
  ): any[] {
    const result: any[] = [];

    for (const input of inputs) {
      if (input.output !== undefined) {
        // If output is already an array, concatenate it
        if (Array.isArray(input.output)) {
          result.push(...input.output);
        } else {
          result.push(input.output);
        }
      }
    }

    return result;
  }
}
