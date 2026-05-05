/**
 * Cron Worker for Schedule-based Workflow Triggers
 * 
 * This module implements the CronWorker class that handles schedule-based workflow triggers.
 * It uses the cron-parser library to parse and validate cron expressions, calculates next
 * execution times, and monitors for scheduled execution times.
 * 
 * Features:
 * - Parse and validate Cron_Expression using cron-parser library
 * - Calculate next execution time based on Cron_Expression
 * - Use setInterval to check every minute if execution time arrived
 * - Initiate workflow execution when scheduled time arrives
 * - Support standard cron syntax (minute, hour, day, month, day-of-week)
 * - Support timezone configuration
 * - Record execution history with timestamps
 * - Handle missed executions (skip or execute based on config)
 * 
 * Requirement 10: Trigger - Schedule Trigger (Cron)
 */

import { TriggerWorker, TriggerConfig } from '../types';
import { parseExpression, CronExpression } from 'cron-parser';

/**
 * Configuration for Cron Worker
 */
interface CronWorkerConfig {
  /**
   * Cron expression (standard 5-field format)
   * Format: minute hour day month day-of-week
   * Example: "0 9 * * 1-5" (9 AM on weekdays)
   * 
   * Requirement 10: Schedule Trigger SHALL support standard cron syntax
   */
  cronExpression: string;

  /**
   * Timezone for schedule interpretation (IANA timezone name)
   * Example: "America/New_York", "Asia/Tokyo", "UTC"
   * Default: "UTC"
   * 
   * Requirement 10: Schedule Trigger SHALL support timezone configuration
   */
  timezone?: string;

  /**
   * How to handle missed executions when system was down
   * - 'skip': Skip missed executions (default)
   * - 'execute': Execute missed executions immediately
   * 
   * Requirement 10: Schedule Trigger SHALL either skip or execute based on configuration
   */
  missedExecutionStrategy?: 'skip' | 'execute';

  /**
   * Maximum number of missed executions to catch up (default: 1)
   * Only applies when missedExecutionStrategy is 'execute'
   */
  maxMissedExecutions?: number;
}

/**
 * Execution history entry
 */
interface ExecutionHistoryEntry {
  /**
   * Scheduled execution time
   */
  scheduledTime: Date;

  /**
   * Actual execution time
   */
  executedTime: Date;

  /**
   * Execution ID returned from workflow executor
   */
  executionId?: string;

  /**
   * Whether execution was successful
   */
  success: boolean;

  /**
   * Error message if execution failed
   */
  error?: string;
}

/**
 * CronWorker implements schedule-based workflow triggers
 * 
 * Requirement 10: Schedule Trigger (Cron)
 */
export class CronWorker implements TriggerWorker {
  /**
   * Trigger configuration
   */
  private config: TriggerConfig;

  /**
   * Cron worker specific configuration
   */
  private cronConfig: CronWorkerConfig;

  /**
   * Parsed cron expression
   */
  private cronExpression?: CronExpression;

  /**
   * Next scheduled execution time
   */
  private nextExecutionTime?: Date;

  /**
   * Interval timer for checking execution time
   */
  private intervalId?: NodeJS.Timeout;

  /**
   * Check interval in milliseconds (1 minute)
   */
  private readonly CHECK_INTERVAL_MS = 60 * 1000;

  /**
   * Execution history (keep last 100 entries)
   * 
   * Requirement 10: Schedule Trigger SHALL record execution history with timestamps
   */
  private executionHistory: ExecutionHistoryEntry[] = [];

  /**
   * Maximum history entries to keep
   */
  private readonly MAX_HISTORY_ENTRIES = 100;

  /**
   * Whether the worker is currently running
   */
  private isRunning: boolean = false;

  /**
   * Callback function to trigger workflow execution
   */
  private triggerCallback?: (data: Record<string, any>) => Promise<string>;

  /**
   * Create a new CronWorker instance
   * 
   * @param config - Trigger configuration
   * 
   * Requirement 10: Schedule Trigger SHALL accept a Cron_Expression as configuration
   */
  constructor(config: TriggerConfig) {
    this.config = config;
    this.cronConfig = this.parseCronConfig(config.config);
  }

