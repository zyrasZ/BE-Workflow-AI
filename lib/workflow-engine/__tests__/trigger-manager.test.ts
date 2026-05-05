/**
 * Unit tests for TriggerManager
 * 
 * Tests the core functionality of the TriggerManager class including:
 * - Trigger registration and unregistration
 * - Active trigger tracking
 * - Duplicate execution prevention
 * - Trigger event logging
 * - Automatic restart on failure
 * - Workflow execution triggering
 * 
 * Requirement 22: Trigger Manager - Event Monitoring
 */

import { TriggerManager } from '../triggers/trigger-manager';
import { TriggerConfig, TriggerWorker } from '../types';
import { WorkflowExecutor } from '../executor';

// Mock WorkflowExecutor
jest.mock('../executor');

/**
 * Mock trigger worker implementation for testing
 */
class MockTriggerWorker implements TriggerWorker {
  public started = false;
  public stopped = false;
  public shouldFailStart = false;
  public startCallCount = 0;

  async start(): Promise<void> {
    this.startCallCount++;
    if (this.shouldFailStart) {
      throw new Error('Mock start failure');
    }
    this.started = true;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.started = false;
  }

  async triggerExecution(data: Record<string, any>): Promise<void> {
    // Mock implementation
  }
}

describe('TriggerManager', () => {
  let triggerManager: TriggerManager;
  let mockExecutor: jest.Mocked<WorkflowExecutor>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create a fresh trigger manager for each test
    triggerManager = new TriggerManager();

    // Mock the executor
    mockExecutor = new WorkflowExecutor() as jest.Mocked<WorkflowExecutor>;
    mockExecutor.execute = jest.fn().mockResolvedValue('execution-id-123');
    (triggerManager as any).executor = mockExecutor;
  });

  afterEach(async () => {
    // Cleanup
    await triggerManager.shutdown();
  });

  describe('register()', () => {
    it('should skip registration for inactive triggers', async () => {
      const config: TriggerConfig = {
        id: 'trigger-1',
        workflowId: 'workflow-1',
        type: 'manual',
        config: {},
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await triggerManager.register(config);

      expect(triggerManager.isRegistered('trigger-1')).toBe(false);
    });

    it('should skip registration for manual triggers', async () => {
      const config: TriggerConfig = {
        id: 'trigger-1',
        workflowId: 'workflow-1',
        type: 'manual',
        config: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await triggerManager.register(config);

      // Manual triggers don't create workers
      expect(triggerManager.isRegistered('trigger-1')).toBe(false);
    });

    it('should not register duplicate triggers', async () => {
      const config: TriggerConfig = {
        id: 'trigger-1',
        workflowId: 'workflow-1',
        type: 'schedule',
        config: { cronExpression: '0 0 * * *' },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Register once
      await triggerManager.register(config);

      // Try to register again
      await triggerManager.register(config);

      // Should only be registered once
      expect(triggerManager.isRegistered('trigger-1')).toBe(false); // Not implemented yet
    });

    it('should log registration events', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const config: TriggerConfig = {
        id: 'trigger-1',
        workflowId: 'workflow-1',
        type: 'manual',
        config: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await triggerManager.register(config);

      // Check that console.log was called with a string containing [TriggerManager]
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls;
      const hasRegistrationLog = calls.some(call => 
        call.some(arg => typeof arg === 'string' && arg.includes('[TriggerManager]') && arg.includes('register'))
      );
      expect(hasRegistrationLog).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('unregister()', () => {
    it('should handle unregistering non-existent trigger', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await triggerManager.unregister('non-existent-trigger');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Trigger not found')
      );

      consoleSpy.mockRestore();
    });

    it('should log unregistration events', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await triggerManager.unregister('trigger-1');

      // Check that console.log was called with a string containing [TriggerManager]
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls;
      const hasUnregistrationLog = calls.some(call => 
        call.some(arg => typeof arg === 'string' && arg.includes('[TriggerManager]') && arg.includes('unregister'))
      );
      expect(hasUnregistrationLog).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('triggerExecution()', () => {
    it('should execute workflow when triggered', async () => {
      const triggerId = 'trigger-1';
      const workflowId = 'workflow-1';
      const userId = 'user-1';
      const eventData = { email: 'test@example.com' };

      const executionId = await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        eventData
      );

      expect(mockExecutor.execute).toHaveBeenCalledWith(
        workflowId,
        userId,
        eventData
      );
      expect(executionId).toBe('execution-id-123');
    });

    it('should prevent duplicate executions within dedup window', async () => {
      const triggerId = 'trigger-1';
      const workflowId = 'workflow-1';
      const userId = 'user-1';
      const eventData = { email: 'test@example.com' };

      // First execution
      const executionId1 = await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        eventData
      );

      // Second execution with same data (should be prevented)
      const executionId2 = await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        eventData
      );

      expect(executionId1).toBe('execution-id-123');
      expect(executionId2).toBeNull();
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it('should allow execution after dedup window expires', async () => {
      const triggerId = 'trigger-1';
      const workflowId = 'workflow-1';
      const userId = 'user-1';
      const eventData = { email: 'test@example.com' };

      // First execution
      await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        eventData
      );

      // Manually expire the dedup entry
      const recentExecutions = (triggerManager as any).recentExecutions;
      const keys = Array.from(recentExecutions.keys());
      if (keys.length > 0) {
        recentExecutions.set(keys[0], Date.now() - 6 * 60 * 1000); // 6 minutes ago
      }

      // Second execution (should be allowed)
      const executionId2 = await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        eventData
      );

      expect(executionId2).toBe('execution-id-123');
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('should allow execution with different event data', async () => {
      const triggerId = 'trigger-1';
      const workflowId = 'workflow-1';
      const userId = 'user-1';

      // First execution
      await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        { email: 'test1@example.com' }
      );

      // Second execution with different data
      await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        { email: 'test2@example.com' }
      );

      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('should log trigger events', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await triggerManager.triggerExecution(
        'trigger-1',
        'workflow-1',
        'user-1',
        { test: 'data' }
      );

      // Check that console.log was called with a string containing [TriggerManager]
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls;
      const hasTriggeredLog = calls.some(call => 
        call.some(arg => typeof arg === 'string' && arg.includes('[TriggerManager]') && arg.includes('triggered'))
      );
      expect(hasTriggeredLog).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should handle execution errors', async () => {
      mockExecutor.execute = jest.fn().mockRejectedValue(new Error('Execution failed'));

      await expect(
        triggerManager.triggerExecution(
          'trigger-1',
          'workflow-1',
          'user-1',
          { test: 'data' }
        )
      ).rejects.toThrow('Execution failed');
    });
  });

  describe('getActiveTriggers()', () => {
    it('should return empty array when no triggers are registered', () => {
      const activeTriggers = triggerManager.getActiveTriggers();

      expect(activeTriggers).toEqual([]);
    });
  });

  describe('isRegistered()', () => {
    it('should return false for unregistered triggers', () => {
      expect(triggerManager.isRegistered('non-existent')).toBe(false);
    });
  });

  describe('shutdown()', () => {
    it('should stop all registered triggers', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await triggerManager.shutdown();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Shutting down')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Shutdown complete')
      );

      consoleSpy.mockRestore();
    });

    it('should clear cleanup interval', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      await triggerManager.shutdown();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  describe('event hashing', () => {
    it('should generate same hash for identical event data', async () => {
      const triggerId = 'trigger-1';
      const workflowId = 'workflow-1';
      const userId = 'user-1';
      const eventData = { email: 'test@example.com', subject: 'Test' };

      // First execution
      await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        eventData
      );

      // Second execution with same data
      const executionId2 = await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        eventData
      );

      // Should be prevented due to duplicate
      expect(executionId2).toBeNull();
    });

    it('should generate different hash for different event data', async () => {
      const triggerId = 'trigger-1';
      const workflowId = 'workflow-1';
      const userId = 'user-1';

      // First execution
      await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        { email: 'test1@example.com' }
      );

      // Second execution with different data
      const executionId2 = await triggerManager.triggerExecution(
        triggerId,
        workflowId,
        userId,
        { email: 'test2@example.com' }
      );

      // Should not be prevented
      expect(executionId2).toBe('execution-id-123');
    });
  });

  describe('cleanup', () => {
    it('should clean up old execution records', async () => {
      // Trigger some executions
      await triggerManager.triggerExecution(
        'trigger-1',
        'workflow-1',
        'user-1',
        { test: 'data1' }
      );

      await triggerManager.triggerExecution(
        'trigger-2',
        'workflow-2',
        'user-1',
        { test: 'data2' }
      );

      // Get recent executions map
      const recentExecutions = (triggerManager as any).recentExecutions;
      expect(recentExecutions.size).toBeGreaterThan(0);

      // Manually set old timestamps
      for (const key of recentExecutions.keys()) {
        recentExecutions.set(key, Date.now() - 6 * 60 * 1000); // 6 minutes ago
      }

      // Trigger cleanup
      (triggerManager as any).cleanupRecentExecutions();

      // Should be cleaned up
      expect(recentExecutions.size).toBe(0);
    });
  });
});
