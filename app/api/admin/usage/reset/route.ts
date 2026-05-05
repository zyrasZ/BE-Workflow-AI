/**
 * Admin Usage Reset API
 * 
 * POST /api/admin/usage/reset
 * 
 * Resets usage statistics for a user (admin only).
 * This is useful for testing or when adjusting user quotas.
 * 
 * Body:
 * {
 *   "userId": "uuid",
 *   "resourceType": "ai-api" | "email-send" | "workflow-execution" (optional)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { resetUserUsage } from '@/lib/middleware/usage-tracker';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin (you should implement proper admin check)
    // For now, we'll check if there's an ADMIN_USER_IDS environment variable
    const adminUserIds = process.env.ADMIN_USER_IDS?.split(',') || [];
    if (!adminUserIds.includes(user.id)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { userId, resourceType } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    // Validate resourceType if provided
    if (resourceType && !['ai-api', 'email-send', 'workflow-execution'].includes(resourceType)) {
      return NextResponse.json(
        { error: 'Invalid resourceType. Must be one of: ai-api, email-send, workflow-execution' },
        { status: 400 }
      );
    }

    // Reset usage
    await resetUserUsage(userId, resourceType);

    return NextResponse.json({
      success: true,
      message: `Usage reset for user ${userId}${resourceType ? ` (${resourceType})` : ''}`,
      userId,
      resourceType: resourceType || 'all',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin Usage Reset API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to reset usage',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Allow GET for documentation
export async function GET() {
  return NextResponse.json({
    endpoint: 'Admin Usage Reset',
    method: 'POST',
    description: 'Resets usage statistics for a user (admin only)',
    authentication: 'Required - Admin user',
    body: {
      userId: 'string (required) - User ID to reset usage for',
      resourceType: 'string (optional) - Specific resource type to reset (ai-api, email-send, workflow-execution)',
    },
  });
}
