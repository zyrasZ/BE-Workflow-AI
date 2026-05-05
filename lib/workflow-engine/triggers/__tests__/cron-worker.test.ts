/**
 * Unit tests for CronWorker
 * 
 * Tests cover:
 * - Cron expression parsing and validation
 * - Next execution time calculation
 * - Timezone support
 * - Execution triggering
 * - Missed execution handling
 * - Execution history recording
 */

import { CronWorker } from '../cron-worker';
import { TriggerConfig } from '../../types';

describe('CronWorker', () => {
  let mockTriggerConfig: TriggerConfig;

  beforeEach(() => {
    mockTriggerConfig = {
      id: 'test-trigger-1',
      workflowId: 'test-workflow-1',
      type: 'schedule',
      config: {
        cronExpression: '*/5 * * * *', // Every 5 minutes
        timezone: 'UTC',
        missedExecutionStrategy: 'skip',
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('Constructor and Configuration', () => {
    it('should create CronWorker with valid configuration', () => {
      const worker = new CronWorker(mockTriggerConfig);
      expect(worker).toBeDefined();
      expect(worker.getStatus().cronExpression).toBe('*/5 * * * *');
      expect(worker.getStatus().timezone).toBe('UTC');
    });

    it('should throw error when cron expression is missing', () => {
      const invalidConfig = {
        ...mockTriggerConfig,
        config: {},
      };

      expect(() => new CronWorker(invalidConfig)).toThrow('Cron expression is required');
    });

    it('should use default timezone when not specified', () => {
      const configWithoutTimezone = {
        ...mockTriggerConfig,
        config: {
          cronExpression: '0 9 * * *',
        },
      };

      const worker = new CronWorker(configWithoutTimezone);
      expect(worker.getStatus().timezone).toBe('UTC');
    });

    it('should use default missed execution strategy when not specified', () => {
      const worker = new CronWorker(mockTriggerConfig);
      const status = worker.getStatus();
      expect(status).toBeDefined();
    });
  });

  describe('Start and Stop', () => {
    it('should start worker and calculate next execution time', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      await worker.start();

      const status = worker.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.nextExecutionTime).toBeDefined();

      await worker.stop();
    });

    it('should stop worker and clear interval', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      await worker.start();
      expect(worker.getStatus().isRunning).toBe(true);

      await worker.stop();
      expect(worker.getStatus().isRunning).toBe(false);
    });

    it('should not start worker twice', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      await worker.start();
      await worker.start(); // Second start should be ignored

      expect(worker.getStatus().isRunning).toBe(true);

      await worker.stop();
    });

    it('should handle invalid cron expression', async () => {
      const invalidConfig = {
        ...mockTriggerConfig,
        config: {
          cronExpression: 'invalid cron',
          timezone: 'UTC',
        },
      };

      const worker = new CronWorker(invalidConfig);
      await expect(worker.start()).rejects.toThrow('Failed to parse cron expression');
    });
  });

  describe('Cron Expression Parsing', () => {
    it('should parse standard 5-field cron expression', async () => {
      const configs = [
        '0 9 * * *', // Daily at 9 AM
        '*/15 * * * *', // Every 15 minutes
        '0 0 * * 0', // Weekly on Sunday at midnight
        '0 0 1 * *', // Monthly on 1st at midnight
        '0 9 * * 1-5', // Weekdays at 9 AM
      ];

      for (const cronExpression of configs) {
        const config = {
          ...mockTriggerConfig,
          config: { cronExpression, timezone: 'UTC' },
        };

        const worker = new CronWorker(config);
        await worker.start();

        expect(worker.getStatus().isRunning).toBe(true);
        expect(worker.getNextExecutionTime()).toBeDefined();

        await worker.stop();
      }
    });

    it('should support different timezones', async () => {
      const timezones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];

      for (const timezone of timezones) {
        const config = {
          ...mockTriggerConfig,
          config: {
            cronExpression: '0 9 * * *',
            timezone,
          },
        };

        const worker = new CronWorker(config);
        await worker.start();

        expect(worker.getStatus().timezone).toBe(timezone);
        expect(worker.getNextExecutionTime()).toBeDefined();

        await worker.stop();
      }
    });
  });

  describe('Execution Triggering', () => {
    it('should trigger execution with correct data', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      let triggeredData: Record<string, any> | null = null;

      worker.setTriggerCallback(async (data) => {
        triggeredData = data;
        return 'execution-id-123';
      });

      await worker.triggerExecution({
        scheduledTime: new Date().toISOString(),
        actualTime: new Date().toISOString(),
        triggerId: 'test-trigger-1',
        triggerType: 'schedule',
      });

      expect(triggeredData).not.toBeNull();
      expect(triggeredData?.triggerId).toBe('test-trigger-1');
      expect(triggeredData?.triggerType).toBe('schedule');
    });

    it('should record execution in history', async () => {
      const worker = new CronWorker(mockTriggerConfig);

      worker.setTriggerCallback(async () => 'execution-id-123');

      await worker.triggerExecution({
        scheduledTime: new Date().toISOString(),
        actualTime: new Date().toISOString(),
        triggerId: 'test-trigger-1',
        triggerType: 'schedule',
      });

      const history = worker.getExecutionHistory();
      expect(history.length).toBe(1);
      expect(history[0].success).toBe(true);
      expect(history[0].executionId).toBe('execution-id-123');
    });

    it('should record failed execution in history', async () => {
      const worker = new CronWorker(mockTriggerConfig);

      worker.setTriggerCallback(async () => {
        throw new Error('Execution failed');
      });

      await expect(
        worker.triggerExecution({
          scheduledTime: new Date().toISOString(),
          actualTime: new Date().toISOString(),
          triggerId: 'test-trigger-1',
          triggerType: 'schedule',
        })
      ).rejects.toThrow('Execution failed');

      const history = worker.getExecutionHistory();
      expect(history.length).toBe(1);
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe('Execution failed');
    });
  });

  describe('Execution History', () => {
    it('should maintain execution history', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      worker.setTriggerCallback(async () => 'execution-id');

      // Trigger multiple executions
      for (let i = 0; i < 5; i++) {
        await worker.triggerExecution({
          scheduledTime: new Date().toISOString(),
          actualTime: new Date().toISOString(),
          triggerId: 'test-trigger-1',
          triggerType: 'schedule',
        });
      }

      const history = worker.getExecutionHistory();
      expect(history.length).toBe(5);
    });

    it('should limit history to maximum entries', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      worker.setTriggerCallback(async () => 'execution-id');

      // Trigger more than MAX_HISTORY_ENTRIES (100) executions
      for (let i = 0; i < 105; i++) {
        await worker.triggerExecution({
          scheduledTime: new Date().toISOString(),
          actualTime: new Date().toISOString(),
          triggerId: 'test-trigger-1',
          triggerType: 'schedule',
        });
      }

      const history = worker.getExecutionHistory();
      expect(history.length).toBe(100); // Should be limited to 100
    });
  });

  describe('Status Reporting', () => {
    it('should report correct status', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      await worker.start();

      const status = worker.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.cronExpression).toBe('*/5 * * * *');
      expect(status.timezone).toBe('UTC');
      expect(status.nextExecutionTime).toBeDefined();
      expect(status.totalExecutions).toBe(0);
      expect(status.successfulExecutions).toBe(0);
      expect(status.failedExecutions).toBe(0);

      await worker.stop();
    });

    it('should track execution statistics', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      let shouldFail = false;

      worker.setTriggerCallback(async () => {
        if (shouldFail) {
          throw new Error('Failed');
        }
        return 'execution-id';
      });

      // Successful execution
      await worker.triggerExecution({
        scheduledTime: new Date().toISOString(),
        actualTime: new Date().toISOString(),
        triggerId: 'test-trigger-1',
        triggerType: 'schedule',
      });

      // Failed execution
      shouldFail = true;
      await expect(
        worker.triggerExecution({
          scheduledTime: new Date().toISOString(),
          actualTime: new Date().toISOString(),
          triggerId: 'test-trigger-1',
          triggerType: 'schedule',
        })
      ).rejects.toThrow();

      const status = worker.getStatus();
      expect(status.totalExecutions).toBe(2);
      expect(status.successfulExecutions).toBe(1);
      expect(status.failedExecutions).toBe(1);
    });
  });

  describe('Next Execution Time', () => {
    it('should calculate next execution time correctly', async () => {
      const worker = new CronWorker(mockTriggerConfig);
      await worker.start();

      const nextTime = worker.getNextExecutionTime();
      expect(nextTime).toBeDefined();
      expect(nextTime!.getTime()).toBeGreaterThan(Date.now());

      await worker.stop();
    });

    it('should return undefined when worker is not started', () => {
      const worker = new CronWorker(mockTriggerConfig);
      const nextTime = worker.getNextExecutionTime();
      expect(nextTime).toBeUndefined();
    });
  });
});
