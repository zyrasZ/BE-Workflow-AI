/**
 * Usage Tracking Service
 * 
 * Provides usage analytics and historical tracking for:
 * - AI API calls
 * - Email sending
 * - Workflow executions
 * 
 * Complements the rate limiter by providing historical usage data
 * and analytics capabilities.
 */

import { withConnection } from '@/lib/database/pool';

/**
 * Usage statistics for a specific resource type
 */
export interface UsageStats {
  resourceType: string;
  totalRequests: number;
  currentWindowRequests: number;
  maxRequests: number;
  remaining: number;
  windowStart: Date;
  windowEnd: Date;
  utilizationPercent: number;
}

/**
 * Historical usage data point
 */
export interface UsageDataPoint {
  date: Date;
  resourceType: string;
  requestCount: number;
  maxRequests: number;
}

/**
 * Aggregated usage summary
 */
export interface UsageSummary {
  userId: string;
  period: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  stats: {
    'ai-api': {
      total: number;
      average: number;
      peak: number;
    };
    'email-send': {
      total: number;
      average: number;
      peak: number;
    };
    'workflow-execution': {
      total: number;
      average: number;
      peak: number;
    };
  };
}

/**
 * Get current usage statistics for all resource types
 * 
 * @param userId - User ID
 * @returns Usage statistics for all resource types
 */
export async function getCurrentUsageStats(
  userId: string
): Promise<Record<string, UsageStats>> {
  return withConnection(async (supabase) => {
    const resourceTypes = ['ai-api', 'email-send', 'workflow-execution'];
    const stats: Record<string, UsageStats> = {};

    for (const resourceType of resourceTypes) {
      const { data, error } = await supabase
        .rpc('get_current_usage', {
          p_user_id: userId,
          p_resource_type: resourceType,
        });

      if (error) {
        console.error(`[Usage Tracker] Error fetching usage for ${resourceType}:`, error);
        // Return default stats on error
        stats[resourceType] = {
          resourceType,
          totalRequests: 0,
          currentWindowRequests: 0,
          maxRequests: 0,
          remaining: 0,
          windowStart: new Date(),
          windowEnd: new Date(),
          utilizationPercent: 0,
        };
        continue;
      }

      if (data && data.length > 0) {
        const usage = data[0];
        const currentCount = usage.current_count || 0;
        const maxAllowed = usage.max_allowed || 0;
        
        stats[resourceType] = {
          resourceType,
          totalRequests: currentCount,
          currentWindowRequests: currentCount,
          maxRequests: maxAllowed,
          remaining: usage.remaining || 0,
          windowStart: new Date(usage.window_start),
          windowEnd: new Date(usage.window_end),
          utilizationPercent: maxAllowed > 0 ? (currentCount / maxAllowed) * 100 : 0,
        };
      } else {
        // No current window, return empty stats
        stats[resourceType] = {
          resourceType,
          totalRequests: 0,
          currentWindowRequests: 0,
          maxRequests: getDefaultMaxRequests(resourceType),
          remaining: getDefaultMaxRequests(resourceType),
          windowStart: new Date(),
          windowEnd: new Date(Date.now() + getDefaultWindowSeconds(resourceType) * 1000),
          utilizationPercent: 0,
        };
      }
    }

    return stats;
  });
}

/**
 * Get historical usage data for a user
 * 
 * @param userId - User ID
 * @param resourceType - Resource type (optional, all if not provided)
 * @param startDate - Start date for historical data
 * @param endDate - End date for historical data
 * @returns Array of usage data points
 */
export async function getHistoricalUsage(
  userId: string,
  resourceType?: string,
  startDate?: Date,
  endDate?: Date
): Promise<UsageDataPoint[]> {
  return withConnection(async (supabase) => {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
    const end = endDate || new Date();

    let query = supabase
      .from('rate_limits')
      .select('resource_type, window_start, request_count, max_requests')
      .eq('user_id', userId)
      .gte('window_start', start.toISOString())
      .lte('window_start', end.toISOString())
      .order('window_start', { ascending: true });

    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Usage Tracker] Error fetching historical usage:', error);
      return [];
    }

    return (data || []).map((record: any) => ({
      date: new Date(record.window_start),
      resourceType: record.resource_type,
      requestCount: record.request_count,
      maxRequests: record.max_requests,
    }));
  });
}

/**
 * Get usage summary for a period
 * 
 * @param userId - User ID
 * @param period - Time period ('day', 'week', 'month')
 * @returns Usage summary with aggregated statistics
 */
