/**
 * Execution Cleanup API Endpoint
 * 
 * POST /api/executions/cleanup
 * 
 * Requirement 24: System SHALL automatically delete execution records older than
 * a configurable retention period (default 90 days)
 * 
 * This endpoint allows manual triggering of execution record cleanup.
 * It can also be called by a cron job or scheduled task.
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { cleanupService } from '@/lib/workflow-engine/cleanup-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/executions/cleanup
 * 
 * Trigger execution record cleanup
 * 
 * Request body (all optional):
 * {
 *   "retentionDays": number,  // Override default retention period
 *   "dryRun": boolean,        // If true, only count records without deleting
 *   "batchSize": number       // Number of records to delete per batch
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "executionsDeleted": number,
 *     "logsDeleted": number,
 *     "cutoffDate": string,
 *     "dryRun": boolean,
 *     "durationMs": number,
 *     "errors": string[]
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    // Note: In production, you might want to restrict this to admin users only
    const user = await requireAuth();

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { retentionDays, dryRun, batchSize } = body;

    // Validate parameters if provided
    if (retentionDays !== undefined) {
      if (typeof retentionDays !== 'number' || retentionDays <= 0) {
        return ApiResponse.badRequest('retentionDays must be a positive number');
      }
      if (retentionDays < 1) {
        return ApiResponse.badRequest('retentionDays must be at least 1');
      }
    }

    if (dryRun !== undefined && typeof dryRun !== 'boolean') {
      return ApiResponse.badRequest('dryRun must be a boolean');
    }

    if (batchSize !== undefined) {
      if (typeof batchSize !== 'number' || batchSize <= 0) {
        return ApiResponse.badRequest('batchSize must be a positive number');
      }
      if (batchSize > 1000) {
        return ApiResponse.badRequest('batchSize must not exceed 1000');
      }
    }

    // Execute cleanup
    console.log(`[CleanupAPI] Cleanup triggered by user: ${user.id}`);
    const result = await cleanupService.cleanup({
      retentionDays,
      dryRun,
      batchSize,
    });

    // Log result
    if (result.errors.length > 0) {
      console.error('[CleanupAPI] Cleanup completed with errors:', result.errors);
    } else {
      console.log('[CleanupAPI] Cleanup completed successfully:', {
        executionsDeleted: result.executionsDeleted,
        logsDeleted: result.logsDeleted,
        durationMs: result.durationMs,
      });
    }

    // Return result
    return ApiResponse.success({
      executionsDeleted: result.executionsDeleted,
      logsDeleted: result.logsDeleted,
      cutoffDate: result.cutoffDate.toISOString(),
      dryRun: result.dryRun,
      durationMs: result.durationMs,
      errors: result.errors,
      config: {
        retentionDays: retentionDays ?? cleanupService.getConfig().retentionDays,
        batchSize: batchSize ?? cleanupService.getConfig().batchSize,
      },
    });
  } catch (error) {
    console.error('[CleanupAPI] Cleanup failed:', error);
    return errorResponse(error);
  }
}

/**
 * GET /api/executions/cleanup
 * 
 * Get current cleanup configuration
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "retentionDays": number,
 *     "batchSize": number
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    // Get current configuration
    const config = cleanupService.getConfig();

    return ApiResponse.success({
      retentionDays: config.retentionDays,
      batchSize: config.batchSize,
      defaultRetentionDays: 90,
      environmentVariable: 'EXECUTION_RETENTION_DAYS',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
