/**
 * Unit tests for WorkflowExecutor retry logic enhancements
 * 
 * Tests cover:
 * - Configurable retry count and delay
 * - Retryable vs non-retryable error classification
 * - Retry attempt logging with timestamps
 * - Workflow failure marking after exhausting retries
 * 
 * Requirement 25: Error Handling and Recovery
 */

import { WorkflowExecutor } from '../executor';
import { ExecutionContextImpl } from '../context';
import { LogicNode, NodeResult, ValidationResult } from '../types';

// Mock Supabase client
const createMockSupabase = () => {
  const logs: any[] = [];
  
  return {
    from: (table: string) => ({
      select: (fields?: string) => ({
        eq: (field: string, value: any) => ({
          single: () => Promise.resolve({ 
            data: { id: 'log-1', error: '' }, 
            error: null 
          }),
        }),
      }),
      insert: (data: any) => ({
        select: () => ({
          single: () => Promise.resolve({ 
            data: { id: 'log-1' }, 
            error: null 
          }),
        }),
      }),
      update: (data: any) => {
        logs.push({ table, action: 'update', data });
        return {
          eq: (field: string, value: any) => Promise.resolve({ error: null }),
        };
      },
    }),
    logs,
  };
};

// Mock node that fails with retryable error
class RetryableErrorNode implements LogicNode {
  readonly type = 'retryable-error-node';
  private attemptCount = 0;
  private readonly failUntilAttempt: number;

  constructor(failUntilAttempt: number = 2) {
    this.failUntilAttempt = failUntilAttempt;
  }

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: any
  ): Promise<NodeResult> {
    this.attemptCount++;
    
    if (this.attemptCount < this.failUntilAttempt) {
      throw new Error('Network timeout - connection failed');
    }

    return {
      success: true,
      output: { result: 'success', attempts: this.attemptCount },
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }

  getAttemptCount(): number {
    return this.attemptCount;
  }
}

// Mock node that fails with non-retryable error
class NonRetryableErrorNode implements LogicNode {
  readonly type = 'non-retryable-error-node';
  private attemptCount = 0;

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: any
  ): Promise<NodeResult> {
    this.attemptCount++;
    throw new Error('Configuration validation failed: missing required field');
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }

  getAttemptCount(): number {
    return this.attemptCount;
  }
}

// Mock node that always succeeds
class SuccessNode implements LogicNode {
  readonly type = 'success-node';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: any
  ): Promise<NodeResult> {
    return {
      success: true,
      output: { result: 'success' },
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }
}

