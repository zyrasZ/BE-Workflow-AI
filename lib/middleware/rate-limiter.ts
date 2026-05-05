/**
 * Rate Limiting Middleware
 * 
 * Enforces usage limits to prevent abuse:
 * - AI API calls: 20 requests per minute per user
 * - Email sending: 100 emails per hour per user (configurable)
 * - Workflow executions: 1000 executions per day per user (configurable)
 * 
 * Returns 429 Too Many Requests with Retry-After header when limit exceeded
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { withConnection } from '@/lib/database/pool';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Resource type being limited */
  resourceType: 'ai-api' | 'email-send' | 'workflow-execution';
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current usage count */
  current: number;
  /** Maximum allowed requests */
  limit: number;
  /** Remaining requests in current window */
  remaining: number;
  /** Timestamp when the limit resets (Unix timestamp in seconds) */
  resetAt: number;
  /** Seconds until the limit resets */
  retryAfter?: number;
}

/**
 * Rate limit record in database
 */
interface RateLimitRecord {
  user_id: string;
  resource_type: string;
  window_start: string;
  request_count: number;
  window_seconds: number;
  max_requests: number;
}

/**
 * Default rate limit configurations
 */
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  'ai-api': {
    maxRequests: 20,
    windowSeconds: 60, // 1 minute
    resourceType: 'ai-api',
  },
  'email-send': {
    maxRequests: parseInt(process.env.RATE_LIMIT_EMAIL_PER_HOUR || '100'),
    windowSeconds: 3600, // 1 hour
    resourceType: 'email-send',
  },
  'workflow-execution': {
    maxRequests: parseInt(process.env.RATE_LIMIT_WORKFLOW_PER_DAY || '1000'),
    windowSeconds: 86400, // 1 day
    resourceType: 'workflow-execution',
  },
};

/**
 * Get rate limit configuration for a resource type
 */
export function getRateLimitConfig(resourceType: string): RateLimitConfig {
  return DEFAULT_LIMITS[resourceType] || DEFAULT_LIMITS['workflow-execution'];
}

/**
 * Check rate limit for a user
 * 
 * @param userId - User ID to check
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  return withConnection(async (supabase) => {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - config.windowSeconds * 1000
    );

    // Get or create rate limit record
    const { data: records, error: fetchError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('user_id', userId)
      .eq('resource_type', config.resourceType)
      .gte('window_start', windowStart.toISOString())
      .order('window_start', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('[Rate Limiter] Error fetching rate limit:', fetchError);
      // On error, allow the request (fail open)
      return {
        allowed: true,
        current: 0,
        limit: config.maxRequests,
        remaining: config.maxRequests,
        resetAt: Math.floor((now.getTime() + config.windowSeconds * 1000) / 1000),
      };
    }

    const existingRecord = records?.[0] as RateLimitRecord | undefined;

    // Check if we have a recent record within the window
    if (existingRecord) {
      const recordWindowStart = new Date(existingRecord.window_start);
      const windowEnd = new Date(
        recordWindowStart.getTime() + config.windowSeconds * 1000
      );

      // If the record is still valid (within window)
      if (now < windowEnd) {
        const current = existingRecord.request_count;
        const allowed = current < config.maxRequests;
        const remaining = Math.max(0, config.maxRequests - current);
        const resetAt = Math.floor(windowEnd.getTime() / 1000);
        const retryAfter = allowed ? undefined : Math.ceil((windowEnd.getTime() - now.getTime()) / 1000);

        return {
          allowed,
          current,
          limit: config.maxRequests,
          remaining,
          resetAt,
          retryAfter,
        };
      }
    }

    // No valid record found, create a new window
    return {
      allowed: true,
      current: 0,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetAt: Math.floor((now.getTime() + config.windowSeconds * 1000) / 1000),
    };
  });
}

/**
 * Increment rate limit counter for a user
 * 
 * @param userId - User ID
 * @param config - Rate limit configuration
 */
