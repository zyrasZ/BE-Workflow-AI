/**
 * Scheduled Cleanup Worker
 * 
 * Requirement 24: System SHALL automatically delete execution records older than
 * a configurable retention period (default 90 days)
 * 
 * This module provides a scheduled worker that runs cleanup operations periodically.
 * It can be integrated with:
 * - Node.js cron jobs
 * - Vercel Cron (vercel.json configuration)
 * - External cron services (calling the API endpoint)
 */

import { cleanupService } from './cleanup-service';

/**
 * Configuration for scheduled cleanup
 */
export interface ScheduledCleanupConfig {
  /**
   * Interval in milliseconds between cleanup runs
   * Default: 24 hours (86400000 ms)
   */
  intervalMs?: number;

  /**
   * Whether to run cleanup immediately on start
   * Default: false
   */
  runOnStart?: boolean;

  /**
   * Retention period in days
   * If not specified, uses environment variable or default (90 days)
   */
  retentionDays?: number;
}

/**
 * Scheduled Cleanup Worker
 * 
 * Runs cleanup operations on a scheduled interval
 */
export class ScheduledCleanupWorker {
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;
  private readonly DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Start the scheduled cleanup worker
   * 
   * @param config - Configuration options
   */
  async start(config?: ScheduledCleanupConfig): Promise<void> {
    if (this.isRunning) {
      console.warn('[ScheduledCleanup] Worker is already running');
      return;
    }

    const intervalMs = config?.intervalMs ?? this.DEFAULT_INTERVAL_MS;
    const runOnStart = config?.runOnStart ?? false;
    const retentionDays = config?.retentionDays;

    console.log('[ScheduledCleanup] Starting scheduled cleanup worker');
    console.log(`[ScheduledCleanup] Interval: ${intervalMs}ms (${intervalMs / 1000 / 60 / 60} hours)`);
    console.log(`[ScheduledCleanup] Run on start: ${runOnStart}`);

    this.isRunning = true;

    // Run immediately if configured
    if (runOnStart) {
      await this.runCleanup(retentionDays);
    }

    // Schedule periodic cleanup
    this.intervalId = setInterval(async () => {
      await this.runCleanup(retentionDays);
    }, intervalMs);
  }

  /**
   * Stop the scheduled cleanup worker
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn('[ScheduledCleanup] Worker is not running');
      return;
    }

    console.log('[ScheduledCleanup] Stopping scheduled cleanup worker');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
  }

  /**
   * Check if the worker is running
   */
  getStatus(): { isRunning: boolean; intervalMs: number } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.DEFAULT_INTERVAL_MS,
    };
  }

  /**
   * Run cleanup operation
   * 
   * @param retentionDays - Optional retention period override
   */
  private async runCleanup(retentionDays?: number): Promise<void> {
    try {
      console.log('[ScheduledCleanup] Running scheduled cleanup...');

      const result = await cleanupService.cleanup({
        retentionDays,
        dryRun: false,
      });

      if (result.errors.length > 0) {
        console.error('[ScheduledCleanup] Cleanup completed with errors:', result.errors);
      } else {
        console.log('[ScheduledCleanup] Cleanup completed successfully:', {
          executionsDeleted: result.executionsDeleted,
          logsDeleted: result.logsDeleted,
          durationMs: result.durationMs,
          cutoffDate: result.cutoffDate.toISOString(),
        });
      }
    } catch (error) {
      console.error('[ScheduledCleanup] Cleanup failed:', error);
    }
  }
}

/**
 * Singleton instance of the scheduled cleanup worker
 */
export const scheduledCleanupWorker = new ScheduledCleanupWorker();

/**
 * Initialize scheduled cleanup on module load
 * 
 * This can be called from a server initialization script or
 * from the trigger manager to integrate with the workflow system
 */
export function initializeScheduledCleanup(config?: ScheduledCleanupConfig): void {
  // Only initialize in production or if explicitly enabled
  const shouldRun = process.env.ENABLE_SCHEDULED_CLEANUP === 'true' || 
                    process.env.NODE_ENV === 'production';

  if (shouldRun) {
    scheduledCleanupWorker.start(config).catch((error) => {
      console.error('[ScheduledCleanup] Failed to start worker:', error);
    });
  } else {
    console.log('[ScheduledCleanup] Scheduled cleanup is disabled. Set ENABLE_SCHEDULED_CLEANUP=true to enable.');
  }
}
