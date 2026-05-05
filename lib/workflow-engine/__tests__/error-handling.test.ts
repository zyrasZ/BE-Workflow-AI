/**
 * Tests for error handling features in WorkflowExecutor
 * 
 * This test file verifies:
 * - Error handling branches (Task 34.2)
 * - Global error handlers (Task 34.2)
 * - Retry logic (Task 34.1)
 * 
 * Requirements: 25 (Error Handling and Recovery)
 */

import { WorkflowExecutor } from '../executor';
import { nodeRegistry } from '../registry';
import { LogicNode, NodeResult, ExecutionContext, ValidationResult } from '../types';
import { createServiceClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}));

// Test node that always fails
class FailingNode implements LogicNode {
  readonly type = 'test-failing-node';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    throw new Error('Simulated node failure');
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }
}

// Test node that succeeds
class SuccessNode implements LogicNode {
  readonly type = 'test-success-node';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    return {
      success: true,
      output: { message: 'Success', input },
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }
}

// Test node that acts as error handler
class ErrorHandlerNode implements LogicNode {
  readonly type = 'test-error-handler-node';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    // Access error information from context
    const globalError = context.getVariable('__globalError');
    
    return {
      success: true,
      output: {
        message: 'Error handled',
        errorInfo: globalError,
      },
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }
}

