/**
 * Usage Statistics API
 * 
 * GET /api/usage
 * 
 * Returns current usage statistics and historical data for the authenticated user.
 * Supports querying by resource type and time period.
 * Supports different quota tiers for different user plans (basic, pro, enterprise).
 * 
 * Query Parameters:
 * - resourceType: Filter by resource type (ai-api, email-send, workflow-execution)
 * - period: Time period for summary (day, week, month)
 * - startDate: Start date for historical data (ISO 8601)
 * - endDate: End date for historical data (ISO 8601)
 * - includeHistory: Include historical data points (default: false)
 * - includeTrends: Include usage trends (default: false)
 * 
 * Quota Tiers:
 * - basic: AI: 20/min, Email: 100/hour, Workflow: 1000/day
 * - pro: AI: 100/min, Email: 500/hour, Workflow: 5000/day
 * - enterprise: AI: 500/min, Email: 2000/hour, Workflow: 20000/day
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServiceClient } from '@/lib/supabase/server';
import {
  getCurrentUsageStats,
  getHistoricalUsage,
  getUsageSummary,
  getTotalUsage,
  getUsageTrends,
  isApproachingLimit,
  getDetailedUsageStatistics,
  getAggregatedUsageSummary,
} from '@/lib/middleware/usage-tracker';

/**
 * Quota tier definitions
 */
export type QuotaTier = 'basic' | 'pro' | 'enterprise';

export interface QuotaLimits {
  'ai-api': number;
  'email-send': number;
  'workflow-execution': number;
}

const QUOTA_TIERS: Record<QuotaTier, QuotaLimits> = {
  basic: {
    'ai-api': 20, // per minute
    'email-send': 100, // per hour
    'workflow-execution': 1000, // per day
  },
  pro: {
    'ai-api': 100, // per minute
    'email-send': 500, // per hour
    'workflow-execution': 5000, // per day
  },
  enterprise: {
    'ai-api': 500, // per minute
    'email-send': 2000, // per hour
    'workflow-execution': 20000, // per day
  },
};

/**
 * Get user's quota tier from user_settings
 */
async function getUserQuotaTier(userId: string): Promise<QuotaTier> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Default to basic tier if no settings found
    return 'basic';
  }

  const preferences = data.preferences as any;
  const tier = preferences?.quotaTier as QuotaTier;

  // Validate tier and default to basic if invalid
  if (tier && ['basic', 'pro', 'enterprise'].includes(tier)) {
    return tier;
  }

  return 'basic';
}

/**
 * Apply quota tier limits to usage stats
 */
function applyQuotaTierLimits(
  stats: Record<string, any>,
  tier: QuotaTier
): Record<string, any> {
  const limits = QUOTA_TIERS[tier];
  const result: Record<string, any> = {};

  for (const [resourceType, stat] of Object.entries(stats)) {
    const limit = limits[resourceType as keyof QuotaLimits];
    
    if (limit !== undefined) {
      result[resourceType] = {
        ...stat,
        maxRequests: limit,
        remaining: Math.max(0, limit - stat.currentWindowRequests),
        utilizationPercent: limit > 0 ? (stat.currentWindowRequests / limit) * 100 : 0,
      };
    } else {
      result[resourceType] = stat;
    }
  }

  return result;
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's quota tier
    const quotaTier = await getUserQuotaTier(user.id);
    const quotaLimits = QUOTA_TIERS[quotaTier];

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const resourceType = searchParams.get('resourceType') || undefined;
    const period = (searchParams.get('period') as 'day' | 'week' | 'month') || 'week';
    const periodType = searchParams.get('periodType') as 'minute' | 'hour' | 'day' | undefined;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const includeTrends = searchParams.get('includeTrends') === 'true';
    const includeDetailed = searchParams.get('includeDetailed') === 'true';

    // Get current usage stats
    const currentStats = await getCurrentUsageStats(user.id);

    // Apply quota tier limits to current stats
    const currentStatsWithTier = applyQuotaTierLimits(currentStats, quotaTier);

    // Build response
    const response: any = {
      userId: user.id,
      timestamp: new Date().toISOString(),
      quotaTier,
      quotaLimits,
      current: currentStatsWithTier,
    };

    // Add total usage
    response.total = await getTotalUsage(user.id);

    // Add usage summary
    response.summary = await getUsageSummary(user.id, period);

    // Add historical data if requested
    if (includeHistory) {
      response.history = await getHistoricalUsage(
        user.id,
        resourceType,
        startDate,
        endDate
      );
    }

    // Add usage trends if requested
    if (includeTrends) {
      const resourceTypes = resourceType
        ? [resourceType]
        : ['ai-api', 'email-send', 'workflow-execution'];

      response.trends = {};
      for (const type of resourceTypes) {
        response.trends[type] = await getUsageTrends(user.id, type, 7);
      }
    }

    // Add detailed statistics if requested
    if (includeDetailed) {
      response.detailed = await getDetailedUsageStatistics(
        user.id,
        resourceType,
        periodType,
        startDate,
        endDate
      );

      // Add aggregated summary from usage_statistics table
      response.aggregated = await getAggregatedUsageSummary(
        user.id,
        resourceType,
        period === 'day' ? 1 : period === 'week' ? 7 : 30
      );
    }

    // Add warnings for approaching limits (using tier-adjusted limits)
    response.warnings = [];
    for (const [type, stats] of Object.entries(currentStatsWithTier)) {
      const utilizationPercent = (stats as any).utilizationPercent;
      if (utilizationPercent >= 80) {
        response.warnings.push({
          resourceType: type,
          message: `Usage for ${type} is at ${utilizationPercent.toFixed(1)}% of limit`,
          utilizationPercent,
          tier: quotaTier,
        });
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Usage API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch usage statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