  /**
   * Parse and validate cron configuration
   * 
   * @param config - Raw configuration object
   * @returns Parsed cron configuration
   */
  private parseCronConfig(config: Record<string, any>): CronWorkerConfig {
    if (!config.cronExpression || typeof config.cronExpression !== 'string') {
      throw new Error('Cron expression is required and must be a string');
    }

    return {
      cronExpression: config.cronExpression,
      timezone: config.timezone || 'UTC',
      missedExecutionStrategy: config.missedExecutionStrategy || 'skip',
      maxMissedExecutions: config.maxMissedExecutions || 1,
    };
  }

  /**
   * Start monitoring for scheduled execution times
   * 
   * Requirement 10: When Schedule Trigger is activated, Trigger Manager SHALL parse and validate the Cron_Expression
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[CronWorker] Already running: ${this.config.id}`);
      return;
    }

    try {
      // Parse and validate cron expression
      this.cronExpression = parseExpression(this.cronConfig.cronExpression, {
        tz: this.cronConfig.timezone,
        currentDate: new Date(),
      });

      // Calculate next execution time
      this.nextExecutionTime = this.cronExpression.next().toDate();

      console.log(`[CronWorker] Started: ${this.config.id}`);
      console.log(`[CronWorker] Cron expression: ${this.cronConfig.cronExpression}`);
      console.log(`[CronWorker] Timezone: ${this.cronConfig.timezone}`);
      console.log(`[CronWorker] Next execution: ${this.nextExecutionTime.toISOString()}`);

      // Handle missed executions if configured
      await this.handleMissedExecutions();

      // Start interval to check every minute
      this.intervalId = setInterval(() => {
        this.checkExecutionTime();
      }, this.CHECK_INTERVAL_MS);

      this.isRunning = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CronWorker] Failed to start: ${errorMessage}`);
      throw new Error(`Failed to parse cron expression: ${errorMessage}`);
    }
  }

  /**
   * Stop monitoring for scheduled execution times
   * 
   * Requirement 22: When a workflow is deactivated, Trigger Manager SHALL stop monitoring its triggers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log(`[CronWorker] Not running: ${this.config.id}`);
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    console.log(`[CronWorker] Stopped: ${this.config.id}`);
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
   * Check if current time matches scheduled execution time
   * 
   * Requirement 10: Schedule Trigger SHALL calculate the next execution time based on the Cron_Expression
   */
  private checkExecutionTime(): void {
    if (!this.nextExecutionTime) {
      console.error(`[CronWorker] No next execution time set: ${this.config.id}`);
      return;
    }

    const now = new Date();

    // Check if scheduled time has arrived (with 1-minute tolerance)
    if (now >= this.nextExecutionTime) {
      console.log(`[CronWorker] Execution time arrived: ${this.config.id}`);
      console.log(`[CronWorker] Scheduled: ${this.nextExecutionTime.toISOString()}`);
      console.log(`[CronWorker] Current: ${now.toISOString()}`);

      // Trigger execution
      this.triggerExecution({
        scheduledTime: this.nextExecutionTime.toISOString(),
        actualTime: now.toISOString(),
        triggerId: this.config.id,
        triggerType: 'schedule',
      });

      // Calculate next execution time
      if (this.cronExpression) {
        this.nextExecutionTime = this.cronExpression.next().toDate();
        console.log(`[CronWorker] Next execution: ${this.nextExecutionTime.toISOString()}`);
      }
    }
  }

