/**
 * Code/Function Node Implementation
 * 
 * Executes custom JavaScript code in a sandboxed environment.
 * Provides access to execution context and limited global scope.
 * 
 * Requirement 7: Data Transformation - Code/Function
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';

/**
 * Code Node - Custom JavaScript execution
 * 
 * Configuration:
 * - code: JavaScript code to execute
 * - timeout: Timeout in milliseconds (default: 30000)
 * 
 * Requirement 7: Code Node SHALL accept JavaScript code as configuration input
 */
export class CodeNode extends BaseNode {
  readonly type = 'code';

  /**
   * Blocked keywords for security
   * 
   * Requirement 7: Code Node SHALL execute the JavaScript code in a sandboxed environment
   */
  private readonly BLOCKED_KEYWORDS = [
    'require',
    'process',
    'global',
    'module',
    'exports',
    '__dirname',
    '__filename',
    'fs',
    'child_process',
    'eval',
    'Function',
    'constructor',
    'prototype',
    '__proto__',
    'globalThis',
    'import',
    'Proxy',
    'Reflect',
  ];

  /**
   * Execute the code
   * 
   * Requirement 7: Code Node SHALL provide the Execution Context as input to the code
   * Requirement 7: Code Node SHALL capture the return value from the code and store it in the Execution Context
   * Requirement 7: Code Node SHALL support async/await syntax for asynchronous operations
   * Requirement 7: Code Node SHALL enforce a timeout limit (configurable, default 30 seconds)
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      const code = config.code;
      const timeout = config.timeout || 30000; // Default 30 seconds

      // Check for blocked keywords using word boundary regex
      // This prevents false positives like "required" matching "require"
      for (const keyword of this.BLOCKED_KEYWORDS) {
        const blockedPattern = new RegExp(`\\b${keyword}\\b`, 'i');
        if (blockedPattern.test(code)) {
          return this.failure(`Blocked keyword detected: ${keyword}`);
        }
      }

      // Execute code with timeout
      const result = await this.executeWithTimeout(code, input, context, timeout);

      return this.success({
        result: result,
        input: input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Code execution failed: ${message}`);
    }
  }

  /**
   * Validate code node configuration
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Check required fields
    if (!config.code || typeof config.code !== 'string') {
      errors.push({
        field: 'code',
        message: 'code is required and must be a string',
      });
    } else if (config.code.trim().length === 0) {
      errors.push({
        field: 'code',
        message: 'code cannot be empty',
      });
    }

    // Validate timeout if provided
    if (config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout <= 0) {
        errors.push({
          field: 'timeout',
          message: 'timeout must be a positive number',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute code with timeout
   * 
   * Requirement 7: Code Node SHALL provide access to standard JavaScript libraries and fetch API
   * Requirement 7: When the code throws an error, Code Node SHALL capture the error and fail the workflow execution
   */
  private async executeWithTimeout(
    code: string,
    input: Record<string, any>,
    context: ExecutionContext,
    timeoutMs: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Track all timers created by user code for cleanup
      const activeTimers = new Set<NodeJS.Timeout>();
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        // Clean up all active timers before rejecting
        this.cleanupTimers(activeTimers);
        reject(new Error(`Code execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        // Wrapped setTimeout that tracks timers
        const wrappedSetTimeout = (callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
          const timerId = setTimeout((...callbackArgs: any[]) => {
            // Remove from active timers when it executes
            activeTimers.delete(timerId);
            callback(...callbackArgs);
          }, delay, ...args);
          activeTimers.add(timerId);
          return timerId;
        };

        // Wrapped setInterval that tracks timers
        const wrappedSetInterval = (callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
          const timerId = setInterval(callback, delay, ...args);
          activeTimers.add(timerId);
          return timerId;
        };

        // Wrapped clearTimeout that removes from tracking
        const wrappedClearTimeout = (timerId: NodeJS.Timeout) => {
          activeTimers.delete(timerId);
          clearTimeout(timerId);
        };

        // Wrapped clearInterval that removes from tracking
        const wrappedClearInterval = (timerId: NodeJS.Timeout) => {
          activeTimers.delete(timerId);
          clearInterval(timerId);
        };

        // Build limited scope with wrapped timer functions
        const scope = {
          input: input,
          variables: context.variables,
          console: {
            log: (...args: any[]) => console.log('[CodeNode]', ...args),
            error: (...args: any[]) => console.error('[CodeNode]', ...args),
            warn: (...args: any[]) => console.warn('[CodeNode]', ...args),
            info: (...args: any[]) => console.info('[CodeNode]', ...args),
          },
          JSON: JSON,
          Math: Math,
          Date: Date,
          parseInt: parseInt,
          parseFloat: parseFloat,
          String: String,
          Number: Number,
          Boolean: Boolean,
          Array: Array,
          Object: Object,
          fetch: globalThis.fetch,
          setTimeout: wrappedSetTimeout,
          setInterval: wrappedSetInterval,
          clearTimeout: wrappedClearTimeout,
          clearInterval: wrappedClearInterval,
        };

        // Create function with limited scope
        const fn = new Function(
          ...Object.keys(scope),
          `
          "use strict";
          return (async () => {
            ${code}
          })();
          `
        );

        // Execute function
        const result = fn(...Object.values(scope));

        // Handle async result
        if (result instanceof Promise) {
          result
            .then((value) => {
              clearTimeout(timeoutId);
              // Clean up any remaining timers after successful completion
              this.cleanupTimers(activeTimers);
              resolve(value);
            })
            .catch((error) => {
              clearTimeout(timeoutId);
              // Clean up any remaining timers after error
              this.cleanupTimers(activeTimers);
              reject(error);
            });
        } else {
          clearTimeout(timeoutId);
          // Clean up any remaining timers after synchronous completion
          this.cleanupTimers(activeTimers);
          resolve(result);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        // Clean up any remaining timers after error
        this.cleanupTimers(activeTimers);
        reject(error);
      }
    });
  }

  /**
   * Clean up all active timers
   * 
   * @param activeTimers - Set of active timer IDs to clean up
   */
  private cleanupTimers(activeTimers: Set<NodeJS.Timeout>): void {
    for (const timerId of activeTimers) {
      try {
        clearTimeout(timerId);
        clearInterval(timerId);
      } catch (error) {
        // Ignore errors during cleanup
        console.warn('[CodeNode] Failed to clear timer:', error);
      }
    }
    activeTimers.clear();
  }
}
