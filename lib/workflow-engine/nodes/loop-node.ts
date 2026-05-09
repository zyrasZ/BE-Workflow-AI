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
import { ExecutionContextImpl } from '../context';
import { nodeRegistry } from '../registry';
import { resolveExpression } from '../expression';

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

      // [FIXED - Bug 10] Extract subworkflow configuration for processItem
      const subworkflowNodeId = config.subworkflowNodeId;
      const subNodeConfig = config.subNodeConfig || {};

      // Execute iterations
      let results: any[];
      let breakIndex = -1;

      if (parallel) {
        // Parallel execution
        results = await this.executeParallel(
          itemsToProcess,
          totalCount,
          context,
          continueOnError,
          subworkflowNodeId,
          subNodeConfig
        );
      } else {
        // Sequential execution
        const sequentialResult = await this.executeSequential(
          itemsToProcess,
          totalCount,
          context,
          breakCondition,
          continueOnError,
          subworkflowNodeId,
          subNodeConfig
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
   * Blocked keywords for breakCondition security
   * [FIXED - Bug 8] Prevent arbitrary code execution via breakCondition
   */
  private readonly BLOCKED_KEYWORDS = [
    'require', 'process', 'global', 'module', 'exports',
    '__dirname', '__filename', 'fs', 'child_process', 'eval',
    'Function', 'constructor', 'prototype', '__proto__',
    'globalThis', 'import', 'Proxy', 'Reflect',
  ];

  /**
   * Validate loop node configuration
   * [FIXED - Bug 8] Added breakCondition validation with security checks
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
    } else if (config.subworkflowNodeId && typeof config.subworkflowNodeId === 'string') {
      // [FIXED - Bug 10] Validate subworkflow node type exists in registry
      if (!nodeRegistry.has(config.subworkflowNodeId)) {
        errors.push({
          field: 'subworkflowNodeId',
          message: `Unknown node type: '${config.subworkflowNodeId}'. Loop subworkflow node must be a registered node type.`,
        });
      }
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

    // [FIXED - Bug 8] Validate breakCondition for security
    if (config.breakCondition !== undefined) {
      if (typeof config.breakCondition !== 'string') {
        errors.push({
          field: 'breakCondition',
          message: 'breakCondition must be a string',
        });
      } else {
        // Check for blocked keywords using word boundary regex
        for (const keyword of this.BLOCKED_KEYWORDS) {
          const blockedPattern = new RegExp(`\\b${keyword}\\b`, 'i');
          if (blockedPattern.test(config.breakCondition)) {
            errors.push({
              field: 'breakCondition',
              message: `breakCondition contains blocked keyword: ${keyword}`,
            });
            break;
          }
        }
      }
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
    continueOnError: boolean,
    subworkflowNodeId: string | undefined,
    subNodeConfig: Record<string, any>
  ): Promise<{ results: any[]; breakIndex: number }> {
    const results: any[] = [];
    let breakIndex = -1;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      try {
        // [FIXED - Bug 10] Process item by executing subworkflow node
        const result = await this.processItem(item, i, totalCount, context, subworkflowNodeId, subNodeConfig);
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
    continueOnError: boolean,
    subworkflowNodeId: string | undefined,
    subNodeConfig: Record<string, any>
  ): Promise<any[]> {
    const promises = items.map((item, index) =>
      this.processItem(item, index, totalCount, context, subworkflowNodeId, subNodeConfig).catch((error) => {
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
   * Process a single item by executing the subworkflow node
   * [FIXED - Bug 10] Actually execute subworkflow node instead of returning metadata stub
   *
   * Steps:
   * 1. Clone execution context → child context with $item, $index, $total
   * 2. Get subworkflow node instance from registry
   * 3. Execute sub-node with item as input and child context
   * 4. Return the real output from sub-node
   */
  private async processItem(
    item: any,
    index: number,
    totalCount: number,
    context: ExecutionContext,
    subworkflowNodeId: string | undefined,
    subNodeConfig: Record<string, any>
  ): Promise<any> {
    // If no subworkflowNodeId configured, return item with metadata (backward compatible)
    if (!subworkflowNodeId) {
      return {
        item: item,
        index: index,
        total: totalCount,
      };
    }

    // Validate subworkflow node type exists in registry
    if (!nodeRegistry.has(subworkflowNodeId)) {
      throw new Error(
        `Loop subworkflow node type '${subworkflowNodeId}' not found in registry. ` +
        `Available types: ${nodeRegistry.list().map(n => n.type).join(', ')}`
      );
    }

    // Create child context by cloning parent context
    // This isolates each iteration's variables while preserving global access
    let childContext: ExecutionContext;
    if (context instanceof ExecutionContextImpl) {
      childContext = context.clone();
    } else {
      // Fallback: use parent context directly if not our implementation
      childContext = context;
    }

    // Set iteration-specific variables in child context
    childContext.setVariable('$item', item);
    childContext.setVariable('$index', index);
    childContext.setVariable('$total', totalCount);

    // Also set item fields directly at top level for easy access
    // e.g., if item is {name: "John", email: "john@test.com"}
    // then variables.name and variables.email are accessible
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      for (const [key, value] of Object.entries(item)) {
        // Don't overwrite existing special variables
        if (!key.startsWith('$')) {
          childContext.setVariable(key, value);
        }
      }
    }

    // Get subworkflow node instance from registry
    const subNode = nodeRegistry.create(subworkflowNodeId);

    // Execute the sub-node with:
    // - input: the current item
    // - config: subNodeConfig from loop config
    // - context: child context with iteration variables
    const result = await subNode.execute(item, subNodeConfig, childContext);

    if (!result.success) {
      throw new Error(
        `Subworkflow node '${subworkflowNodeId}' failed at iteration ${index}: ${result.error || 'Unknown error'}`
      );
    }

    // Store sub-node output in parent context for downstream access
    // Key format: loop-node-id.subworkflow[index]
    if (context instanceof ExecutionContextImpl) {
      context.nodeOutputs.set(`loop-iteration-${index}`, result.output);
    }

    // Return the real output from sub-node, wrapped with iteration metadata
    return {
      index: index,
      total: totalCount,
      output: result.output,
    };
  }

  /**
   * Evaluate break condition
   * [FIXED - Bug 8] Use expression resolver with security checks instead of raw new Function()
   */
  private evaluateBreakCondition(
    condition: string,
    result: any,
    context: ExecutionContext
  ): boolean {
    try {
      // Build scope with result data
      const scope = {
        variables: { ...context.variables, $result: result },
      };

      // Use the expression resolver which has security transforms
      // instead of raw new Function() which allows arbitrary code execution
      const value = resolveExpression(`{{${condition}}}`, scope);

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