export async function incrementRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<void> {
  return withConnection(async (supabase) => {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - config.windowSeconds * 1000
    );

    // Get existing record
    const { data: records } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('user_id', userId)
      .eq('resource_type', config.resourceType)
      .gte('window_start', windowStart.toISOString())
      .order('window_start', { ascending: false })
      .limit(1);

    const existingRecord = records?.[0] as RateLimitRecord | undefined;

    if (existingRecord) {
      const recordWindowStart = new Date(existingRecord.window_start);
      const windowEnd = new Date(
        recordWindowStart.getTime() + config.windowSeconds * 1000
      );

      // If record is still valid, increment it
      if (now < windowEnd) {
        await supabase
          .from('rate_limits')
          .update({
            request_count: existingRecord.request_count + 1,
          })
          .eq('user_id', userId)
          .eq('resource_type', config.resourceType)
          .eq('window_start', existingRecord.window_start);
        return;
      }
    }

    // Create new record for new window
    await supabase.from('rate_limits').insert({
      user_id: userId,
      resource_type: config.resourceType,
      window_start: now.toISOString(),
      request_count: 1,
      window_seconds: config.windowSeconds,
      max_requests: config.maxRequests,
    });
  });
}

/**
 * Rate limiting middleware for Next.js API routes
 * 
 * @param resourceType - Type of resource being rate limited
 * @returns Middleware function
 * 
 * @example
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const rateLimitResult = await rateLimitMiddleware('ai-api')(request);
 *   if (rateLimitResult) return rateLimitResult;
 *   
 *   // Continue with request handling
 * }
 * ```
 */
export function rateLimitMiddleware(resourceType: string) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    try {
      // Get authenticated user
      const user = await getUser();
      
      if (!user) {
        // No user, no rate limiting (auth will be handled separately)
        return null;
      }

      // Get rate limit configuration
      const config = getRateLimitConfig(resourceType);

      // Check rate limit
      const result = await checkRateLimit(user.id, config);

      // If not allowed, return 429
      if (!result.allowed) {
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: `Too many ${resourceType} requests. Please try again later.`,
            limit: result.limit,
            current: result.current,
            resetAt: result.resetAt,
            retryAfter: result.retryAfter,
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': result.limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': result.resetAt.toString(),
              'Retry-After': result.retryAfter?.toString() || '60',
            },
          }
        );
      }

      // Increment counter for successful check
      await incrementRateLimit(user.id, config);

      // Add rate limit headers to response (will be added by the route handler)
      return null;
    } catch (error) {
      console.error('[Rate Limiter] Error in middleware:', error);
      // On error, allow the request (fail open)
      return null;
    }
  };
}

/**
 * Get current usage for a user
 * 
 * @param userId - User ID
 * @param resourceType - Resource type
 * @returns Current usage information
 */
export async function getCurrentUsage(
  userId: string,
  resourceType: string
): Promise<RateLimitResult> {
  const config = getRateLimitConfig(resourceType);
  return checkRateLimit(userId, config);
}

/**
 * Get all usage information for a user
 * 
 * @param userId - User ID
 * @returns Usage information for all resource types
 */
export async function getAllUsage(
  userId: string
): Promise<Record<string, RateLimitResult>> {
  const resourceTypes = ['ai-api', 'email-send', 'workflow-execution'];
  const results: Record<string, RateLimitResult> = {};

  for (const resourceType of resourceTypes) {
    results[resourceType] = await getCurrentUsage(userId, resourceType);
  }

  return results;
}

/**
 * Reset rate limit for a user (admin function)
 * 
 * @param userId - User ID
 * @param resourceType - Resource type to reset (optional, resets all if not provided)
 */
export async function resetRateLimit(
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

    await query;
  });
}

/**
 * Cleanup old rate limit records (should be run periodically)
 * Removes records older than their window duration
 */
export async function cleanupOldRateLimits(): Promise<number> {
  return withConnection(async (supabase) => {
    const now = new Date();

    // Delete records where window_start + window_seconds < now
    const { data, error } = await supabase
      .from('rate_limits')
      .select('*');

    if (error || !data) {
      console.error('[Rate Limiter] Error fetching records for cleanup:', error);
      return 0;
    }

    let deletedCount = 0;

    for (const record of data as RateLimitRecord[]) {
      const windowStart = new Date(record.window_start);
      const windowEnd = new Date(
        windowStart.getTime() + record.window_seconds * 1000
      );

      if (now > windowEnd) {
        await supabase
          .from('rate_limits')
          .delete()
          .eq('user_id', record.user_id)
          .eq('resource_type', record.resource_type)
          .eq('window_start', record.window_start);
        
        deletedCount++;
      }
    }

    return deletedCount;
  });
}
