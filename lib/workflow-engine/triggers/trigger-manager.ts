/**
 * Trigger Manager for Workflow Automation System
 * 
 * This module implements the TriggerManager class that manages workflow triggers.
 * It handles:
 * - Maintaining registry of active triggers (Map<string, TriggerWorker>)
 * - Registering triggers to start monitoring
 * - Unregistering triggers to stop monitoring
 * - Supporting manual, schedule, email, and webhook trigger types
 * - Handling trigger failures and automatic restart
 * - Logging all trigger events with timestamps
 * - Preventing duplicate workflow executions for same trigger event
 * 
 * Requirement 22: Trigger Manager - Event Monitoring
 */

import { TriggerConfig, TriggerWorker } from '../types';
import { WorkflowExecutor } from '../executor';
import { CronWorker } from './cron-worker';
import { EmailPollingWorker } from './email-polling-worker';
import { WebhookWorker } from './webhook-worker';
import { createHash } from 'crypto';

/**
 * TriggerManager manages all workflow triggers
 * 
 * Requirement 22: Trigger Manager SHALL maintain a registry of all active triggers
 */
export class TriggerManager {
  /**
   * Registry of active trigger workers, keyed by trigger ID
   * 
   * Requirement 22: Trigger Manager SHALL maintain a registry of all active triggers
   */
  private triggers: Map<string, TriggerWorker> = new Map();

  /**
   * Track recent trigger executions to prevent duplicates
   * Key: `${triggerId}:${eventHash}`, Value: timestamp
   * 
   * Requirement 22: Trigger Manager SHALL prevent duplicate workflow executions for the same trigger event
   */
  private recentExecutions: Map<string, number> = new Map();

  /**
   * Deduplication window in milliseconds (5 minutes)
   */
  private readonly DEDUP_WINDOW_MS = 5 * 60 * 1000;

  /**
   * Cleanup interval for recent executions map (10 minutes)
   */
  private readonly CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

  /**
   * Cleanup interval timer
   */
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * Workflow executor instance
   */
  private executor: WorkflowExecutor;

  /**
   * Create a new TriggerManager instance
   */
  constructor() {
    this.executor = new WorkflowExecutor();
    this.startCleanupInterval();
  }

