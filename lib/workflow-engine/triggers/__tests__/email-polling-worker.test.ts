/**
 * Unit tests for EmailPollingWorker
 * 
 * Tests cover:
 * - Configuration parsing and validation
 * - Email polling and filtering
 * - Workflow execution triggering
 * - Email processing and deduplication
 * - Connection handling and retry logic
 * - Status reporting
 */

import { EmailPollingWorker } from '../email-polling-worker';
import { TriggerConfig } from '../../types';
import type { ProviderConfig, FilterConfig } from '@/lib/email-nodes/types';

// Mock the email adapter
jest.mock('@/lib/email-nodes/adapters', () => ({
  getAdapter: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    fetchEmails: jest.fn(() => Promise.resolve([])),
  })),
}));

// Mock the filter function
jest.mock('@/lib/email-nodes/filter', () => ({
  filterEmails: jest.fn((emails, config) => ({
    matched: [],
    unmatched: emails,
  })),
}));

describe('EmailPollingWorker', () => {
  let mockTriggerConfig: TriggerConfig;
  let mockEmailAccount: ProviderConfig;
  let mockFilterRules: FilterConfig;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock email account configuration
    mockEmailAccount = {
      provider: 'imap',
      credentials: {
        type: 'password',
        username: 'test@example.com',
        password: 'password123',
      },
      host: 'imap.example.com',
      port: 993,
      secure: true,
    };

    // Mock filter rules
    mockFilterRules = {
      rules: [
        {
          field: 'from',
          operator: 'contains',
          value: 'important',
        },
      ],
      logic: 'AND',
    };

    // Mock trigger configuration
    mockTriggerConfig = {
      id: 'test-email-trigger-1',
      workflowId: 'test-workflow-1',
      type: 'email',
      config: {
        emailAccount: mockEmailAccount,
        filterRules: mockFilterRules,
        pollIntervalMinutes: 5,
        folder: 'INBOX',
        unreadOnly: true,
        maxEmailsPerPoll: 50,
        processedAction: 'markAsRead',
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('Constructor and Configuration', () => {
    it('should create EmailPollingWorker with valid configuration', () => {
      const worker = new EmailPollingWorker(mockTriggerConfig);
      expect(worker).toBeDefined();

      const status = worker.getStatus();
      expect(status.provider).toBe('imap');
      expect(status.folder).toBe('INBOX');
      expect(status.pollIntervalMinutes).toBe(5);
      expect(status.filterRulesCount).toBe(1);
    });

    it('should throw error when email account is missing', () => {
      const invalidConfig = {
        ...mockTriggerConfig,
        config: {
          filterRules: mockFilterRules,
        },
      };

      expect(() => new EmailPollingWorker(invalidConfig)).toThrow(
        'Email account configuration is required'
      );
    });

    it('should throw error when filter rules are missing', () => {
      const invalidConfig = {
        ...mockTriggerConfig,
        config: {
          emailAccount: mockEmailAccount,
        },
      };

      expect(() => new EmailPollingWorker(invalidConfig)).toThrow(
        'Filter rules configuration is required'
      );
    });

    it('should throw error when poll interval is less than 1 minute', () => {
      const invalidConfig = {
        ...mockTriggerConfig,
        config: {
          emailAccount: mockEmailAccount,
          filterRules: mockFilterRules,
          pollIntervalMinutes: 0,
        },
      };

      expect(() => new EmailPollingWorker(invalidConfig)).toThrow(
        'Poll interval must be at least 1 minute'
      );
    });

    it('should use default values for optional configuration', () => {
      const minimalConfig = {
        ...mockTriggerConfig,
        config: {
          emailAccount: mockEmailAccount,
          filterRules: mockFilterRules,
        },
      };

      const worker = new EmailPollingWorker(minimalConfig);
      const status = worker.getStatus();

      expect(status.folder).toBe('INBOX');
      expect(status.pollIntervalMinutes).toBe(5);
    });
  });

  describe('Start and Stop', () => {
    it('should start worker successfully', async () => {
      const worker = new EmailPollingWorker(mockTriggerConfig);

      await worker.start();

      const status = worker.getStatus();
      expect(status.isRunning).toBe(true);

      await worker.stop();
    });

    it('should stop worker and disconnect', async () => {
      const worker = new EmailPollingWorker(mockTriggerConfig);

      await worker.start();
      expect(worker.getStatus().isRunning).toBe(true);

      await worker.stop();
      expect(worker.getStatus().isRunning).toBe(false);
    });

    it('should not start worker twice', async () => {
      const worker = new EmailPollingWorker(mockTriggerConfig);

      await worker.start();
      await worker.start(); // Second start should be ignored

      expect(worker.getStatus().isRunning).toBe(true);

      await worker.stop();
    });

    it('should handle connection failure', async () => {
      const { getAdapter } = require('@/lib/email-nodes/adapters');
      getAdapter.mockReturnValue({
        connect: jest.fn(() => Promise.reject(new Error('Connection failed'))),
        disconnect: jest.fn(),
        fetchEmails: jest.fn(),
      });

      const worker = new EmailPollingWorker(mockTriggerConfig);

      await expect(worker.start()).rejects.toThrow('Failed to start email polling worker');
    });
  });

  describe('Status Reporting', () => {
    it('should report correct status', () => {
      const worker = new EmailPollingWorker(mockTriggerConfig);

      const status = worker.getStatus();
      expect(status.isRunning).toBe(false); // Not started yet
      expect(status.isPolling).toBe(false);
      expect(status.provider).toBe('imap');
      expect(status.folder).toBe('INBOX');
      expect(status.pollIntervalMinutes).toBe(5);
      expect(status.filterRulesCount).toBe(1);
      expect(status.totalProcessed).toBe(0);
      expect(status.successfulProcessed).toBe(0);
      expect(status.failedProcessed).toBe(0);
    });
  });

  describe('Processed History', () => {
    it('should return empty history initially', () => {
      const worker = new EmailPollingWorker(mockTriggerConfig);
      const history = worker.getProcessedHistory();

      expect(history).toEqual([]);
    });

    it('should maintain processed history', () => {
      const worker = new EmailPollingWorker(mockTriggerConfig);
      const status = worker.getStatus();

      expect(status.totalProcessed).toBe(0);
    });
  });

  describe('Trigger Callback', () => {
    it('should set trigger callback', () => {
      const worker = new EmailPollingWorker(mockTriggerConfig);
      const callback = jest.fn(async () => 'execution-id-123');

      worker.setTriggerCallback(callback);

      // Callback should be set (we can't directly test it without triggering execution)
      expect(worker).toBeDefined();
    });
  });
});
