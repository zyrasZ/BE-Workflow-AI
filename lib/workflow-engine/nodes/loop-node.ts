/**
 * Loop/Iterator Node Implementation
 * 
 * Iterates through arrays and processes each item.
 * Supports parallel execution and early termination.
 * 
 * Requirement 3: Logic Node - Loop/Iterator
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';

/**
 * Loop Node - Array iteration and batch processing
 * 
 * Configuration:
 * - arrayPath: Path to array in input (e.g., "items")
 * - subworkflowNodeId: Node ID to execute for each item
 * - breakCondition: Optional expression to break early
 * - parallel: Whether to execute iterations in parallel (default: false)
 * - maxIterations: Maximum number of iterations (default: 10000)
 * - continueOnError: Whether to continue on iteration failure (default: false)
 * 
 * Requirement 3: Loop Node SHALL accept an array input and a subworkflow configuration
 */
export class LoopNode extends BaseNode {
  readonly type = 'loop';

  /**
   * Maximum iterations limit
   * 
   * Requirement 3: Loop Node SHALL enforce max iterations limit (10,000)
   */
  private readonly DEFAULT_MAX_ITERATIONS = 10000;

  /**
   * Execute the loop
   * 
   * Requirement 3: Loop Node SHALL validate that the input is an array
   * Requirement 3: Loop Node SHALL execute the configured subworkflow with the current item as input
   * Requirement 3: Loop Node SHALL provide the current index and total count to each iteration
   * Requirement 3: Loop Node SHALL collect all iteration results into an output array
   * Requirement 3: Loop Node SHALL support early termination when a break condition is met
   * Requirement 3: Loop Node SHALL support parallel execution mode where iterations run concurrently
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      // Extract array from input
      const arrayPath = config.arrayPath || 'items';
      const array = this.extractValueByPath(input, arrayPath);

      // Validate array
      if (!Array.isArray(array)) {
        return this.failure(`Value at path '${arrayPath}' is not an array`);
      }

      // Get configuration
      const maxIterations = config.maxIterations || this.DEFAULT_MAX_ITERATIONS;
      const parallel = config.parallel || false;
      const continueOnError = config.continueOnError || false;
      const breakCondition = config.breakCondition;

      // Enforce max iterations
      const itemsToProcess = array.slice(0, maxIterations);
      const totalCount = itemsToProcess.length;

      // Execute iterations
      let results: any[];
      let breakIndex = -1;

      if (parallel) {
        // Parallel execution
        results = await this.executeParallel(
          itemsToProcess,
          totalCount,
          context,
          continueOnError
        );
      } else {
        // Sequential execution
        const sequentialResult = await this.executeSequential(
          itemsToProcess,
          totalCount,
          context,
          breakCondition,
          continueOnError
        );
        results = sequentialResult.results;
        breakIndex = sequentialResult.breakIndex;
      }

      return this.success({
        results: results,
        totalCount: totalCount,
        processedCount: results.length,
        breakIndex: breakIndex,
        input: input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Loop execution failed: ${message}`);
    }
  }

  /**
   * Validate loop node configuration
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate arrayPath
    if (config.arrayPath !== undefined && typeof config.arrayPath !== 'string') {
      errors.push({
        field: 'arrayPath',
        message: 'arrayPath must be a string',
      });
    }

    // Validate subworkflowNodeId
    if (config.subworkflowNodeId !== undefined && typeof config.subworkflowNodeId !== 'string') {
      errors.push({
        field: 'subworkflowNodeId',
        message: 'subworkflowNodeId must be a string',
      });
    }

    // Validate parallel
    if (config.parallel !== undefined && typeof config.parallel !== 'boolean') {
      errors.push({
        field: 'parallel',
        message: 'parallel must be a boolean',
      });
    }

    // Validate maxIterations
    if (config.maxIterations !== undefined) {
      if (typeof config.maxIterations !== 'number' || config.maxIterations <= 0) {
        errors.push({
          field: 'maxIterations',
          message: 'maxIterations must be a positive number',
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
   * Execute iterations sequentially
   * 
   * Requirement 3: When an iteration fails, Loop Node SHALL either stop execution or continue based on error handling configuration
   */
  private async executeSequential(
    items: any[],
    totalCount: number,
    context: ExecutionContext,
    breakCondition: string | undefined,
    continueOnError: boolean
  ): Promise<{ results: any[]; breakIndex: number }> {
    const results: any[] = [];
    let breakIndex = -1;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      try {
        // Process item (in real implementation, this would execute subworkflow)
        const result = await this.processItem(item, i, totalCount, context);
        results.push(result);

        // Check break condition
        if (breakCondition) {
          const shouldBreak = this.evaluateBreakCondition(breakCondition, result, context);
          if (shouldBreak) {
            breakIndex = i;
            break;
          }
        }
      } catch (error) {
        if (continueOnError) {
          // Continue with error result
          results.push({
            error: error instanceof Error ? error.message : String(error),
            index: i,
          });
        } else {
          // Stop execution
          throw error;
        }
      }
    }

    return { results, breakIndex };
  }

  /**
   * Execute iterations in parallel
   * 
   * Requirement 3: Loop Node SHALL support parallel execution mode where iterations run concurrently
   */
  private async executeParallel(
    items: any[],
    totalCount: number,
    context: ExecutionContext,
    continueOnError: boolean
  ): Promise<any[]> {
    const promises = items.map((item, index) =>
      this.processItem(item, index, totalCount, context).catch((error) => {
        if (continueOnError) {
          return {
            error: error instanceof Error ? error.message : String(error),
            index: index,
          };
        }
        throw error;
      })
    );

    const results = await Promise.allSettled(promises);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        if (continueOnError) {
          return {
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            index: index,
          };
        }
        throw result.reason;
      }
    });
  }

  /**
   * Process a single item
   * 
   * In a real implementation, this would execute the subworkflow node.
   * For now, it returns the item with metadata.
   */
  private async processItem(
    item: any,
    index: number,
    totalCount: number,
    context: ExecutionContext
  ): Promise<any> {
    // In real implementation, this would:
    // 1. Create a new execution context for the iteration
    // 2. Set special variables: $item, $index, $total
    // 3. Execute the subworkflow node
    // 4. Return the result

    // For now, return item with metadata
    return {
      item: item,
      index: index,
      total: totalCount,
    };
  }

  /**
   * Evaluate break condition
   */
  private evaluateBreakCondition(
    condition: string,
    result: any,
    context: ExecutionContext
  ): boolean {
    try {
      // Create temporary context with result
      const tempVariables = {
        ...context.variables,
        $result: result,
      };

      const scope = {
        variables: tempVariables,
      };

      // Evaluate condition
      const fn = new Function('$scope', `"use strict"; return (${condition});`);
      const value = fn(scope);

      return Boolean(value);
    } catch {
      return false;
    }
  }

  /**
   * Extract value from object by path
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
}
