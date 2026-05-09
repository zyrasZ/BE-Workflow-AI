/**
 * Email Polling Worker for Email-based Workflow Triggers
 * 
 * This module implements the EmailPollingWorker class that handles email-based workflow triggers.
 * It polls email servers at configurable intervals, fetches new emails, evaluates them against
 * filter rules, and initiates workflow execution when matches are found.
 * 
 * Features:
 * - Accept Email_Account configuration and filter rules
 * - Establish connection to email server (IMAP/Gmail/Outlook)
 * - Support polling mode with configurable interval (minimum 1 minute)
 * - Fetch new emails using existing /api/email/read logic
 * - Evaluate emails against configured filter rules
 * - Initiate workflow execution with email data as input when match found
 * - Mark processed emails (mark as read, move to folder, add label)
 * - Handle connection failures and automatically reconnect
 * 
 * Requirement 9: Trigger - Email Trigger
 */

import { TriggerWorker, TriggerConfig } from '../types';
import { getAdapter } from '@/lib/email-nodes/adapters';
import { filterEmails } from '@/lib/email-nodes/filter';
import type {
  ProviderConfig,
  FetchOptions,
  EmailMessage,
  FilterConfig,
  EmailProviderAdapter,
} from '@/lib/email-nodes/types';

/**
 * Configuration for Email Polling Worker
 */
interface EmailPollingConfig {
  /**
   * Email account configuration (provider, credentials, host, port)
   * 
   * Requirement 9: Email Trigger SHALL accept an Email_Account configuration
   */
  emailAccount: ProviderConfig;

  /**
   * Filter rules to evaluate emails against
   * 
   * Requirement 9: Email Trigger SHALL accept filter rules
   */
  filterRules: FilterConfig;

  /**
   * Polling interval in minutes (minimum 1 minute)
   * Default: 5 minutes
   * 
   * Requirement 9: Email Trigger SHALL support polling mode with configurable interval (minimum 1 minute)
   */
  pollIntervalMinutes?: number;

  /**
   * Folder/mailbox to monitor
   * Default: 'INBOX'
   */
  folder?: string;

  /**
   * Only fetch unread emails
   * Default: true
   */
  unreadOnly?: boolean;

  /**
   * Maximum number of emails to fetch per poll
   * Default: 50
   */
  maxEmailsPerPoll?: number;

  /**
   * Action to take on processed emails
   * - 'markAsRead': Mark email as read (default)
   * - 'moveToFolder': Move email to specified folder
   * - 'addLabel': Add label to email (Gmail only)
   * - 'none': Do nothing
   * 
   * Requirement 9: Email Trigger SHALL mark processed emails according to configuration
   */
  processedAction?: 'markAsRead' | 'moveToFolder' | 'addLabel' | 'none';

  /**
   * Target folder for moveToFolder action
   */
  targetFolder?: string;

  /**
   * Label to add for addLabel action (Gmail only)
   */
  label?: string;
}

/**
 * Email processing history entry
 */
interface ProcessedEmailEntry {
  /**
   * Email ID
   */
  emailId: string;

  /**
   * Email subject
   */
  subject: string;

  /**
   * Email sender
   */
  from: string;

  /**
   * When the email was processed
   */
  processedAt: Date;

  /**
   * Execution ID returned from workflow executor
   */
  executionId?: string;

  /**
   * Whether workflow execution was successful
   */
  success: boolean;

  /**
   * Error message if execution failed
   */
  error?: string;
}

/**
 * EmailPollingWorker implements email-based workflow triggers
 * 
 * Requirement 9: Email Trigger
 */
export class EmailPollingWorker implements TriggerWorker {
  /**
   * Trigger configuration
   */
  private config: TriggerConfig;

  /**
   * Email polling specific configuration
   */
  private emailConfig: EmailPollingConfig;

  /**
   * Email provider adapter
   */
  private adapter: EmailProviderAdapter | null = null;

  /**
   * Polling interval timer
   */
  private intervalId?: NodeJS.Timeout;

  /**
   * Minimum polling interval in milliseconds (1 minute)
   */
  private readonly MIN_POLL_INTERVAL_MS = 60 * 1000;

