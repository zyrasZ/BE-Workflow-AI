/**
 * Execution Record Cleanup Service
 * 
 * Requirement 24: System SHALL automatically delete execution records older than
 * a configurable retention period (default 90 days)
 * 
 * This service provides functionality to:
 * - Delete old execution records from the database
 * - Delete associated execution_logs when deleting executions
 * - Support configurable retention period via environment variable
 * - Provide statistics about cleanup operations
 */

import { createServiceClient } from '@/lib/supabase/server';

/**
 * Configuration for cleanup operations
 */
export interface CleanupConfig {
  /**
   * Retention period in days
   * Default: 90 days
   */
  retentionDays: number;

  /**
   * Whether to perform a dry run (count only, no deletion)
   * Default: false
   */
  dryRun?: boolean;

  /**
   * Batch size for deletion operations
   * Default: 100
   */
  batchSize?: number;
}

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  /**
   * Number of execution records deleted
   */
  executionsDeleted: number;

  /**
   * Number of execution log records deleted
   */
  logsDeleted: number;

  /**
   * Cutoff date used for deletion
   */
  cutoffDate: Date;

  /**
   * Whether this was a dry run
   */
  dryRun: boolean;

  /**
   * Duration of cleanup operation in milliseconds
   */
  durationMs: number;

  /**
   * Any errors encountered during cleanup
   */
  errors: string[];
}

/**
 * Execution Cleanup Service
 * 
 * Handles automatic deletion of old execution records and their associated logs
 */
export class ExecutionCleanupService {
  private readonly DEFAULT_RETENTION_DAYS = 90;
  private readonly DEFAULT_BATCH_SIZE = 100;

  /**
   * Get retention period from environment variable or use default
   */
  private getRetentionDays(): number {
    const envValue = process.env.EXECUTION_RETENTION_DAYS;
    if (envValue) {
      const parsed = parseInt(envValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return this.DEFAULT_RETENTION_DAYS;
  }

  /**
   * Calculate cutoff date based on retention period
   */
  private calculateCutoffDate(retentionDays: number): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    return cutoff;
  }

  /**
   * Clean up old execution records
   * 
   * @param config - Cleanup configuration
   * @returns Cleanup result with statistics
   */
  async cleanup(config?: Partial<CleanupConfig>): Promise<CleanupResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Merge config with defaults
    const retentionDays = config?.retentionDays ?? this.getRetentionDays();
    const dryRun = config?.dryRun ?? false;
    const batchSize = config?.batchSize ?? this.DEFAULT_BATCH_SIZE;

    // Calculate cutoff date
    const cutoffDate = this.calculateCutoffDate(retentionDays);

    console.log(`[CleanupService] Starting cleanup with retention period: ${retentionDays} days`);
    console.log(`[CleanupService] Cutoff date: ${cutoffDate.toISOString()}`);
    console.log(`[CleanupService] Dry run: ${dryRun}`);

    let executionsDeleted = 0;
    let logsDeleted = 0;

    try {
      const supabase = createServiceClient();

      if (dryRun) {
        // Dry run: count records that would be deleted
        const { count: execCount, error: execCountError } = await supabase
          .from('executions')
          .select('id', { count: 'exact', head: true })
          .lt('started_at', cutoffDate.toISOString());

        if (execCountError) {
          errors.push(`Failed to count executions: ${execCountError.message}`);
        } else {
          executionsDeleted = execCount || 0;
        }

        // Count associated logs
        if (executionsDeleted > 0) {
          const { data: execIds, error: execIdsError } = await supabase
            .from('executions')
            .select('id')
            .lt('started_at', cutoffDate.toISOString());

          if (execIdsError) {
            errors.push(`Failed to fetch execution IDs: ${execIdsError.message}`);
          } else if (execIds && execIds.length > 0) {
            const ids = execIds.map(e => e.id);
            const { count: logCount, error: logCountError } = await supabase
              .from('execution_logs')
              .select('id', { count: 'exact', head: true })
              .in('execution_id', ids);

            if (logCountError) {
              errors.push(`Failed to count execution logs: ${logCountError.message}`);
            } else {
              logsDeleted = logCount || 0;
            }
          }
        }

        console.log(`[CleanupService] Dry run complete: ${executionsDeleted} executions, ${logsDeleted} logs would be deleted`);
      } else {
        // Actual deletion: delete in batches
        let hasMore = true;
        let totalExecutionsDeleted = 0;
        let totalLogsDeleted = 0;

        while (hasMore) {
          // Fetch a batch of old execution IDs
          const { data: executions, error: fetchError } = await supabase
            .from('executions')
            .select('id')
            .lt('started_at', cutoffDate.toISOString())
            .limit(batchSize);

          if (fetchError) {
            errors.push(`Failed to fetch executions batch: ${fetchError.message}`);
            break;
          }

          if (!executions || executions.length === 0) {
            hasMore = false;
            break;
          }

          const executionIds = executions.map(e => e.id);

          // First, count and delete associated execution_logs
          // Note: ON DELETE CASCADE should handle this automatically,
          // but we count them for statistics
          const { count: logCount, error: logCountError } = await supabase
            .from('execution_logs')
            .select('id', { count: 'exact', head: true })
            .in('execution_id', executionIds);

          if (logCountError) {
            errors.push(`Failed to count logs for batch: ${logCountError.message}`);
          } else {
            totalLogsDeleted += logCount || 0;
          }

          // Delete executions (CASCADE will delete logs automatically)
          const { error: deleteError } = await supabase
            .from('executions')
            .delete()
            .in('id', executionIds);

          if (deleteError) {
            errors.push(`Failed to delete executions batch: ${deleteError.message}`);
            break;
          }

          totalExecutionsDeleted += executionIds.length;

          console.log(`[CleanupService] Deleted batch: ${executionIds.length} executions, ${logCount || 0} logs`);

          // If we got fewer records than batch size, we're done
          if (executions.length < batchSize) {
            hasMore = false;
          }
        }

        executionsDeleted = totalExecutionsDeleted;
        logsDeleted = totalLogsDeleted;

        console.log(`[CleanupService] Cleanup complete: ${executionsDeleted} executions, ${logsDeleted} logs deleted`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Unexpected error during cleanup: ${errorMessage}`);
      console.error('[CleanupService] Cleanup failed:', error);
    }

    const durationMs = Date.now() - startTime;

    return {
      executionsDeleted,
      logsDeleted,
      cutoffDate,
      dryRun,
      durationMs,
      errors,
    };
  }

  /**
   * Get current cleanup configuration
   */
  getConfig(): CleanupConfig {
    return {
      retentionDays: this.getRetentionDays(),
      dryRun: false,
      batchSize: this.DEFAULT_BATCH_SIZE,
    };
  }
}

/**
 * Singleton instance of the cleanup service
 */
export const cleanupService = new ExecutionCleanupService();