  /**
   * Register a trigger and start monitoring
   * 
   * @param config - Trigger configuration
   * 
   * Requirement 22: When a workflow with a trigger is activated, Trigger Manager SHALL start monitoring for that trigger's events
   */
  async register(config: TriggerConfig): Promise<void> {
    try {
      // Log trigger registration
      this.logTriggerEvent(config.id, 'register', {
        workflowId: config.workflowId,
        type: config.type,
        isActive: config.isActive,
      });

      // Skip if trigger is not active
      if (!config.isActive) {
        console.log(`[TriggerManager] Skipping inactive trigger: ${config.id}`);
        return;
      }

      // Check if trigger is already registered
      if (this.triggers.has(config.id)) {
        console.log(`[TriggerManager] Trigger already registered: ${config.id}`);
        return;
      }

      // Create trigger worker based on type
      let worker: TriggerWorker | null = null;

      switch (config.type) {
        case 'manual':
          // Manual triggers don't need workers - they're triggered via API
          console.log(`[TriggerManager] Manual trigger registered: ${config.id}`);
          return;

        case 'schedule':
          // Create CronWorker for schedule trigger
          worker = new CronWorker(config);
          // Set trigger callback to execute workflow
          // [FIXED - Bug 9] Load userId from workflow before executing
          (worker as CronWorker).setTriggerCallback(async (data) => {
            const userId = await this.loadWorkflowUserId(config.workflowId);
            const executionId = await this.triggerExecution(
              config.id,
              config.workflowId,
              userId,
              data
            );
            return executionId || '';
          });
          break;

        case 'email':
          // Create EmailPollingWorker for email trigger
          worker = new EmailPollingWorker(config);
          // Set trigger callback to execute workflow
          // [FIXED - Bug 9] Load userId from workflow before executing
          (worker as EmailPollingWorker).setTriggerCallback(async (data) => {
            const userId = await this.loadWorkflowUserId(config.workflowId);
            const executionId = await this.triggerExecution(
              config.id,
              config.workflowId,
              userId,
              data
            );
            return executionId || '';
          });
          break;

        case 'webhook':
          // Create WebhookWorker for webhook trigger
          worker = new WebhookWorker(config);
          // Set trigger callback to execute workflow
          // [FIXED - Bug 9] Load userId from workflow before executing
          (worker as WebhookWorker).setTriggerCallback(async (data) => {
            const userId = await this.loadWorkflowUserId(config.workflowId);
            const executionId = await this.triggerExecution(
              config.id,
              config.workflowId,
              userId,
              data
            );
            return executionId || '';
          });
          break;

        default:
          throw new Error(`Unknown trigger type: ${config.type}`);
      }

      // Register worker if created
      if (worker) {
        this.triggers.set(config.id, worker);

        // Start monitoring with automatic restart on failure
        await this.startWorkerWithRetry(config.id, worker);

        this.logTriggerEvent(config.id, 'started', {
          workflowId: config.workflowId,
          type: config.type,
        });
      }
    } catch (error) {
      this.logTriggerEvent(config.id, 'register_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Unregister a trigger and stop monitoring
   * 
   * @param triggerId - Trigger ID to unregister
   * 
   * Requirement 22: When a workflow is deactivated, Trigger Manager SHALL stop monitoring its triggers
   */
  async unregister(triggerId: string): Promise<void> {
    try {
      this.logTriggerEvent(triggerId, 'unregister', {});

      const worker = this.triggers.get(triggerId);
      if (!worker) {
        console.log(`[TriggerManager] Trigger not found: ${triggerId}`);
        return;
      }

      // Stop the worker
      await worker.stop();

      // Remove from registry
      this.triggers.delete(triggerId);

      this.logTriggerEvent(triggerId, 'stopped', {});
    } catch (error) {
      this.logTriggerEvent(triggerId, 'unregister_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start a trigger worker with automatic retry on failure
   * 
   * @param triggerId - Trigger ID
   * @param worker - Trigger worker instance
   * 
   * Requirement 22: Trigger Manager SHALL handle trigger failures and automatically restart monitoring
   */
  private async startWorkerWithRetry(
    triggerId: string,
    worker: TriggerWorker,
    retryCount: number = 0
  ): Promise<void> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 5 seconds

    try {
      await worker.start();
    } catch (error) {
      this.logTriggerEvent(triggerId, 'start_failed', {
        error: error instanceof Error ? error.message : String(error),
        retryCount,
      });

      // Retry if not exceeded max retries
      if (retryCount < MAX_RETRIES) {
        console.log(
          `[TriggerManager] Retrying trigger start (${retryCount + 1}/${MAX_RETRIES}): ${triggerId}`
        );

        // Wait before retry
        await this.delay(RETRY_DELAY_MS);

        // Retry
        await this.startWorkerWithRetry(triggerId, worker, retryCount + 1);
      } else {
        // Max retries exceeded - remove from registry
        this.triggers.delete(triggerId);
        throw new Error(
          `Failed to start trigger after ${MAX_RETRIES} retries: ${triggerId}`
        );
      }
    }
  }

  /**
   * Trigger workflow execution
   * 
   * @param triggerId - Trigger ID
   * @param workflowId - Workflow ID to execute
   * @param userId - User ID
   * @param eventData - Event data to pass to workflow
   * 
   * Requirement 22: When a trigger event occurs, Trigger Manager SHALL create a new workflow execution
   * Requirement 22: Trigger Manager SHALL prevent duplicate workflow executions for the same trigger event
   */
  async triggerExecution(
    triggerId: string,
    workflowId: string,
    userId: string,
    eventData: Record<string, any>
  ): Promise<string | null> {
    try {
      // Generate event hash for deduplication
      const eventHash = this.hashEventData(eventData);
      const dedupKey = `${triggerId}:${eventHash}`;

      // Check for duplicate execution
      const lastExecution = this.recentExecutions.get(dedupKey);
      if (lastExecution) {
        const timeSinceLastExecution = Date.now() - lastExecution;
        if (timeSinceLastExecution < this.DEDUP_WINDOW_MS) {
          console.log(
            `[TriggerManager] Duplicate execution prevented for trigger: ${triggerId}`
          );
          this.logTriggerEvent(triggerId, 'duplicate_prevented', {
            workflowId,
            timeSinceLastExecution,
          });
          return null;
        }
      }

      // Record execution timestamp
      this.recentExecutions.set(dedupKey, Date.now());

      // Log trigger event
      this.logTriggerEvent(triggerId, 'triggered', {
        workflowId,
        userId,
        eventDataKeys: Object.keys(eventData),
      });

      // Execute workflow
      const executionId = await this.executor.execute(workflowId, userId, eventData);

      this.logTriggerEvent(triggerId, 'execution_started', {
        workflowId,
        executionId,
      });

      return executionId;
    } catch (error) {
      this.logTriggerEvent(triggerId, 'execution_failed', {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all active triggers
   * 
   * @returns Array of trigger IDs
   */
  getActiveTriggers(): string[] {
    return Array.from(this.triggers.keys());
  }

  /**
   * Check if a trigger is registered
   * 
   * @param triggerId - Trigger ID to check
   * @returns True if trigger is registered
   */
  isRegistered(triggerId: string): boolean {
    return this.triggers.has(triggerId);
  }

  /**
   * Shutdown the trigger manager and stop all triggers
   */
  async shutdown(): Promise<void> {
    console.log('[TriggerManager] Shutting down...');

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Stop all triggers
    const stopPromises = Array.from(this.triggers.keys()).map(triggerId =>
      this.unregister(triggerId)
    );

    await Promise.allSettled(stopPromises);

    console.log('[TriggerManager] Shutdown complete');
  }

  /**
   * Log trigger event with timestamp
   * 
   * @param triggerId - Trigger ID
   * @param event - Event type
   * @param data - Event data
   * 
   * Requirement 22: Trigger Manager SHALL log all trigger events with timestamps
   */
  private logTriggerEvent(
    triggerId: string,
    event: string,
    data: Record<string, any>
  ): void {
    const timestamp = new Date().toISOString();
    console.log(`[TriggerManager] [${timestamp}] ${event}:`, {
      triggerId,
      ...data,
    });
  }

  /**
   * Hash event data for deduplication
   * [FIXED - Bug 14] Use crypto.createHash for collision-resistant hashing
   * 
   * @param eventData - Event data to hash
   * @returns Hash string
   */
  private hashEventData(eventData: Record<string, any>): string {
    try {
      const jsonStr = JSON.stringify(eventData, Object.keys(eventData).sort());
      return createHash('sha256').update(jsonStr).digest('hex').slice(0, 16);
    } catch {
      // Fallback to simple hash if crypto unavailable
      const jsonStr = JSON.stringify(eventData, Object.keys(eventData).sort());
      let hash = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString(36);
    }
  }

  /**
   * Start cleanup interval for recent executions map
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupRecentExecutions();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Clean up old entries from recent executions map
   */
  private cleanupRecentExecutions(): void {
    const now = Date.now();
    const cutoff = now - this.DEDUP_WINDOW_MS;

    for (const [key, timestamp] of this.recentExecutions.entries()) {
      if (timestamp < cutoff) {
        this.recentExecutions.delete(key);
      }
    }

    console.log(
      `[TriggerManager] Cleaned up recent executions. Remaining: ${this.recentExecutions.size}`
    );
  }

  /**
   * Delay execution for specified milliseconds
   * 
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * [FIXED - Bug 9] Load user_id from workflow record
   * Used by trigger callbacks to get the correct userId before execution
   */
  private async loadWorkflowUserId(workflowId: string): Promise<string> {
    try {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('workflows')
        .select('user_id')
        .eq('id', workflowId)
        .single();

      if (error || !data) {
        console.error(`[TriggerManager] Failed to load workflow userId for ${workflowId}:`, error);
        return '';
      }

      return data.user_id;
    } catch (error) {
      console.error(`[TriggerManager] Error loading workflow userId:`, error);
      return '';
    }
  }
}

/**
 * Singleton instance of TriggerManager
 */
export const triggerManager = new TriggerManager();