  /**
   * Whether the worker is currently running
   */
  private isRunning: boolean = false;

  /**
   * Whether currently polling (to prevent overlapping polls)
   */
  private isPolling: boolean = false;

  /**
   * Processed email history (keep last 100 entries)
   */
  private processedHistory: ProcessedEmailEntry[] = [];

  /**
   * Maximum history entries to keep
   */
  private readonly MAX_HISTORY_ENTRIES = 100;

  /**
   * Set of recently processed email IDs (for deduplication)
   * Key: emailId, Value: timestamp
   */
  private recentlyProcessed: Map<string, number> = new Map();

  /**
   * Deduplication window in milliseconds (1 hour)
   */
  private readonly DEDUP_WINDOW_MS = 60 * 60 * 1000;

  /**
   * Connection retry count
   */
  private connectionRetries: number = 0;

  /**
   * Maximum connection retries
   */
  private readonly MAX_CONNECTION_RETRIES = 3;

  /**
   * Callback function to trigger workflow execution
   */
  private triggerCallback?: (data: Record<string, any>) => Promise<string>;

  /**
   * Create a new EmailPollingWorker instance
   * 
   * @param config - Trigger configuration
   * 
   * Requirement 9: Email Trigger SHALL accept an Email_Account configuration and filter rules
   */
  constructor(config: TriggerConfig) {
    this.config = config;
    this.emailConfig = this.parseEmailConfig(config.config);
  }

  /**
   * Parse and validate email polling configuration
   * 
   * @param config - Raw configuration object
   * @returns Parsed email polling configuration
   */
  private parseEmailConfig(config: Record<string, any>): EmailPollingConfig {
    if (!config.emailAccount || typeof config.emailAccount !== 'object') {
      throw new Error('Email account configuration is required');
    }

    if (!config.filterRules || typeof config.filterRules !== 'object') {
      throw new Error('Filter rules configuration is required');
    }

    // Validate poll interval
    const pollIntervalMinutes = config.pollIntervalMinutes !== undefined ? config.pollIntervalMinutes : 5;
    if (pollIntervalMinutes < 1) {
      throw new Error('Poll interval must be at least 1 minute');
    }

    return {
      emailAccount: config.emailAccount as ProviderConfig,
      filterRules: config.filterRules as FilterConfig,
      pollIntervalMinutes,
      folder: config.folder || 'INBOX',
      unreadOnly: config.unreadOnly !== false, // Default true
      maxEmailsPerPoll: config.maxEmailsPerPoll || 50,
      processedAction: config.processedAction || 'markAsRead',
      targetFolder: config.targetFolder,
      label: config.label,
    };
  }