export async function getUsageSummary(
  userId: string,
  period: 'day' | 'week' | 'month' = 'week'
): Promise<UsageSummary> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  const historicalData = await getHistoricalUsage(userId, undefined, startDate, now);

  // Aggregate data by resource type
  const aggregated: Record<string, number[]> = {
    'ai-api': [],
    'email-send': [],
    'workflow-execution': [],
  };

  for (const dataPoint of historicalData) {
    if (aggregated[dataPoint.resourceType]) {
      aggregated[dataPoint.resourceType].push(dataPoint.requestCount);
    }
  }

  // Calculate statistics
  const calculateStats = (values: number[]) => {
    if (values.length === 0) {
      return { total: 0, average: 0, peak: 0 };
    }
    const total = values.reduce((sum, val) => sum + val, 0);
    const average = total / values.length;
    const peak = Math.max(...values);
    return { total, average, peak };
  };

  return {
    userId,
    period,
    startDate,
    endDate: now,
    stats: {
      'ai-api': calculateStats(aggregated['ai-api']),
      'email-send': calculateStats(aggregated['email-send']),
      'workflow-execution': calculateStats(aggregated['workflow-execution']),
    },
  };
}

/**
 * Get total usage across all time for a user
 * 
 * @param userId - User ID
 * @returns Total usage counts by resource type
 */
export async function getTotalUsage(
  userId: string
): Promise<Record<string, number>> {
  return withConnection(async (supabase) => {
    const { data, error } = await supabase
      .from('rate_limits')
      .select('resource_type, request_count')
      .eq('user_id', userId);

    if (error) {
      console.error('[Usage Tracker] Error fetching total usage:', error);
      return {
        'ai-api': 0,
        'email-send': 0,
        'workflow-execution': 0,
      };
    }

    const totals: Record<string, number> = {
      'ai-api': 0,
      'email-send': 0,
      'workflow-execution': 0,
    };

    for (const record of data || []) {
      if (totals[record.resource_type] !== undefined) {
        totals[record.resource_type] += record.request_count;
      }
    }

    return totals;
  });
}

/**
 * Archive expired rate limit data to usage_statistics
 * This should be called before cleanupExpiredRecords to preserve historical data
 * 
 * @returns Number of records archived
 */
export async function archiveRateLimitData(): Promise<number> {
  return withConnection(async (supabase) => {
    const { data, error } = await supabase.rpc('archive_rate_limit_data');

    if (error) {
      console.error('[Usage Tracker] Error archiving rate limit data:', error);
      return 0;
    }

    const archivedCount = data || 0;
    console.log(`[Usage Tracker] Archived ${archivedCount} rate limit records to usage_statistics`);
    return archivedCount;
  });
}

/**
 * Clean up expired rate limit records
 * This should be called periodically (e.g., via cron job)
 * 
 * @returns Number of records deleted
 */
export async function cleanupExpiredRecords(): Promise<number> {
  return withConnection(async (supabase) => {
    const { data, error } = await supabase.rpc('cleanup_expired_rate_limits');

    if (error) {
      console.error('[Usage Tracker] Error cleaning up expired records:', error);
      return 0;
    }

    const deletedCount = data || 0;
    console.log(`[Usage Tracker] Cleaned up ${deletedCount} expired rate limit records`);
    return deletedCount;
  });
}

/**
 * Clean up old usage statistics
 * Removes statistics older than the retention period
 * 
 * @param retentionDays - Number of days to retain (default: 90)
 * @returns Number of records deleted
 */
export async function cleanupOldUsageStatistics(retentionDays: number = 90): Promise<number> {
  return withConnection(async (supabase) => {
    const { data, error } = await supabase.rpc('cleanup_old_usage_statistics', {
      retention_days: retentionDays,
    });

    if (error) {
      console.error('[Usage Tracker] Error cleaning up old usage statistics:', error);
      return 0;
    }

    const deletedCount = data || 0;
    console.log(`[Usage Tracker] Cleaned up ${deletedCount} old usage statistics records`);
    return deletedCount;
  });
}

/**
 * Reset rate limit counters for a user (admin function)
 * 
 * @param userId - User ID
 * @param resourceType - Resource type to reset (optional, resets all if not provided)
 */
export async function resetUserUsage(
  userId: string,
  resourceType?: string
): Promise<void> {
  return withConnection(async (supabase) => {
    let query = supabase
      .from('rate_limits')
      .delete()
      .eq('user_id', userId);

    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }

    const { error } = await query;

    if (error) {
      console.error('[Usage Tracker] Error resetting user usage:', error);
      throw new Error(`Failed to reset usage: ${error.message}`);
    }

    console.log(`[Usage Tracker] Reset usage for user ${userId}${resourceType ? ` (${resourceType})` : ''}`);
  });
}

/**
 * Get usage trends over time
 * 
 * @param userId - User ID
 * @param resourceType - Resource type
 * @param days - Number of days to analyze (default: 7)
 * @returns Daily usage counts
 */