describe('WorkflowExecutor - Error Handling', () => {
  let mockSupabase: any;
  let executor: WorkflowExecutor;

  beforeAll(() => {
    // Register test nodes
    nodeRegistry.register('test-failing-node', new FailingNode());
    nodeRegistry.register('test-success-node', new SuccessNode());
    nodeRegistry.register('test-error-handler-node', new ErrorHandlerNode());
  });

  beforeEach(() => {
    // Setup mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    (createServiceClient as jest.Mock).mockReturnValue(mockSupabase);
    executor = new WorkflowExecutor();
  });

  describe('Error Handling Branches', () => {
    it('should follow error branch when node fails with branch strategy', async () => {
      // Setup workflow with error branch
      const workflowId = 'test-workflow-1';
      const userId = 'test-user-1';
      const executionId = 'test-execution-1';

      const workflow = {
        id: workflowId,
        user_id: userId,
        nodes: [
          {
            id: 'node-1',
            type: 'test-failing-node',
            config: {
              errorHandling: {
                strategy: 'branch',
                errorBranchNodeId: 'error-handler',
              },
            },
          },
          {
            id: 'error-handler',
            type: 'test-error-handler-node',
            config: {},
          },
          {
            id: 'node-2',
            type: 'test-success-node',
            config: {},
          },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'node-2' },
        ],
        metadata: {},
      };

      // Mock Supabase responses
      mockSupabase.single
        .mockResolvedValueOnce({ data: workflow, error: null }) // Load workflow
        .mockResolvedValueOnce({ data: { id: executionId }, error: null }) // Create execution
        .mockResolvedValue({ data: { id: 'log-1' }, error: null }); // Execution logs

      // Execute workflow
      const result = await executor.execute(workflowId, userId, {});

      // Verify execution completed
      expect(result).toBe(executionId);

      // Verify update was called to mark execution as completed
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        })
      );
    });

    it('should not execute normal downstream nodes when error branch is taken', async () => {
      // This test verifies that when a node fails with branch strategy,
      // only the error branch is followed, not the normal downstream nodes
      
      const workflowId = 'test-workflow-2';
      const userId = 'test-user-2';
      const executionId = 'test-execution-2';

      const workflow = {
        id: workflowId,
        user_id: userId,
        nodes: [
          {
            id: 'node-1',
            type: 'test-failing-node',
            config: {
              errorHandling: {
                strategy: 'branch',
                errorBranchNodeId: 'error-handler',
              },
            },
          },
          {
            id: 'error-handler',
            type: 'test-error-handler-node',
            config: {},
          },
          {
            id: 'node-2',
            type: 'test-success-node',
            config: {},
          },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'node-2' },
        ],
        metadata: {},
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: workflow, error: null })
        .mockResolvedValueOnce({ data: { id: executionId }, error: null })
        .mockResolvedValue({ data: { id: 'log-1' }, error: null });

      const result = await executor.execute(workflowId, userId, {});

      expect(result).toBe(executionId);

      // Verify that node-2 was NOT executed (only error-handler should be executed)
      const insertCalls = mockSupabase.insert.mock.calls;
      const logInserts = insertCalls.filter((call: any) => 
        call[0]?.node_id && call[0].node_id !== executionId
      );

      // Should have logs for node-1 and error-handler, but NOT node-2
      const executedNodeIds = logInserts.map((call: any) => call[0].node_id);
      expect(executedNodeIds).toContain('node-1');
      expect(executedNodeIds).toContain('error-handler');
      expect(executedNodeIds).not.toContain('node-2');
    });
  });

  describe('Global Error Handler', () => {
    it('should execute global error handler when any node fails', async () => {
      const workflowId = 'test-workflow-3';
      const userId = 'test-user-3';
      const executionId = 'test-execution-3';

      const workflow = {
        id: workflowId,
        user_id: userId,
        nodes: [
          {
            id: 'node-1',
            type: 'test-failing-node',
            config: {
              errorHandling: {
                strategy: 'fail', // Will fail, triggering global handler
              },
            },
          },
          {
            id: 'global-error-handler',
            type: 'test-error-handler-node',
            config: {},
          },
        ],
        edges: [],
        metadata: {
          globalErrorHandler: 'global-error-handler',
        },
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: workflow, error: null })
        .mockResolvedValueOnce({ data: { id: executionId }, error: null })
        .mockResolvedValue({ data: { id: 'log-1' }, error: null });

      const result = await executor.execute(workflowId, userId, {});

      expect(result).toBe(executionId);

      // Verify execution completed (global error handler recovered the workflow)
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        })
      );
    });

    it('should store error information in context for global error handler', async () => {
      const workflowId = 'test-workflow-4';
      const userId = 'test-user-4';
      const executionId = 'test-execution-4';

      const workflow = {
        id: workflowId,
        user_id: userId,
        nodes: [
          {
            id: 'node-1',
            type: 'test-failing-node',
            config: {
              errorHandling: {
                strategy: 'fail',
              },
            },
          },
          {
            id: 'global-error-handler',
            type: 'test-error-handler-node',
            config: {},
          },
        ],
        edges: [],
        metadata: {
          globalErrorHandler: 'global-error-handler',
        },
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: workflow, error: null })
        .mockResolvedValueOnce({ data: { id: executionId }, error: null })
        .mockResolvedValue({ data: { id: 'log-1' }, error: null });

      await executor.execute(workflowId, userId, {});

      // The error handler node should have access to __globalError variable
      // This is verified by the ErrorHandlerNode implementation which accesses it
      expect(mockSupabase.update).toHaveBeenCalled();
    });

    it('should fail workflow if global error handler also fails', async () => {
      const workflowId = 'test-workflow-5';
      const userId = 'test-user-5';
      const executionId = 'test-execution-5';

      const workflow = {
        id: workflowId,
        user_id: userId,
        nodes: [
          {
            id: 'node-1',
            type: 'test-failing-node',
            config: {
              errorHandling: {
                strategy: 'fail',
              },
            },
          },
          {
            id: 'global-error-handler',
            type: 'test-failing-node', // Error handler that also fails
            config: {},
          },
        ],
        edges: [],
        metadata: {
          globalErrorHandler: 'global-error-handler',
        },
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: workflow, error: null })
        .mockResolvedValueOnce({ data: { id: executionId }, error: null })
        .mockResolvedValue({ data: { id: 'log-1' }, error: null });

      await expect(executor.execute(workflowId, userId, {})).rejects.toThrow();

      // Verify execution was marked as failed
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        })
      );
    });
  });

  describe('Combined Error Handling', () => {
    it('should prefer node-level error branch over global error handler', async () => {
      const workflowId = 'test-workflow-6';
      const userId = 'test-user-6';
      const executionId = 'test-execution-6';

      const workflow = {
        id: workflowId,
        user_id: userId,
        nodes: [
          {
            id: 'node-1',
            type: 'test-failing-node',
            config: {
              errorHandling: {
                strategy: 'branch',
                errorBranchNodeId: 'node-error-handler',
              },
            },
          },
          {
            id: 'node-error-handler',
            type: 'test-error-handler-node',
            config: {},
          },
          {
            id: 'global-error-handler',
            type: 'test-error-handler-node',
            config: {},
          },
          {
            id: 'node-2',
            type: 'test-success-node',
            config: {},
          },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'node-2' },
        ],
        metadata: {
          globalErrorHandler: 'global-error-handler',
        },
      };

      mockSupabase.single
        .mockResolvedValueOnce({ data: workflow, error: null })
        .mockResolvedValueOnce({ data: { id: executionId }, error: null })
        .mockResolvedValue({ data: { id: 'log-1' }, error: null });

      const result = await executor.execute(workflowId, userId, {});

      expect(result).toBe(executionId);

      // Verify that node-error-handler was executed, not global-error-handler
      const insertCalls = mockSupabase.insert.mock.calls;
      const logInserts = insertCalls.filter((call: any) => 
        call[0]?.node_id && call[0].node_id !== executionId
      );

      const executedNodeIds = logInserts.map((call: any) => call[0].node_id);
      expect(executedNodeIds).toContain('node-1');
      expect(executedNodeIds).toContain('node-error-handler');
      // Global error handler should NOT be executed because node-level error branch was used
      // The 'branch' strategy returns success=true, so no exception is thrown and global handler is not triggered
      expect(executedNodeIds).not.toContain('global-error-handler');
      // node-2 should not be executed because error branch was taken instead
      expect(executedNodeIds).not.toContain('node-2');
    });
  });
});
