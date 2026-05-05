/**
 * Usage Tracking System Documentation
 * 
 * This file documents the usage tracking system that monitors and tracks
 * API usage, email sending, and workflow executions per user.
 * 
 * ## Overview
 * 
 * The usage tracking system provides:
 * - Real-time usage statistics per user
 * - Historical usage data for analytics
 * - Automatic cleanup of expired records
 * - Usage trends and summaries
 * - Warnings when approaching rate limits
 * 
 * ## Architecture
 * 
 * ### Components
 * 
 * 1. **Rate Limiter** (`rate-limiter.ts`)
 *    - Enforces rate limits on API calls, email sending, and workflow executions
 *    - Stores usage data in the `rate_limits` table
 *    - Automatically increments counters on each request
 * 
 * 2. **Usage Tracker** (`usage-tracker.ts`)
 *    - Provides analytics and historical usage data
 *    - Calculates usage statistics and trends
 *    - Detects when users are approaching limits
 * 
 * 3. **Cleanup Job** (`lib/jobs/cleanup-rate-limits.ts`)
 *    - Periodically removes expired rate limit records
 *    - Automatically resets counters at appropriate intervals
 *    - Runs hourly via Vercel Cron
 * 
 * ### Database Schema
 * 
 * The `rate_limits` table stores usage data:
 * 
 * ```sql
 * CREATE TABLE rate_limits (
 *   id UUID PRIMARY KEY,
 *   user_id UUID NOT NULL,
 *   resource_type TEXT NOT NULL,  -- 'ai-api', 'email-send', 'workflow-execution'
 *   window_start TIMESTAMPTZ NOT NULL,
 *   request_count INTEGER NOT NULL,
 *   window_seconds INTEGER NOT NULL,  -- 60, 3600, or 86400
 *   max_requests INTEGER NOT NULL,
 *   created_at TIMESTAMPTZ,
 *   updated_at TIMESTAMPTZ
 * );
 * ```
 * 
 * ## Rate Limits
 * 
 * | Resource Type | Limit | Window |
 * |---------------|-------|--------|
 * | ai-api | 20 requests | 1 minute |
 * | email-send | 100 emails | 1 hour |
 * | workflow-execution | 1000 executions | 1 day |
 * 
 * ## API Endpoints
 * 
 * ### GET /api/usage
 * 
 * Returns usage statistics for the authenticated user.
 * 
 * **Query Parameters:**
 * - `resourceType`: Filter by resource type (optional)
 * - `period`: Time period for summary (day, week, month)
 * - `startDate`: Start date for historical data (ISO 8601)
 * - `endDate`: End date for historical data (ISO 8601)
 * - `includeHistory`: Include historical data points (boolean)
 * - `includeTrends`: Include usage trends (boolean)
 * 
 * **Response:**
 * ```json
 * {
 *   "userId": "uuid",
 *   "timestamp": "2024-01-01T00:00:00Z",
 *   "current": {
 *     "ai-api": {
 *       "resourceType": "ai-api",
 *       "totalRequests": 10,
 *       "currentWindowRequests": 10,
 *       "maxRequests": 20,
 *       "remaining": 10,
 *       "windowStart": "2024-01-01T00:00:00Z",
 *       "windowEnd": "2024-01-01T00:01:00Z",
 *       "utilizationPercent": 50
 *     },
 *     "email-send": { ... },
 *     "workflow-execution": { ... }
 *   },
 *   "total": {
 *     "ai-api": 100,
 *     "email-send": 500,
 *     "workflow-execution": 1000
 *   },
 *   "summary": {
 *     "userId": "uuid",
 *     "period": "week",
 *     "startDate": "2024-01-01T00:00:00Z",
 *     "endDate": "2024-01-08T00:00:00Z",
 *     "stats": {
 *       "ai-api": { "total": 100, "average": 14.3, "peak": 20 },
 *       "email-send": { "total": 500, "average": 71.4, "peak": 100 },
 *       "workflow-execution": { "total": 1000, "average": 142.9, "peak": 200 }
 *     }
 *   },
 *   "warnings": [
 *     {
 *       "resourceType": "ai-api",
 *       "message": "Usage for ai-api is at 85.0% of limit",
 *       "utilizationPercent": 85
 *     }
 *   ]
 * }
 * ```
 * 
 * ### POST /api/jobs/cleanup-rate-limits
 * 
 * Triggers cleanup of expired rate limit records (cron job).
 * 
 * **Authentication:** Requires `CRON_SECRET` in Authorization header
 * 
 * **Response:**
 * ```json
 * {
 *   "success": true,
 *   "message": "Rate limit cleanup completed",
 *   "deletedCount": 42,
 *   "timestamp": "2024-01-01T00:00:00Z"
 * }
 * ```
 * 
 * ### POST /api/admin/usage/reset
 * 
 * Resets usage statistics for a user (admin only).
 * 
 * **Body:**
 * ```json
 * {
 *   "userId": "uuid",
 *   "resourceType": "ai-api"  // optional
 * }
 * ```
 * 
 * ## Usage Examples
 * 
 * ### Get Current Usage Stats
 * 
 * ```typescript
 * import { getCurrentUsageStats } from '@/lib/middleware/usage-tracker';
 * 
 * const stats = await getCurrentUsageStats(userId);
 * console.log(`AI API usage: ${stats['ai-api'].currentWindowRequests}/${stats['ai-api'].maxRequests}`);
 * ```
 * 
 * ### Get Historical Usage
 * 
 * ```typescript
 * import { getHistoricalUsage } from '@/lib/middleware/usage-tracker';
 * 
 * const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
 * const history = await getHistoricalUsage(userId, 'email-send', startDate);
 * ```
 * 
 * ### Get Usage Summary
 * 
 * ```typescript
 * import { getUsageSummary } from '@/lib/middleware/usage-tracker';
 * 
 * const summary = await getUsageSummary(userId, 'week');
 * console.log(`Total AI API calls this week: ${summary.stats['ai-api'].total}`);
 * ```
 * 
 * ### Check if Approaching Limit
 * 
 * ```typescript
 * import { isApproachingLimit } from '@/lib/middleware/usage-tracker';
 * 
 * const approaching = await isApproachingLimit(userId, 'ai-api', 80);
 * if (approaching) {
 *   console.warn('User is approaching AI API rate limit');
 * }
 * ```
 * 
 * ### Get Usage Trends
 * 
 * ```typescript
 * import { getUsageTrends } from '@/lib/middleware/usage-tracker';
 * 
 * const trends = await getUsageTrends(userId, 'workflow-execution', 7);
 * // Returns daily usage counts for the last 7 days
 * ```
 * 
 * ## Automatic Cleanup
 * 
 * The cleanup job runs automatically every hour via Vercel Cron:
 * 
 * ```json
 * // vercel.json
 * {
 *   "crons": [
 *     {
 *       "path": "/api/jobs/cleanup-rate-limits",
 *       "schedule": "0 * * * *"  // Every hour
 *     }
 *   ]
 * }
 * ```
 * 
 * The cleanup job:
 * 1. Identifies expired rate limit records (window_start + window_seconds < NOW)
 * 2. Deletes expired records from the database
 * 3. Logs the number of deleted records
 * 
 * This ensures:
 * - Rate limit counters reset at appropriate intervals
 * - The database doesn't grow indefinitely
 * - Historical data is preserved for analytics
 * 
 * ## Environment Variables
 * 
 * ```env
 * # Rate limit configuration
 * RATE_LIMIT_EMAIL_PER_HOUR=100
 * RATE_LIMIT_WORKFLOW_PER_DAY=1000
 * 
 * # Cron job authentication
 * CRON_SECRET=your-secret-key
 * 
 * # Admin users (comma-separated UUIDs)
 * ADMIN_USER_IDS=uuid1,uuid2,uuid3
 * ```
 * 
 * ## Database Functions
 * 
 * ### cleanup_expired_rate_limits()
 * 
 * Removes expired rate limit records.
 * 
 * ```sql
 * SELECT cleanup_expired_rate_limits();
 * -- Returns: number of deleted records
 * ```
 * 
 * ### get_current_usage(user_id, resource_type)
 * 
 * Gets current usage information for a user and resource type.
 * 
 * ```sql
 * SELECT * FROM get_current_usage('uuid', 'ai-api');
 * -- Returns: current_count, max_allowed, window_start, window_end, remaining
 * ```
 * 
 * ## Testing
 * 
 * Run tests:
 * 
 * ```bash
 * npm test lib/middleware/__tests__/usage-tracker.test.ts
 * npm test app/api/usage/__tests__/route.test.ts
 * ```
 * 
 * ## Monitoring
 * 
 * Monitor usage tracking:
 * 
 * 1. Check cleanup job logs in Vercel dashboard
 * 2. Query rate_limits table for usage patterns
 * 3. Monitor API response times for /api/usage endpoint
 * 4. Set up alerts for high utilization (>80%)
 * 
 * ## Troubleshooting
 * 
 * ### Rate limits not resetting
 * 
 * - Check if cleanup job is running (Vercel Cron logs)
 * - Verify CRON_SECRET is set correctly
 * - Manually trigger cleanup: `POST /api/jobs/cleanup-rate-limits`
 * 
 * ### Usage stats not updating
 * 
 * - Verify rate limiter is incrementing counters
 * - Check database connection
 * - Review rate_limits table for recent records
 * 
 * ### High database growth
 * 
 * - Ensure cleanup job is running regularly
 * - Consider reducing retention period
 * - Archive old records to separate table
 * 
 * ## Future Enhancements
 * 
 * - Support for custom quota tiers per user
 * - Real-time usage notifications
 * - Usage analytics dashboard
 * - Export usage reports
 * - Predictive usage alerts
 */

export {};
