/**
 * Integration tests for Task 35.1: Enhanced Execution Logging
 * 
 * Verifies that the executor properly stores:
 * 1. Complete ExecutionContext for each execution
 * 2. Error messages and stack traces for failed executions
 * 3. Individual node execution results and timings
 * 
 * Requirements: 24
 */

import { WorkflowExecutor } from '../executor';
import { nodeRegistry } from '../registry';
import { LogicNode, NodeResult, ExecutionContext, ValidationResult } from '../types';
import { createServiceClient } from '@/lib/supabase/server';

// Mock Supabase
jest.mock('@/lib/supabase/server');

// Test node that succeeds
class SuccessNode implements LogicNode {
  readonly type = 'test-success-node';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    // Set some variables in context
    context.setVariable('testVar', 'testValue');
    
    return {
      success: true,
      output: { result: 'success', timestamp: Date.now() },
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }
}

// Test node that fails with error
class FailureNode implements LogicNode {
  readonly type = 'test-failure-node';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    throw new Error('Test node failure');
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }
}

describe('Task 35.1: Enhanced Execution Logging', () => {
  let mockSupabase: any;
  let executor: WorkflowExecutor;
  let executionLogs: any[];
  let executionRecords: any[];

  beforeAll(() => {
    // Register test nodes (only if not already registered)
    if (!nodeRegistry.has('test-success-node')) {
      nodeRegistry.register('test-success-node', new SuccessNode());
    }
    if (!nodeRegistry.has('test-failure-node')) {
      nodeRegistry.register('test-failure-node', new FailureNode());
    }
  });

  beforeEach(() => {
    executionLogs = [];
    executionRecords = [];

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'workflows') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'workflow-123',
                user_id: 'user-123',
                nodes: [
                  { id: 'node-1', type: 'test-success-node', config: {} },
                ],
                edges: [],
                metadata: {},
              },
              error: null,
            }),
          };
        } else if (table === 'executions') {
          return {
            insert: jest.fn().mockReturnThis(),
            update: jest.fn((data: any) => {
              executionRecords.push(data);
              return {
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'exec-123' },
              error: null,
            }),
          };
        } else if (table === 'execution_logs') {
          return {
            insert: jest.fn((data: any) => {
              executionLogs.push(data);
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                  data: { id: `log-${executionLogs.length}` },
                  error: null,
                }),
              };
            }),
            update: jest.fn((data: any) => {
              const lastLog = executionLogs[executionLogs.length - 1];
              Object.assign(lastLog, data);
              return {
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        return {};
      }),
    };

    (createServiceClient as jest.Mock).mockReturnValue(mockSupabase);
    executor = new WorkflowExecutor();
  });

  describe('1. Store complete ExecutionContext', () => {
    it('should store complete ExecutionContext in results field', async () => {
      await executor.execute('workflow-123', 'user-123', { triggerData: 'test' });

      // Find the completion update
      const completionUpdate = executionRecords.find(r => r.status === 'completed');
      expect(completionUpdate).toBeDefined();
      expect(completionUpdate.results).toBeDefined();

      // Verify ExecutionContext structure
      const context = completionUpdate.results;
      expect(context).toHaveProperty('userId');
      expect(context).toHaveProperty('workflowId');
      expect(context).toHaveProperty('executionId');
      expect(context).toHaveProperty('variables');
      expect(context).toHaveProperty('nodeOutputs');
      expect(context).toHaveProperty('currentNodeId');
      expect(context).toHaveProperty('executionPath');
    });

    it('should store variables set during execution', async () => {
      await executor.execute('workflow-123', 'user-123', {});

      const completionUpdate = executionRecords.find(r => r.status === 'completed');
      const context = completionUpdate.results;

      // Verify the variable set by SuccessNode
      expect(context.variables).toHaveProperty('testVar', 'testValue');
    });

    it('should store node outputs in ExecutionContext', async () => {
      await executor.execute('workflow-123', 'user-123', {});

      const completionUpdate = executionRecords.find(r => r.status === 'completed');
      const context = completionUpdate.results;

      // Verify node output is stored
      expect(context.nodeOutputs).toHaveProperty('node-1');
      expect(context.nodeOutputs['node-1']).toHaveProperty('result', 'success');
    });

    it('should store execution path in ExecutionContext', async () => {
      await executor.execute('workflow-123', 'user-123', {});

      const completionUpdate = executionRecords.find(r => r.status === 'completed');
      const context = completionUpdate.results;

      // Verify execution path
      expect(context.executionPath).toContain('node-1');
    });
  });

  describe('2. Store error messages and stack traces', () => {
    beforeEach(() => {
      // Mock workflow with failing node
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'workflows') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'workflow-123',
                user_id: 'user-123',
                nodes: [
                  { id: 'node-1', type: 'test-failure-node', config: {} },
                ],
                edges: [],
                metadata: {},
              },
              error: null,
            }),
          };
        } else if (table === 'executions') {
          return {
            insert: jest.fn().mockReturnThis(),
            update: jest.fn((data: any) => {
              executionRecords.push(data);
              return {
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'exec-123' },
              error: null,
            }),
          };
        } else if (table === 'execution_logs') {
          return {
            insert: jest.fn((data: any) => {
              executionLogs.push(data);
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                  data: { id: `log-${executionLogs.length}` },
                  error: null,
                }),
              };
            }),
            update: jest.fn((data: any) => {
              const lastLog = executionLogs[executionLogs.length - 1];
              Object.assign(lastLog, data);
              return {
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        return {};
      });
    });

    it('should store error message for failed execution', async () => {
      try {
        await executor.execute('workflow-123', 'user-123', {});
      } catch (error) {
        // Expected to fail
      }

      const failureUpdate = executionRecords.find(r => r.status === 'failed');
      expect(failureUpdate).toBeDefined();
      expect(failureUpdate.error).toBeDefined();
      expect(failureUpdate.error).toContain('Test node failure');
    });

    it('should store stack trace for failed execution', async () => {
      try {
        await executor.execute('workflow-123', 'user-123', {});
      } catch (error) {
        // Expected to fail
      }

      const failureUpdate = executionRecords.find(r => r.status === 'failed');
      expect(failureUpdate.error).toContain('Stack Trace:');
    });

    it('should store error in node execution log', async () => {
      try {
        await executor.execute('workflow-123', 'user-123', {});
      } catch (error) {
        // Expected to fail
      }

      // Find the failed node log
      const failedLog = executionLogs.find(log => log.status === 'failed');
      expect(failedLog).toBeDefined();
      expect(failedLog.error).toBeDefined();
      expect(failedLog.error).toContain('Test node failure');
    });

    it('should store stack trace in node execution log', async () => {
      try {
        await executor.execute('workflow-123', 'user-123', {});
      } catch (error) {
        // Expected to fail
      }

      const failedLog = executionLogs.find(log => log.status === 'failed');
      expect(failedLog.error).toContain('Stack Trace:');
    });
  });

  describe('3. Store individual node execution results and timings', () => {
    it('should create execution log entry for each node', async () => {
      await executor.execute('workflow-123', 'user-123', {});

      // Should have at least one log entry
      expect(executionLogs.length).toBeGreaterThan(0);
    });

    it('should store node input in execution log', async () => {
      await executor.execute('workflow-123', 'user-123', { inputData: 'test' });

      const log = executionLogs[0];
      expect(log).toHaveProperty('input');
    });

    it('should store node output in execution log', async () => {
      await executor.execute('workflow-123', 'user-123', {});

      // Find the completed log entry
      const completedLog = executionLogs.find(log => log.status === 'completed');
      expect(completedLog).toBeDefined();
      expect(completedLog.output).toBeDefined();
      expect(completedLog.output).toHaveProperty('result', 'success');
    });

    it('should store execution duration in milliseconds', async () => {
      await executor.execute('workflow-123', 'user-123', {});

      const completedLog = executionLogs.find(log => log.status === 'completed');
      expect(completedLog).toBeDefined();
      expect(completedLog.duration_ms).toBeDefined();
      expect(typeof completedLog.duration_ms).toBe('number');
      expect(completedLog.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should store node metadata (id, type, execution_id)', async () => {
      await executor.execute('workflow-123', 'user-123', {});

      const log = executionLogs[0];
      expect(log).toHaveProperty('execution_id', 'exec-123');
      expect(log).toHaveProperty('node_id', 'node-1');
      expect(log).toHaveProperty('node_type', 'test-success-node');
    });

    it('should store timestamps (started_at, completed_at)', async () => {
      await executor.execute('workflow-123', 'user-123', {});

      const completedLog = executionLogs.find(log => log.status === 'completed');
      expect(completedLog).toBeDefined();
      expect(completedLog.started_at).toBeDefined();
      expect(completedLog.completed_at).toBeDefined();
    });
  });
});
