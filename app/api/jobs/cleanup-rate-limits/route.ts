/**
 * Rate Limit Cleanup Job API Endpoint
 * 
 * POST /api/jobs/cleanup-rate-limits
 * 
 * Triggers the cleanup of expired rate limit records.
 * This endpoint should be called by a cron service (e.g., Vercel Cron, GitHub Actions)
 * to periodically clean up old records.
 * 
 * Authentication: Requires CRON_SECRET environment variable to match
 */

import { NextRequest, NextResponse } from 'next/server';
import { runCleanupJob } from '@/lib/jobs/cleanup-rate-limits';

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Run the cleanup job
    const result = await runCleanupJob();

    return NextResponse.json({
      success: true,
      message: 'Rate limit cleanup completed',
      archivedCount: result.archived,
      deletedCount: result.deleted,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cleanup API] Error:', error);
    return NextResponse.json(
      {
        error: 'Cleanup job failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    endpoint: 'Rate Limit Cleanup Job',
    method: 'POST',
    description: 'Cleans up expired rate limit records',
    authentication: 'Bearer token in Authorization header (CRON_SECRET)',
  });
}
