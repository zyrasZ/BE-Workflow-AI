/**
 * Gmail Token - Get Google Access Token
 * GET /api/auth/gmail-token
 * 
 * Returns Google OAuth access token from Supabase session
 * Used for Gmail API operations
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Create Supabase client
    const supabase = createServerClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Failed to get user:', userError);
      return ApiResponse.error('Unauthorized', 401);
    }

    // Get session to access provider tokens
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error('Failed to get session:', sessionError);
      return ApiResponse.error('No active session', 401);
    }

    // Check if provider_token exists (Google access token)
    if (!session.provider_token) {
      return ApiResponse.error('No Gmail token found. Please re-authenticate with Google.', 404, 'NO_GMAIL_TOKEN');
    }

    // Return tokens
    return ApiResponse.success({
      accessToken: session.provider_token,
      refreshToken: session.provider_refresh_token || null,
      email: user.email,
    });
  } catch (error) {
    console.error('Gmail token error:', error);
    return errorResponse(error);
  }
}
