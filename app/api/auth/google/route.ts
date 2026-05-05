/**
 * Google OAuth - Initiate Authentication Flow
 * POST /api/auth/google
 * 
 * Returns Google OAuth URL for client to redirect to
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { getOAuthRedirectUrl } from '@/lib/auth/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Get redirect URL from environment
    const redirectUrl = getOAuthRedirectUrl();

    // Create Supabase client
    const supabase = createServerClient();

    // Generate OAuth URL with Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        scopes: 'email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
      },
    });

    if (error) {
      console.error('OAuth initiation error:', error);
      return ApiResponse.error('Failed to initiate Google OAuth', 500);
    }

    if (!data.url) {
      return ApiResponse.error('Failed to generate OAuth URL', 500);
    }

    return ApiResponse.success({
      url: data.url,
      provider: 'google',
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    return errorResponse(error);
  }
}

/**
 * GET method for direct browser redirect
 * GET /api/auth/google
 */
export async function GET(request: NextRequest) {
  try {
    // Get redirect URL from environment
    const redirectUrl = getOAuthRedirectUrl();

    // Create Supabase client
    const supabase = createServerClient();

    // Generate OAuth URL with Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        scopes: 'email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
      },
    });

    if (error || !data.url) {
      console.error('OAuth initiation error:', error);
      return ApiResponse.error('Failed to initiate Google OAuth', 500);
    }

    // Redirect directly to Google OAuth
    return Response.redirect(data.url);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return errorResponse(error);
  }
}
