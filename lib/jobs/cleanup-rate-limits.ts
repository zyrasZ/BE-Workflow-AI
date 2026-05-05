/**
 * Rate Limit Cleanup Job
 * 
 * Periodically cleans up expired rate limit records from the database.
 * This ensures the rate_limits table doesn't grow indefinitely and
 * automatically resets counters at appropriate intervals.
 * 
 * Before cleanup, archives rate limit data to usage_statistics for
 * persistent historical tracking.
 * 
 * Should be run as a cron job or scheduled task.
 */

import { cleanupExpiredRecords, archiveRateLimitData } from '@/lib/middleware/usage-tracker';

/**
 * Run the cleanup job
 * 
 * This function should be called periodically (e.g., every hour)
 * to archive and remove expired rate limit records.
 * 
 * @returns Object with archived and deleted counts
 */
export async function runCleanupJob(): Promise<{ archived: number; deleted: number }> {
  console.log('[Cleanup Job] Starting rate limit cleanup...');
  
  try {
    // Step 1: Archive expired rate limit data to usage_statistics
    console.log('[Cleanup Job] Archiving expired rate limit data...');
    const archivedCount = await archiveRateLimitData();
    console.log(`[Cleanup Job] Archived ${archivedCount} rate limit records to usage_statistics`);
    
    // Step 2: Clean up expired rate limit records
    console.log('[Cleanup Job] Cleaning up expired rate limit records...');
    const deletedCount = await cleanupExpiredRecords();
    console.log(`[Cleanup Job] Successfully cleaned up ${deletedCount} expired records`);
    
    return { archived: archivedCount, deleted: deletedCount };
  } catch (error) {
    console.error('[Cleanup Job] Error during cleanup:', error);
    throw error;
  }
}

/**
 * Schedule the cleanup job to run periodically
 * 
 * This function sets up an interval to run the cleanup job.
 * In production, you should use a proper cron job or scheduled task
 * instead of setInterval.
 * 
 * @param intervalMinutes - Interval in minutes (default: 60)
 * @returns Interval ID that can be used to stop the job
 */
export function scheduleCleanupJob(intervalMinutes: number = 60): NodeJS.Timeout {
  console.log(`[Cleanup Job] Scheduling cleanup to run every ${intervalMinutes} minutes`);
  
  // Run immediately on startup
  runCleanupJob().catch(error => {
    console.error('[Cleanup Job] Initial cleanup failed:', error);
  });
  
  // Schedule periodic runs
  const intervalMs = intervalMinutes * 60 * 1000;
  return setInterval(() => {
    runCleanupJob().catch(error => {
      console.error('[Cleanup Job] Scheduled cleanup failed:', error);
    });
  }, intervalMs);
}

/**
 * Stop the scheduled cleanup job
 * 
 * @param intervalId - Interval ID returned by scheduleCleanupJob
 */
export function stopCleanupJob(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  console.log('[Cleanup Job] Cleanup job stopped');
}

// Export for use in API routes or cron endpoints
export default runCleanupJob;
