/**
 * Webhook Worker for HTTP Webhook-based Workflow Triggers
 * 
 * This module implements the WebhookWorker class that handles webhook-based workflow triggers.
 * Unlike other trigger workers, this is a passive worker that doesn't actively poll or monitor.
 * It manages webhook configuration and generates unique webhook URLs. The actual HTTP endpoint
 * handling is done by the API route (Task 33.2).
 * 
 * Features:
 * - Generate unique webhook URL when workflow with webhook trigger is created
 * - Store webhook configuration in trigger_configs
 * - No active polling needed - webhook is passive endpoint
 * - Support optional authentication (API key, signature)
 * - Validate webhook configuration
 * 
 * Requirement 12: Trigger - Webhook Trigger
 */

import { TriggerWorker, TriggerConfig } from '../types';
import { randomBytes } from 'crypto';

/**
 * Configuration for Webhook Worker
 */
interface WebhookWorkerConfig {
  /**
   * Webhook secret for signature validation (optional)
   * If provided, incoming webhook requests must include a valid signature
   * 
   * Requirement 12: Webhook Trigger SHALL validate the request against optional authentication configuration
   */
  secret?: string;

  /**
   * Authentication type
   * - 'none': No authentication required (default)
   * - 'apiKey': Require API key in header
   * - 'signature': Require HMAC signature validation
   * 
   * Requirement 12: Webhook Trigger SHALL validate the request against optional authentication configuration (API key, signature)
   */
  authType?: 'none' | 'apiKey' | 'signature';

  /**
   * API key for authentication (when authType is 'apiKey')
   */
  apiKey?: string;

  /**
   * Custom headers to validate (optional)
   * Key-value pairs that must be present in incoming requests
   */
  customHeaders?: Record<string, string>;

  /**
   * Allowed HTTP methods
   * Default: ['POST']
   */
  allowedMethods?: string[];

  /**
   * Allowed content types
   * Default: ['application/json', 'application/x-www-form-urlencoded']
   */
  allowedContentTypes?: string[];

  /**
   * Maximum request body size in bytes
   * Default: 1MB
   */
  maxBodySize?: number;

  /**
   * Webhook URL (generated automatically)
   * Format: /api/workflows/[workflowId]/webhook/[triggerId]
   * 
   * Requirement 12: When a workflow with Webhook_Trigger is created, System SHALL generate a unique webhook URL
   */
  webhookUrl?: string;
}

/**
 * Webhook request history entry
 */
interface WebhookRequestEntry {
  /**
   * Request timestamp
   */
  timestamp: Date;

  /**
   * HTTP method
   */
  method: string;

  /**
   * Request headers
   */
  headers: Record<string, string>;

  /**
   * Request body (truncated if too large)
   */
  body: any;

  /**
   * Whether request was authenticated successfully
   */
  authenticated: boolean;

  /**
   * Whether workflow execution was triggered
   */
  triggered: boolean;

  /**
   * Execution ID if workflow was triggered
   */
  executionId?: string;

  /**
   * Error message if request failed
   */
  error?: string;
}

/**
 * WebhookWorker implements webhook-based workflow triggers
 * 
 * This is a passive worker - it doesn't actively poll or monitor.
 * It only manages webhook configuration and generates unique URLs.
 * The actual HTTP endpoint handling is done by the API route.
 * 
 * Requirement 12: Webhook Trigger
 */
export class WebhookWorker implements TriggerWorker {
  /**
   * Trigger configuration
   */
  private config: TriggerConfig;

  /**
   * Webhook worker specific configuration
   */
  private webhookConfig: WebhookWorkerConfig;

  /**
   * Whether the worker is currently active
   */
  private isActive: boolean = false;

  /**
   * Webhook request history (keep last 100 entries)
   */
  private requestHistory: WebhookRequestEntry[] = [];

  /**
   * Maximum history entries to keep
   */
  private readonly MAX_HISTORY_ENTRIES = 100;

  /**
   * Callback function to trigger workflow execution
   */
  private triggerCallback?: (data: Record<string, any>) => Promise<string>;

  /**
   * Create a new WebhookWorker instance
   * 
   * @param config - Trigger configuration
   * 
   * Requirement 12: Webhook Trigger SHALL accept HTTP POST requests at the generated URL
   */
  constructor(config: TriggerConfig) {
    this.config = config;
    this.webhookConfig = this.parseWebhookConfig(config.config);

    // Generate webhook URL if not already set
    if (!this.webhookConfig.webhookUrl) {
      this.webhookConfig.webhookUrl = this.generateWebhookUrl();
    }
  }