  /**
   * Handle missed executions when worker starts
   * 
   * Requirement 10: When a scheduled execution is missed, Schedule Trigger SHALL either skip or execute based on configuration
   */
  private async handleMissedExecutions(): Promise<void> {
    if (this.cronConfig.missedExecutionStrategy === 'skip') {
      console.log(`[CronWorker] Skipping missed executions: ${this.config.id}`);
      return;
    }

    if (!this.config.lastTriggeredAt) {
      console.log(`[CronWorker] No previous execution, skipping missed check: ${this.config.id}`);
      return;
    }

    const now = new Date();
    const lastTriggered = new Date(this.config.lastTriggeredAt);

    // Find all missed executions between last triggered and now
    const missedExecutions: Date[] = [];
    const tempExpression = parseExpression(this.cronConfig.cronExpression, {
      tz: this.cronConfig.timezone,
      currentDate: lastTriggered,
    });

    let nextTime = tempExpression.next().toDate();
    while (nextTime < now && missedExecutions.length < (this.cronConfig.maxMissedExecutions || 1)) {
      missedExecutions.push(nextTime);
      nextTime = tempExpression.next().toDate();
    }

    if (missedExecutions.length > 0) {
      console.log(`[CronWorker] Found ${missedExecutions.length} missed executions: ${this.config.id}`);

      // Execute missed executions
      for (const missedTime of missedExecutions) {
        console.log(`[CronWorker] Executing missed execution: ${missedTime.toISOString()}`);
        await this.triggerExecution({
          scheduledTime: missedTime.toISOString(),
          actualTime: now.toISOString(),
          triggerId: this.config.id,
          triggerType: 'schedule',
          isMissedExecution: true,
        });
      }
    }
  }

  /**
   * Trigger workflow execution
   * 
   * @param data - Event data to pass to workflow
   * 
   * Requirement 10: When the scheduled time arrives, Schedule Trigger SHALL initiate workflow execution
   */
  async triggerExecution(data: Record<string, any>): Promise<void> {
    const scheduledTime = new Date(data.scheduledTime);
    const executedTime = new Date();

    try {
      console.log(`[CronWorker] Triggering execution: ${this.config.id}`);

      // Call trigger callback if set
      let executionId: string | undefined;
      if (this.triggerCallback) {
        executionId = await this.triggerCallback(data);
      } else {
        console.warn(`[CronWorker] No trigger callback set: ${this.config.id}`);
      }

      // Record execution in history
      this.addExecutionHistory({
        scheduledTime,
        executedTime,
        executionId,
        success: true,
      });

      console.log(`[CronWorker] Execution triggered successfully: ${executionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CronWorker] Execution failed: ${errorMessage}`);

      // Record failed execution in history
      this.addExecutionHistory({
        scheduledTime,
        executedTime,
        success: false,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Add execution to history
   * 
   * @param entry - Execution history entry
   * 
   * Requirement 10: Schedule Trigger SHALL record execution history with timestamps
   */
  private addExecutionHistory(entry: ExecutionHistoryEntry): void {
    this.executionHistory.push(entry);

    // Keep only last MAX_HISTORY_ENTRIES
    if (this.executionHistory.length > this.MAX_HISTORY_ENTRIES) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get execution history
   * 
   * @returns Array of execution history entries
   */
  getExecutionHistory(): ExecutionHistoryEntry[] {
    return [...this.executionHistory];
  }

  /**
   * Get next scheduled execution time
   * 
   * @returns Next execution time or undefined if not running
   */
  getNextExecutionTime(): Date | undefined {
    return this.nextExecutionTime;
  }

  /**
   * Get worker status
   * 
   * @returns Worker status information
   */
  getStatus(): {
    isRunning: boolean;
    cronExpression: string;
    timezone: string;
    nextExecutionTime?: string;
    lastExecution?: ExecutionHistoryEntry;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
  } {
    const lastExecution = this.executionHistory[this.executionHistory.length - 1];
    const successfulExecutions = this.executionHistory.filter(e => e.success).length;
    const failedExecutions = this.executionHistory.filter(e => !e.success).length;

    return {
      isRunning: this.isRunning,
      cronExpression: this.cronConfig.cronExpression,
      timezone: this.cronConfig.timezone || 'UTC',
      nextExecutionTime: this.nextExecutionTime?.toISOString(),
      lastExecution,
      totalExecutions: this.executionHistory.length,
      successfulExecutions,
      failedExecutions,
    };
  }
}
