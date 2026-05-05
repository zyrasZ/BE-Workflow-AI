/**
 * Unit tests for WebhookWorker
 * 
 * Tests cover:
 * - Webhook URL generation
 * - Configuration parsing and validation
 * - Authentication validation (none, apiKey, signature)
 * - Request validation (method, content-type, headers)
 * - Workflow execution triggering
 * - Request history recording
 * - Worker start/stop (passive mode)
 */

import { WebhookWorker } from '../webhook-worker';
import { TriggerConfig } from '../../types';

describe('WebhookWorker', () => {
  let mockTriggerConfig: TriggerConfig;

  beforeEach(() => {
    mockTriggerConfig = {
      id: 'test-trigger-1',
      workflowId: 'test-workflow-1',
      type: 'webhook',
      config: {
        authType: 'none',
        allowedMethods: ['POST'],
        allowedContentTypes: ['application/json'],
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('Constructor and Configuration', () => {
    it('should create WebhookWorker with valid configuration', () => {
      const worker = new WebhookWorker(mockTriggerConfig);
      expect(worker).toBeDefined();
      
      const config = worker.getWebhookConfig();
      expect(config.authType).toBe('none');
      expect(config.allowedMethods).toContain('POST');
    });

    it('should generate webhook URL automatically', () => {
      const worker = new WebhookWorker(mockTriggerConfig);
      const config = worker.getWebhookConfig();
      
      expect(config.webhookUrl).toBe('/api/workflows/test-workflow-1/webhook/test-trigger-1');
    });

    it('should use provided webhook URL if specified', () => {
      const configWithUrl = {
        ...mockTriggerConfig,
        config: {
          ...mockTriggerConfig.config,
          webhookUrl: '/custom/webhook/url',
        },
      };

      const worker = new WebhookWorker(configWithUrl);
      const config = worker.getWebhookConfig();
      
      expect(config.webhookUrl).toBe('/custom/webhook/url');
    });

    it('should throw error when authType is apiKey but apiKey is missing', () => {
      const invalidConfig = {
        ...mockTriggerConfig,
        config: {
          authType: 'apiKey',
        },
      };

      expect(() => new WebhookWorker(invalidConfig)).toThrow('apiKey is required');
    });

    it('should throw error when authType is signature but secret is missing', () => {
      const invalidConfig = {
        ...mockTriggerConfig,
        config: {
          authType: 'signature',
        },
      };

      expect(() => new WebhookWorker(invalidConfig)).toThrow('secret is required');
    });

    it('should throw error for invalid authType', () => {
      const invalidConfig = {
        ...mockTriggerConfig,
        config: {
          authType: 'invalid',
        },
      };

      expect(() => new WebhookWorker(invalidConfig)).toThrow('Invalid authType');
    });
  });

  describe('Start and Stop (Passive Mode)', () => {
    it('should start worker in passive mode', async () => {
      const worker = new WebhookWorker(mockTriggerConfig);
      await worker.start();

      const status = worker.getStatus();
      expect(status.isActive).toBe(true);

      await worker.stop();
    });

    it('should stop worker', async () => {
      const worker = new WebhookWorker(mockTriggerConfig);
      await worker.start();
      expect(worker.getStatus().isActive).toBe(true);

      await worker.stop();
      expect(worker.getStatus().isActive).toBe(false);
    });

    it('should not start worker twice', async () => {
      const worker = new WebhookWorker(mockTriggerConfig);
      await worker.start();
      await worker.start(); // Second start should be ignored

      expect(worker.getStatus().isActive).toBe(true);

      await worker.stop();
    });
  });

  describe('Request Validation - No Authentication', () => {
    let worker: WebhookWorker;

    beforeEach(async () => {
      worker = new WebhookWorker(mockTriggerConfig);
      await worker.start();
    });

    afterEach(async () => {
      await worker.stop();
    });

    it('should validate valid POST request with JSON content-type', () => {
      const result = worker.validateRequest(
        'POST',
        { 'content-type': 'application/json' },
        { data: 'test' }
      );

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject request with invalid HTTP method', () => {
      const result = worker.validateRequest(
        'GET',
        { 'content-type': 'application/json' },
        {}
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Method GET not allowed');
    });

    it('should reject request with invalid content-type', () => {
      const result = worker.validateRequest(
        'POST',
        { 'content-type': 'text/plain' },
        {}
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Content-Type text/plain not allowed');
    });

    it('should reject request when worker is not active', async () => {
      await worker.stop();

      const result = worker.validateRequest(
        'POST',
        { 'content-type': 'application/json' },
        {}
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not active');
    });
  });

  describe('Request Validation - API Key Authentication', () => {
    let worker: WebhookWorker;
    const testApiKey = 'test-api-key-123';

    beforeEach(async () => {
      const config = {
        ...mockTriggerConfig,
        config: {
          authType: 'apiKey',
          apiKey: testApiKey,
          allowedMethods: ['POST'],
          allowedContentTypes: ['application/json'],
        },
      };
      worker = new WebhookWorker(config);
      await worker.start();
    });

    afterEach(async () => {
      await worker.stop();
    });

    it('should validate request with correct API key', () => {
      const result = worker.validateRequest(
        'POST',
        {
          'content-type': 'application/json',
          'x-api-key': testApiKey,
        },
        {}
      );

      expect(result.valid).toBe(true);
    });

    it('should reject request with missing API key', () => {
      const result = worker.validateRequest(
        'POST',
        { 'content-type': 'application/json' },
        {}
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing X-API-Key header');
    });

    it('should reject request with incorrect API key', () => {
      const result = worker.validateRequest(
        'POST',
        {
          'content-type': 'application/json',
          'x-api-key': 'wrong-key',
        },
        {}
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });
  });

  describe('Request Validation - Signature Authentication', () => {
    let worker: WebhookWorker;
    const testSecret = 'test-secret-123';

    beforeEach(async () => {
      const config = {
        ...mockTriggerConfig,
        config: {
          authType: 'signature',
          secret: testSecret,
          allowedMethods: ['POST'],
          allowedContentTypes: ['application/json'],
        },
      };
      worker = new WebhookWorker(config);
      await worker.start();
    });

    afterEach(async () => {
      await worker.stop();
    });

    it('should reject request with missing signature', () => {
      const result = worker.validateRequest(
        'POST',
        { 'content-type': 'application/json' },
        {}
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing X-Webhook-Signature header');
    });

    it('should accept request with signature header (validation not implemented yet)', () => {
      const result = worker.validateRequest(
        'POST',
        {
          'content-type': 'application/json',
          'x-webhook-signature': 'some-signature',
        },
        {}
      );

      // Currently passes because signature validation is not implemented
      // TODO: Implement actual HMAC-SHA256 signature validation
      expect(result.valid).toBe(true);
    });
  });

  describe('Request Validation - Custom Headers', () => {
    let worker: WebhookWorker;

    beforeEach(async () => {
      const config = {
        ...mockTriggerConfig,
        config: {
          authType: 'none',
          allowedMethods: ['POST'],
          allowedContentTypes: ['application/json'],
          customHeaders: {
            'x-custom-header': 'expected-value',
          },
        },
      };
      worker = new WebhookWorker(config);
      await worker.start();
    });

    afterEach(async () => {
      await worker.stop();
    });

    it('should validate request with correct custom headers', () => {
      const result = worker.validateRequest(
        'POST',
        {
          'content-type': 'application/json',
          'x-custom-header': 'expected-value',
        },
        {}
      );

      expect(result.valid).toBe(true);
    });

    it('should reject request with incorrect custom header value', () => {
      const result = worker.validateRequest(
        'POST',
        {
          'content-type': 'application/json',
          'x-custom-header': 'wrong-value',
        },
        {}
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid custom header');
    });

    it('should reject request with missing custom header', () => {
      const result = worker.validateRequest(
        'POST',
        { 'content-type': 'application/json' },
        {}
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid custom header');
    });
  });

  describe('Workflow Execution Triggering', () => {
    let worker: WebhookWorker;
    let mockCallback: jest.Mock;

    beforeEach(async () => {
      worker = new WebhookWorker(mockTriggerConfig);
      mockCallback = jest.fn().mockResolvedValue('execution-123');
      worker.setTriggerCallback(mockCallback);
      await worker.start();
    });

    afterEach(async () => {
      await worker.stop();
    });

    it('should trigger workflow execution with webhook data', async () => {
      const webhookData = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { test: 'data' },
      };

      await worker.triggerExecution(webhookData);

      expect(mockCallback).toHaveBeenCalledWith(webhookData);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should record successful execution in history', async () => {
      const webhookData = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { test: 'data' },
      };

      await worker.triggerExecution(webhookData);

      const history = worker.getRequestHistory();
      expect(history.length).toBe(1);
      expect(history[0].triggered).toBe(true);
      expect(history[0].executionId).toBe('execution-123');
    });

    it('should record failed execution in history', async () => {
      mockCallback.mockRejectedValue(new Error('Execution failed'));

      const webhookData = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: { test: 'data' },
      };

      await expect(worker.triggerExecution(webhookData)).rejects.toThrow('Execution failed');

      const history = worker.getRequestHistory();
      expect(history.length).toBe(1);
      expect(history[0].triggered).toBe(false);
      expect(history[0].error).toContain('Execution failed');
    });
  });

  describe('Status and History', () => {
    let worker: WebhookWorker;

    beforeEach(async () => {
      worker = new WebhookWorker(mockTriggerConfig);
      await worker.start();
    });

    afterEach(async () => {
      await worker.stop();
    });

    it('should return correct status', () => {
      const status = worker.getStatus();

      expect(status.isActive).toBe(true);
      expect(status.webhookUrl).toBe('/api/workflows/test-workflow-1/webhook/test-trigger-1');
      expect(status.authType).toBe('none');
      expect(status.totalRequests).toBe(0);
    });

    it('should return webhook configuration without sensitive data', () => {
      const config = worker.getWebhookConfig();

      expect(config.webhookUrl).toBeDefined();
      expect(config.authType).toBe('none');
      expect(config.hasSecret).toBe(false);
      expect(config.hasApiKey).toBe(false);
    });

    it('should indicate presence of secret without exposing it', async () => {
      const configWithSecret = {
        ...mockTriggerConfig,
        config: {
          authType: 'signature',
          secret: 'super-secret-key',
        },
      };

      const workerWithSecret = new WebhookWorker(configWithSecret);
      const config = workerWithSecret.getWebhookConfig();

      expect(config.hasSecret).toBe(true);
      expect(config).not.toHaveProperty('secret');
    });
  });

  describe('Static Helper Methods', () => {
    it('should generate random secret', () => {
      const secret1 = WebhookWorker.generateSecret();
      const secret2 = WebhookWorker.generateSecret();

      expect(secret1).toBeDefined();
      expect(secret1.length).toBeGreaterThan(0);
      expect(secret1).not.toBe(secret2); // Should be unique
    });

    it('should generate random API key', () => {
      const apiKey1 = WebhookWorker.generateApiKey();
      const apiKey2 = WebhookWorker.generateApiKey();

      expect(apiKey1).toBeDefined();
      expect(apiKey1).toMatch(/^wh_/); // Should start with 'wh_'
      expect(apiKey1).not.toBe(apiKey2); // Should be unique
    });
  });
});