  /**
   * Start monitoring for new emails
   * 
   * Requirement 9: When Email Trigger is activated, Trigger Manager SHALL establish a connection to the email server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[EmailPollingWorker] Already running: ${this.config.id}`);
      return;
    }

    try {
      console.log(`[EmailPollingWorker] Starting: ${this.config.id}`);
      console.log(`[EmailPollingWorker] Provider: ${this.emailConfig.emailAccount.provider}`);
      console.log(`[EmailPollingWorker] Folder: ${this.emailConfig.folder}`);
      console.log(`[EmailPollingWorker] Poll interval: ${this.emailConfig.pollIntervalMinutes} minutes`);
      console.log(`[EmailPollingWorker] Filter rules: ${this.emailConfig.filterRules.rules.length} rules (${this.emailConfig.filterRules.logic} logic)`);

      // Get email adapter
      this.adapter = getAdapter(this.emailConfig.emailAccount);

      // Test connection
      await this.connectWithRetry();

      // Calculate polling interval
      const pollIntervalMs = Math.max(
        this.emailConfig.pollIntervalMinutes! * 60 * 1000,
        this.MIN_POLL_INTERVAL_MS
      );

      // Start polling interval
      this.intervalId = setInterval(() => {
        this.pollEmails();
      }, pollIntervalMs);

      this.isRunning = true;

      // Do initial poll immediately
      await this.pollEmails();

      console.log(`[EmailPollingWorker] Started successfully: ${this.config.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EmailPollingWorker] Failed to start: ${errorMessage}`);
      throw new Error(`Failed to start email polling worker: ${errorMessage}`);
    }
  }

  /**
   * Stop monitoring for new emails
   * 
   * Requirement 22: When a workflow is deactivated, Trigger Manager SHALL stop monitoring its triggers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log(`[EmailPollingWorker] Not running: ${this.config.id}`);
      return;
    }

    // Stop polling interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Disconnect from email server
    if (this.adapter) {
      try {
        await this.adapter.disconnect();
      } catch (error) {
        console.warn(`[EmailPollingWorker] Error disconnecting: ${error}`);
      }
      this.adapter = null;
    }

    this.isRunning = false;
    console.log(`[EmailPollingWorker] Stopped: ${this.config.id}`);
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
   * Connect to email server with retry logic
   * 
   * Requirement 9: Email Trigger SHALL handle connection failures and automatically reconnect
   */
  private async connectWithRetry(): Promise<void> {
    if (!this.adapter) {
      throw new Error('Email adapter not initialized');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_CONNECTION_RETRIES; attempt++) {
      try {
        console.log(`[EmailPollingWorker] Connecting to email server (attempt ${attempt}/${this.MAX_CONNECTION_RETRIES})`);
        await this.adapter.connect(this.emailConfig.emailAccount);
        this.connectionRetries = 0;
        console.log(`[EmailPollingWorker] Connected successfully`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[EmailPollingWorker] Connection attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < this.MAX_CONNECTION_RETRIES) {
          // Wait before retry (exponential backoff)
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[EmailPollingWorker] Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        }
      }
    }

    throw new Error(
      `Failed to connect after ${this.MAX_CONNECTION_RETRIES} attempts: ${lastError?.message}`
    );
  }