describe('WorkflowExecutor - Retry Logic', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  describe('Retryable Error Handling', () => {
    test('should retry on network timeout error', async () => {
      const node = new RetryableErrorNode(3); // Fail first 2 attempts, succeed on 3rd
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 3,
        retryDelayMs: 10, // Short delay for testing
      };

      // Access private method via type assertion
      const result = await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      expect(result.success).toBe(true);
      expect(result.output.attempts).toBe(3);
      expect(node.getAttemptCount()).toBe(3);
    });

    test('should log retry attempts with timestamps', async () => {
      const node = new RetryableErrorNode(3);
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 3,
        retryDelayMs: 10,
      };

      await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      // Check that retry attempts were logged
      const updateLogs = supabase.logs.filter(
        (log: any) => log.action === 'update' && log.data.error
      );
      
      expect(updateLogs.length).toBeGreaterThan(0);
      
      // Verify timestamp format in logs
      const errorLog = updateLogs[0].data.error;
      expect(errorLog).toContain('Retry attempt');
      expect(errorLog).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO timestamp
    });

    test('should respect configurable retry count', async () => {
      const node = new RetryableErrorNode(10); // Will never succeed
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 2, // Only retry twice
        retryDelayMs: 10,
      };

      const result = await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      expect(result.success).toBe(false);
      expect(node.getAttemptCount()).toBe(3); // Initial attempt + 2 retries
    });

    test('should respect configurable retry delay', async () => {
      const node = new RetryableErrorNode(3);
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 3,
        retryDelayMs: 50, // 50ms delay
      };

      const startTime = Date.now();
      await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );
      const duration = Date.now() - startTime;

      // Should take at least 100ms (2 retries * 50ms delay)
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Non-Retryable Error Handling', () => {
    test('should not retry on configuration validation error', async () => {
      const node = new NonRetryableErrorNode();
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 3,
        retryDelayMs: 10,
      };

      const result = await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      expect(result.success).toBe(false);
      expect(node.getAttemptCount()).toBe(1); // Should only attempt once
    });

    test('should identify non-retryable error patterns', async () => {
      const nonRetryableErrors = [
        'Configuration validation failed',
        'Invalid configuration: missing field',
        'Syntax error in expression',
        'Parse error: invalid JSON',
        'Schema validation failed',
        'Missing required parameter',
      ];

      for (const errorMsg of nonRetryableErrors) {
        const error = new Error(errorMsg);
        const isRetryable = (executor as any).isRetryableError(error);
        expect(isRetryable).toBe(false);
      }
    });

    test('should identify retryable error patterns', async () => {
      const retryableErrors = [
        'Network timeout',
        'Connection refused',
        'ECONNRESET',
        'ETIMEDOUT',
        'Socket hang up',
        'Rate limit exceeded',
        'Too many requests',
        'Service unavailable',
      ];

      for (const errorMsg of retryableErrors) {
        const error = new Error(errorMsg);
        const isRetryable = (executor as any).isRetryableError(error);
        expect(isRetryable).toBe(true);
      }
    });
  });

  describe('Error Strategy Handling', () => {
    test('should skip node on skip strategy', async () => {
      const node = new RetryableErrorNode(10); // Will always fail
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'skip' as const,
        maxRetries: 3,
        retryDelayMs: 10,
      };

      const result = await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({});
    });

    test('should use fallback value on fallback strategy', async () => {
      const node = new RetryableErrorNode(10); // Will always fail
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const fallbackValue = { default: 'fallback-data' };
      const errorConfig = {
        strategy: 'fallback' as const,
        maxRetries: 3,
        retryDelayMs: 10,
        fallbackValue,
      };

      const result = await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual(fallbackValue);
    });

    test('should fail workflow on fail strategy after retries exhausted', async () => {
      const node = new RetryableErrorNode(10); // Will always fail
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'fail' as const,
        maxRetries: 2,
        retryDelayMs: 10,
      };

      const result = await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
    });
  });

  describe('Retry Logging', () => {
    test('should log all retry attempts', async () => {
      const node = new RetryableErrorNode(10); // Will always fail
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 3,
        retryDelayMs: 10,
      };

      await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      // Should have logged 4 attempts (initial + 3 retries)
      const updateLogs = supabase.logs.filter(
        (log: any) => log.action === 'update' && log.data.error
      );
      
      expect(updateLogs.length).toBeGreaterThanOrEqual(3);
    });

    test('should include attempt number in retry logs', async () => {
      const node = new RetryableErrorNode(10);
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 2,
        retryDelayMs: 10,
      };

      await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      const updateLogs = supabase.logs.filter(
        (log: any) => log.action === 'update' && log.data.error
      );

      // Check that logs contain attempt numbers
      const firstLog = updateLogs[0]?.data.error || '';
      expect(firstLog).toMatch(/Retry attempt \d+\/\d+/);
    });

    test('should log success after recovery', async () => {
      const node = new RetryableErrorNode(2); // Succeed on 2nd attempt
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 3,
        retryDelayMs: 10,
      };

      await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      const updateLogs = supabase.logs.filter(
        (log: any) => log.action === 'update' && log.data.error
      );

      // Should have a success log
      const hasSuccessLog = updateLogs.some((log: any) => 
        log.data.error?.includes('SUCCESS')
      );
      expect(hasSuccessLog).toBe(true);
    });
  });

  describe('Default Behavior', () => {
    test('should use default retry count when not specified', async () => {
      const node = new RetryableErrorNode(10);
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        // maxRetries not specified, should default to 3
      };

      await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );

      expect(node.getAttemptCount()).toBe(4); // Initial + 3 retries (default)
    });

    test('should use default retry delay when not specified', async () => {
      const node = new RetryableErrorNode(3);
      const context = new ExecutionContextImpl('user-1', 'workflow-1', 'exec-1');
      const supabase = createMockSupabase();

      const errorConfig = {
        strategy: 'retry' as const,
        maxRetries: 2,
        // retryDelayMs not specified, should default to 1000
      };

      const startTime = Date.now();
      await (executor as any).executeNodeWithRetry(
        node,
        {},
        {},
        context,
        errorConfig,
        supabase,
        'log-1'
      );
      const duration = Date.now() - startTime;

      // Should take at least 2000ms (2 retries * 1000ms default delay)
      expect(duration).toBeGreaterThanOrEqual(2000);
    });

    test('should treat unknown errors as retryable by default', async () => {
      const unknownError = new Error('Some unknown error message');
      const isRetryable = (executor as any).isRetryableError(unknownError);
      expect(isRetryable).toBe(true);
    });
  });
});