export async function getUsageTrends(
  userId: string,
  resourceType: string,
  days: number = 7
): Promise<Array<{ date: string; count: number }>> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const historicalData = await getHistoricalUsage(userId, resourceType, startDate);

  // Group by date
  const dailyUsage: Record<string, number> = {};

  for (const dataPoint of historicalData) {
    const dateKey = dataPoint.date.toISOString().split('T')[0];
    dailyUsage[dateKey] = (dailyUsage[dateKey] || 0) + dataPoint.requestCount;
  }

  // Convert to array and sort
  return Object.entries(dailyUsage)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Check if user is approaching rate limit
 * 
 * @param userId - User ID
 * @param resourceType - Resource type
 * @param threshold - Threshold percentage (default: 80%)
 * @returns True if usage is above threshold
 */
export async function isApproachingLimit(
  userId: string,
  resourceType: string,
  threshold: number = 80
): Promise<boolean> {
  const stats = await getCurrentUsageStats(userId);
  const resourceStats = stats[resourceType];

  if (!resourceStats) {
    return false;
  }

  return resourceStats.utilizationPercent >= threshold;
}

/**
 * Helper function to get default max requests for a resource type
 */
function getDefaultMaxRequests(resourceType: string): number {
  const defaults: Record<string, number> = {
    'ai-api': 20,
    'email-send': parseInt(process.env.RATE_LIMIT_EMAIL_PER_HOUR || '100'),
    'workflow-execution': parseInt(process.env.RATE_LIMIT_WORKFLOW_PER_DAY || '1000'),
  };
  return defaults[resourceType] || 0;
}

/**
 * Helper function to get default window seconds for a resource type
 */
function getDefaultWindowSeconds(resourceType: string): number {
  const defaults: Record<string, number> = {
    'ai-api': 60, // 1 minute
    'email-send': 3600, // 1 hour
    'workflow-execution': 86400, // 1 day
  };
  return defaults[resourceType] || 3600;
}

/**
 * Get detailed usage statistics from usage_statistics table
 * 
 * @param userId - User ID
 * @param resourceType - Resource type (optional)
 * @param periodType - Period type (optional: 'minute', 'hour', 'day')
 * @param startDate - Start date for filtering
 * @param endDate - End date for filtering
 * @returns Array of usage statistics
 */
export async function getDetailedUsageStatistics(
  userId: string,
  resourceType?: string,
  periodType?: 'minute' | 'hour' | 'day',
  startDate?: Date,
  endDate?: Date
): Promise<Array<{
  resourceType: string;
  periodType: string;
  periodStart: Date;
  periodEnd: Date;
  requestCount: number;
  maxRequests: number;
  peakRequests: number;
  averageRequests: number;
  utilizationPercent: number;
}>> {
  return withConnection(async (supabase) => {
    const { data, error } = await supabase.rpc('get_usage_statistics', {
      p_user_id: userId,
      p_resource_type: resourceType || null,
      p_period_type: periodType || null,
      p_start_date: startDate?.toISOString() || null,
      p_end_date: endDate?.toISOString() || null,
    });

    if (error) {
      console.error('[Usage Tracker] Error fetching detailed usage statistics:', error);
      return [];
    }

    return (data || []).map((record: any) => ({
      resourceType: record.resource_type,
      periodType: record.period_type,
      periodStart: new Date(record.period_start),
      periodEnd: new Date(record.period_end),
      requestCount: record.request_count,
      maxRequests: record.max_requests,
      peakRequests: record.peak_requests,
      averageRequests: parseFloat(record.average_requests),
      utilizationPercent: parseFloat(record.utilization_percent),
    }));
  });
}

/**
 * Get aggregated usage summary from usage_statistics table
 * 
 * @param userId - User ID
 * @param resourceType - Resource type (optional)
 * @param days - Number of days to include (default: 7)
 * @returns Aggregated usage summary
 */
export async function getAggregatedUsageSummary(
  userId: string,
  resourceType?: string,
  days: number = 7
): Promise<Array<{
  resourceType: string;
  totalRequests: number;
  averageRequests: number;
  peakRequests: number;
  totalPeriods: number;
}>> {
  return withConnection(async (supabase) => {
    const { data, error } = await supabase.rpc('get_usage_summary', {
      p_user_id: userId,
      p_resource_type: resourceType || null,
      p_days: days,
    });

    if (error) {
      console.error('[Usage Tracker] Error fetching aggregated usage summary:', error);
      return [];
    }

    return (data || []).map((record: any) => ({
      resourceType: record.resource_type,
      totalRequests: parseInt(record.total_requests),
      averageRequests: parseFloat(record.average_requests),
      peakRequests: record.peak_requests,
      totalPeriods: record.total_periods,
    }));
  });
}