  /**
   * Poll for new emails
   * 
   * Requirement 9: Email Trigger SHALL fetch new emails using existing /api/email/read logic
   */
  private async pollEmails(): Promise<void> {
    // Prevent overlapping polls
    if (this.isPolling) {
      console.log(`[EmailPollingWorker] Poll already in progress, skipping: ${this.config.id}`);
      return;
    }

    this.isPolling = true;

    try {
      console.log(`[EmailPollingWorker] Polling for new emails: ${this.config.id}`);

      // Ensure connection
      if (!this.adapter) {
        throw new Error('Email adapter not initialized');
      }

      // Reconnect if needed
      try {
        // Test connection by attempting to fetch (will throw if disconnected)
        await this.ensureConnected();
      } catch (error) {
        console.warn(`[EmailPollingWorker] Connection lost, reconnecting...`);
        await this.connectWithRetry();
      }

      // Fetch new emails
      const fetchOptions: FetchOptions = {
        folder: this.emailConfig.folder,
        unreadOnly: this.emailConfig.unreadOnly,
        limit: this.emailConfig.maxEmailsPerPoll,
      };

      let emails: EmailMessage[];
      try {
        emails = await this.adapter.fetchEmails(fetchOptions);
        console.log(`[EmailPollingWorker] Fetched ${emails.length} emails`);
      } catch (error) {
        console.error(`[EmailPollingWorker] Failed to fetch emails: ${error}`);
        throw error;
      }

      // Filter out recently processed emails (deduplication)
      const newEmails = emails.filter(email => !this.wasRecentlyProcessed(email.id));
      console.log(`[EmailPollingWorker] ${newEmails.length} new emails after deduplication`);

      if (newEmails.length === 0) {
        return;
      }

      // Evaluate emails against filter rules
      const filterResult = filterEmails(newEmails, this.emailConfig.filterRules);
      console.log(`[EmailPollingWorker] Filter result: ${filterResult.matched.length} matched, ${filterResult.unmatched.length} unmatched`);

      // Process matched emails
      for (const email of filterResult.matched) {
        await this.processMatchedEmail(email);
      }

      // Clean up old deduplication entries
      this.cleanupDeduplication();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EmailPollingWorker] Poll failed: ${errorMessage}`);
      // Don't throw - let polling continue
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Ensure connection to email server is active
   */
  /**
   * [FIXED - Bug 17] Test connection without fetching emails
   * Use a lightweight check instead of fetching emails that get wasted
   */
  private async ensureConnected(): Promise<void> {
    if (!this.adapter) {
      throw new Error('Email adapter not initialized');
    }

    // Use getRateLimits() as a lightweight connection check
    // This doesn't fetch any data and just verifies the connection is alive
    try {
      this.adapter.getRateLimits();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process a matched email
   * 
   * @param email - Email that matched filter rules
   * 
   * Requirement 9: When email matches filter rules, Email Trigger SHALL initiate workflow execution with email data as input
   */
  private async processMatchedEmail(email: EmailMessage): Promise<void> {
    console.log(`[EmailPollingWorker] Processing matched email: ${email.id}`);
    console.log(`[EmailPollingWorker] Subject: ${email.headers.subject}`);
    console.log(`[EmailPollingWorker] From: ${email.headers.from.address}`);

    const processedAt = new Date();

    try {
      // Trigger workflow execution
      await this.triggerExecution({
        email: {
          id: email.id,
          provider: email.provider,
          from: email.headers.from,
          to: email.headers.to,
          subject: email.headers.subject,
          date: email.headers.date,
          body: email.body,
          attachments: email.attachments.map(att => ({
            id: att.id,
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
          })),
          flags: email.flags,
          metadata: email.metadata,
        },
        triggerId: this.config.id,
        triggerType: 'email',
        processedAt: processedAt.toISOString(),
      });

      // Mark email as processed
      await this.markEmailAsProcessed(email);

      // Record in deduplication map
      this.recentlyProcessed.set(email.id, Date.now());

      // Add to history
      this.addProcessedHistory({
        emailId: email.id,
        subject: email.headers.subject,
        from: email.headers.from.address,
        processedAt,
        success: true,
      });

      console.log(`[EmailPollingWorker] Email processed successfully: ${email.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EmailPollingWorker] Failed to process email: ${errorMessage}`);

      // Add to history with error
      this.addProcessedHistory({
        emailId: email.id,
        subject: email.headers.subject,
        from: email.headers.from.address,
        processedAt,
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Mark email as processed according to configuration
   * 
   * @param email - Email to mark as processed
   * 
   * Requirement 9: Email Trigger SHALL mark processed emails according to configuration (mark as read, move to folder, add label)
   */
  private async markEmailAsProcessed(email: EmailMessage): Promise<void> {
    if (!this.adapter) {
      console.warn(`[EmailPollingWorker] Cannot mark email as processed: adapter not initialized`);
      return;
    }

    const action = this.emailConfig.processedAction || 'markAsRead';

    try {
      switch (action) {
        case 'markAsRead':
          console.log(`[EmailPollingWorker] Marking email as read: ${email.id}`);
          // [FIXED - Bug 12] Call adapter markAsRead if available
          if (this.adapter.markAsRead) {
            await this.adapter.markAsRead(email.id);
          } else {
            console.warn(`[EmailPollingWorker] Adapter does not support markAsRead`);
          }
          break;

        case 'moveToFolder':
          if (!this.emailConfig.targetFolder) {
            console.warn(`[EmailPollingWorker] moveToFolder action requires targetFolder config`);
            break;
          }
          console.log(`[EmailPollingWorker] Moving email to folder: ${this.emailConfig.targetFolder}`);
          // [FIXED - Bug 12] Call adapter moveToFolder if available
          if (this.adapter.moveToFolder) {
            await this.adapter.moveToFolder(email.id, this.emailConfig.targetFolder);
          } else {
            console.warn(`[EmailPollingWorker] Adapter does not support moveToFolder`);
          }
          break;

        case 'addLabel':
          if (!this.emailConfig.label) {
            console.warn(`[EmailPollingWorker] addLabel action requires label config`);
            break;
          }
          console.log(`[EmailPollingWorker] Adding label to email: ${this.emailConfig.label}`);
          // [FIXED - Bug 12] Call adapter addLabel if available
          if (this.adapter.addLabel) {
            await this.adapter.addLabel(email.id, this.emailConfig.label);
          } else {
            console.warn(`[EmailPollingWorker] Adapter does not support addLabel`);
          }
          break;

        case 'none':
          console.log(`[EmailPollingWorker] No action taken on processed email`);
          break;

        default:
          console.warn(`[EmailPollingWorker] Unknown processed action: ${action}`);
      }
    } catch (error) {
      console.error(`[EmailPollingWorker] Failed to mark email as processed: ${error}`);
      // Don't throw - this is not critical
    }
  }

  /**
   * Trigger workflow execution
   * 
   * @param data - Event data to pass to workflow
   * 
   * Requirement 9: When email matches filter rules, Email Trigger SHALL initiate workflow execution with email data as input
   */
  async triggerExecution(data: Record<string, any>): Promise<void> {
    try {
      console.log(`[EmailPollingWorker] Triggering workflow execution: ${this.config.id}`);

      // Call trigger callback if set
      let executionId: string | undefined;
      if (this.triggerCallback) {
        executionId = await this.triggerCallback(data);
      } else {
        console.warn(`[EmailPollingWorker] No trigger callback set: ${this.config.id}`);
      }

      console.log(`[EmailPollingWorker] Workflow execution triggered: ${executionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EmailPollingWorker] Workflow execution failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Check if email was recently processed (deduplication)
   * 
   * @param emailId - Email ID to check
   * @returns true if email was recently processed
   */
  private wasRecentlyProcessed(emailId: string): boolean {
    const timestamp = this.recentlyProcessed.get(emailId);
    if (!timestamp) {
      return false;
    }

    const age = Date.now() - timestamp;
    return age < this.DEDUP_WINDOW_MS;
  }

  /**
   * Clean up old deduplication entries
   */
  private cleanupDeduplication(): void {
    const now = Date.now();
    const cutoff = now - this.DEDUP_WINDOW_MS;

    for (const [emailId, timestamp] of this.recentlyProcessed.entries()) {
      if (timestamp < cutoff) {
        this.recentlyProcessed.delete(emailId);
      }
    }

    console.log(`[EmailPollingWorker] Deduplication cleanup: ${this.recentlyProcessed.size} entries remaining`);
  }

  /**
   * Add entry to processed history
   * 
   * @param entry - Processed email entry
   */
  private addProcessedHistory(entry: ProcessedEmailEntry): void {
    this.processedHistory.push(entry);

    // Keep only last MAX_HISTORY_ENTRIES
    if (this.processedHistory.length > this.MAX_HISTORY_ENTRIES) {
      this.processedHistory.shift();
    }
  }

  /**
   * Get processed email history
   * 
   * @returns Array of processed email entries
   */
  getProcessedHistory(): ProcessedEmailEntry[] {
    return [...this.processedHistory];
  }

  /**
   * Get worker status
   * 
   * @returns Worker status information
   */
  getStatus(): {
    isRunning: boolean;
    isPolling: boolean;
    provider: string;
    folder: string;
    pollIntervalMinutes: number;
    filterRulesCount: number;
    totalProcessed: number;
    successfulProcessed: number;
    failedProcessed: number;
    recentlyProcessedCount: number;
    lastProcessed?: ProcessedEmailEntry;
  } {
    const lastProcessed = this.processedHistory[this.processedHistory.length - 1];
    const successfulProcessed = this.processedHistory.filter(e => e.success).length;
    const failedProcessed = this.processedHistory.filter(e => !e.success).length;

    return {
      isRunning: this.isRunning,
      isPolling: this.isPolling,
      provider: this.emailConfig.emailAccount.provider,
      folder: this.emailConfig.folder || 'INBOX',
      pollIntervalMinutes: this.emailConfig.pollIntervalMinutes || 5,
      filterRulesCount: this.emailConfig.filterRules.rules.length,
      totalProcessed: this.processedHistory.length,
      successfulProcessed,
      failedProcessed,
      recentlyProcessedCount: this.recentlyProcessed.size,
      lastProcessed,
    };
  }

  /**
   * Delay execution for specified milliseconds
   * 
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