  /**
   * Parse and validate webhook configuration
   * 
   * @param config - Raw configuration object
   * @returns Parsed webhook configuration
   */
  private parseWebhookConfig(config: Record<string, any>): WebhookWorkerConfig {
    const authType = config.authType || 'none';

    // Validate authType
    if (!['none', 'apiKey', 'signature'].includes(authType)) {
      throw new Error(`Invalid authType: ${authType}. Must be 'none', 'apiKey', or 'signature'`);
    }

    // Validate required fields based on authType
    if (authType === 'apiKey' && !config.apiKey) {
      throw new Error('apiKey is required when authType is "apiKey"');
    }

    if (authType === 'signature' && !config.secret) {
      throw new Error('secret is required when authType is "signature"');
    }

    return {
      secret: config.secret,
      authType,
      apiKey: config.apiKey,
      customHeaders: config.customHeaders || {},
      allowedMethods: config.allowedMethods || ['POST'],
      allowedContentTypes: config.allowedContentTypes || [
        'application/json',
        'application/x-www-form-urlencoded',
      ],
      maxBodySize: config.maxBodySize || 1024 * 1024, // 1MB default
      webhookUrl: config.webhookUrl,
    };
  }

  /**
   * Generate unique webhook URL
   * 
   * @returns Webhook URL path
   * 
   * Requirement 12: When a workflow with Webhook_Trigger is created, System SHALL generate a unique webhook URL
   */
  private generateWebhookUrl(): string {
    // Format: /api/workflows/[workflowId]/webhook/[triggerId]
    return `/api/workflows/${this.config.workflowId}/webhook/${this.config.id}`;
  }

  /**
   * Generate a secure random secret for signature validation
   * 
   * @returns Random secret string (hex encoded)
   */
  static generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate a secure random API key
   * 
   * @returns Random API key string
   */
  static generateApiKey(): string {
    return `wh_${randomBytes(24).toString('base64url')}`;
  }

  /**
   * Start the webhook worker
   * 
   * This is a no-op for webhook workers since they are passive.
   * The worker is "active" when this is called, but no background
   * processes are started.
   * 
   * Requirement 12: Webhook Trigger is passive - no active polling needed
   */
  async start(): Promise<void> {
    if (this.isActive) {
      console.log(`[WebhookWorker] Already active: ${this.config.id}`);
      return;
    }

    console.log(`[WebhookWorker] Starting: ${this.config.id}`);
    console.log(`[WebhookWorker] Webhook URL: ${this.webhookConfig.webhookUrl}`);
    console.log(`[WebhookWorker] Auth type: ${this.webhookConfig.authType}`);
    console.log(`[WebhookWorker] Allowed methods: ${this.webhookConfig.allowedMethods?.join(', ')}`);

    this.isActive = true;

    console.log(`[WebhookWorker] Started successfully (passive mode): ${this.config.id}`);
  }

  /**
   * Stop the webhook worker
   * 
   * This is a no-op for webhook workers since they don't have
   * background processes to stop.
   * 
   * Requirement 22: When a workflow is deactivated, Trigger Manager SHALL stop monitoring its triggers
   */
  async stop(): Promise<void> {
    if (!this.isActive) {
      console.log(`[WebhookWorker] Not active: ${this.config.id}`);
      return;
    }

    console.log(`[WebhookWorker] Stopping: ${this.config.id}`);
    this.isActive = false;
    console.log(`[WebhookWorker] Stopped: ${this.config.id}`);
  }

  /**
   * Set the callback function for triggering workflow execution
   * 
   * @param callback - Function to call when execution should be triggered
   */
  setTriggerCallback(callback: (data: Record<string, any>) => Promise<string>): void {
    this.triggerCallback = callback;
  }

  /**
   * Trigger workflow execution
   * 
   * This method is called by the webhook API route when a valid
   * webhook request is received.
   * 
   * @param data - Event data to pass to workflow
   * 
   * Requirement 12: When validation succeeds, Webhook Trigger SHALL initiate workflow execution with request data as input
   */
  async triggerExecution(data: Record<string, any>): Promise<void> {
    try {
      console.log(`[WebhookWorker] Triggering workflow execution: ${this.config.id}`);

      // Call trigger callback if set
      let executionId: string | undefined;
      if (this.triggerCallback) {
        executionId = await this.triggerCallback(data);
      } else {
        console.warn(`[WebhookWorker] No trigger callback set: ${this.config.id}`);
      }

      console.log(`[WebhookWorker] Workflow execution triggered: ${executionId}`);

      // Record in history
      this.addRequestHistory({
        timestamp: new Date(),
        method: data.method || 'POST',
        headers: data.headers || {},
        body: data.body || {},
        authenticated: true,
        triggered: true,
        executionId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[WebhookWorker] Workflow execution failed: ${errorMessage}`);

      // Record failed execution in history
      this.addRequestHistory({
        timestamp: new Date(),
        method: data.method || 'POST',
        headers: data.headers || {},
        body: data.body || {},
        authenticated: true,
        triggered: false,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Validate webhook request authentication
   * 
   * This method is called by the webhook API route to validate
   * incoming requests before triggering workflow execution.
   * 
   * @param method - HTTP method
   * @param headers - Request headers
   * @param body - Request body
   * @returns Validation result with success flag and error message
   * 
   * Requirement 12: Webhook Trigger SHALL validate the request against optional authentication configuration
   */
  validateRequest(
    method: string,
    headers: Record<string, string>,
    body: any
  ): { valid: boolean; error?: string } {
    // Check if worker is active
    if (!this.isActive) {
      return { valid: false, error: 'Webhook trigger is not active' };
    }

    // Validate HTTP method
    if (!this.webhookConfig.allowedMethods?.includes(method.toUpperCase())) {
      return {
        valid: false,
        error: `Method ${method} not allowed. Allowed methods: ${this.webhookConfig.allowedMethods?.join(', ')}`,
      };
    }

    // Validate content type
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    const isAllowedContentType = this.webhookConfig.allowedContentTypes?.some(allowed =>
      contentType.toLowerCase().includes(allowed.toLowerCase())
    );

    if (!isAllowedContentType) {
      return {
        valid: false,
        error: `Content-Type ${contentType} not allowed. Allowed types: ${this.webhookConfig.allowedContentTypes?.join(', ')}`,
      };
    }

    // Validate authentication based on authType
    switch (this.webhookConfig.authType) {
      case 'none':
        // No authentication required
        break;

      case 'apiKey':
        const apiKey = headers['x-api-key'] || headers['X-API-Key'];
        if (!apiKey) {
          return { valid: false, error: 'Missing X-API-Key header' };
        }
        if (apiKey !== this.webhookConfig.apiKey) {
          return { valid: false, error: 'Invalid API key' };
        }
        break;

      case 'signature':
        const signature = headers['x-webhook-signature'] || headers['X-Webhook-Signature'];
        if (!signature) {
          return { valid: false, error: 'Missing X-Webhook-Signature header' };
        }

        // Validate signature (implementation depends on signature algorithm)
        // For now, we'll just check if signature is present
        // In production, you'd implement HMAC-SHA256 validation
        if (!this.webhookConfig.secret) {
          return { valid: false, error: 'Webhook secret not configured' };
        }
        // TODO: Implement actual signature validation
        // const isValidSignature = this.validateSignature(body, signature, this.webhookConfig.secret);
        // if (!isValidSignature) {
        //   return { valid: false, error: 'Invalid signature' };
        // }
        break;

      default:
        return { valid: false, error: `Unknown authType: ${this.webhookConfig.authType}` };
    }

    // Validate custom headers
    if (this.webhookConfig.customHeaders) {
      for (const [key, expectedValue] of Object.entries(this.webhookConfig.customHeaders)) {
        const actualValue = headers[key] || headers[key.toLowerCase()];
        if (actualValue !== expectedValue) {
          return {
            valid: false,
            error: `Invalid custom header: ${key}. Expected: ${expectedValue}, Got: ${actualValue}`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Add entry to request history
   * 
   * @param entry - Webhook request entry
   */
  private addRequestHistory(entry: WebhookRequestEntry): void {
    this.requestHistory.push(entry);

    // Keep only last MAX_HISTORY_ENTRIES
    if (this.requestHistory.length > this.MAX_HISTORY_ENTRIES) {
      this.requestHistory.shift();
    }
  }

  /**
   * Get webhook request history
   * 
   * @returns Array of webhook request entries
   */
  getRequestHistory(): WebhookRequestEntry[] {
    return [...this.requestHistory];
  }

  /**
   * Get webhook configuration
   * 
   * @returns Webhook configuration (without sensitive data)
   */
  getWebhookConfig(): {
    webhookUrl: string;
    authType: string;
    allowedMethods: string[];
    allowedContentTypes: string[];
    maxBodySize: number;
    hasSecret: boolean;
    hasApiKey: boolean;
    customHeadersCount: number;
  } {
    return {
      webhookUrl: this.webhookConfig.webhookUrl || '',
      authType: this.webhookConfig.authType || 'none',
      allowedMethods: this.webhookConfig.allowedMethods || ['POST'],
      allowedContentTypes: this.webhookConfig.allowedContentTypes || [],
      maxBodySize: this.webhookConfig.maxBodySize || 0,
      hasSecret: !!this.webhookConfig.secret,
      hasApiKey: !!this.webhookConfig.apiKey,
      customHeadersCount: Object.keys(this.webhookConfig.customHeaders || {}).length,
    };
  }

  /**
   * Get worker status
   * 
   * @returns Worker status information
   */
  getStatus(): {
    isActive: boolean;
    webhookUrl: string;
    authType: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    lastRequest?: WebhookRequestEntry;
  } {
    const lastRequest = this.requestHistory[this.requestHistory.length - 1];
    const successfulRequests = this.requestHistory.filter(e => e.triggered).length;
    const failedRequests = this.requestHistory.filter(e => !e.triggered).length;

    return {
      isActive: this.isActive,
      webhookUrl: this.webhookConfig.webhookUrl || '',
      authType: this.webhookConfig.authType || 'none',
      totalRequests: this.requestHistory.length,
      successfulRequests,
      failedRequests,
      lastRequest,
    };
  }
}
