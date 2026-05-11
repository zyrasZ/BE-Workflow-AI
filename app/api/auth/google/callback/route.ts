/**
 * Google OAuth - Handle Callback
 * GET /api/auth/google/callback
 * 
 * Handles OAuth callback from Google
 * Exchanges code for tokens and creates/updates user
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { validateCallbackParams, parseOAuthError, extractUserInfo } from '@/lib/auth/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract callback parameters
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Validate callback parameters
    const validation = validateCallbackParams({
      code: code || undefined,
      error: error || undefined,
      error_description: errorDescription || undefined,
    });

    if (!validation.valid) {
      console.error('OAuth callback validation failed:', validation.error);
      
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_ERROR_URL || process.env.FRONTEND_URL || 'http://localhost:5173/login';
      const errorUrl = `${frontendUrl}?error=${encodeURIComponent(validation.error || 'OAuth failed')}`;
      return Response.redirect(errorUrl);
    }

    // Create Supabase client
    const supabase = createServerClient();

    // Exchange code for session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code!);

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError);
      const errorMessage = parseOAuthError(exchangeError);
      
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_ERROR_URL || process.env.FRONTEND_URL || 'http://localhost:5173/login';
      const errorUrl = `${frontendUrl}?error=${encodeURIComponent(errorMessage)}`;
      return Response.redirect(errorUrl);
    }

    if (!data.user || !data.session) {
      console.error('No user or session returned from OAuth');
      
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_ERROR_URL || process.env.FRONTEND_URL || 'http://localhost:5173/login';
      const errorUrl = `${frontendUrl}?error=${encodeURIComponent('Failed to authenticate')}`;
      return Response.redirect(errorUrl);
    }

    // Extract user info
    const userInfo = extractUserInfo('google', {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
      picture: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
      email_verified: data.user.email_confirmed_at ? true : false,
    });

    console.log('OAuth success:', {
      userId: userInfo.id,
      email: userInfo.email,
      provider: userInfo.provider,
    });

    // Check if provider_token exists (requires "Save provider tokens" enabled in Supabase)
    const providerToken = data.session.provider_token;
    
    if (!providerToken) {
      console.warn('⚠️  provider_token is null. Please enable "Save provider tokens" in Supabase Dashboard:');
      console.warn('   Supabase Dashboard → Authentication → Providers → Google → Enable "Save provider tokens"');
    }

    // Redirect to frontend with success
    const frontendUrl = process.env.FRONTEND_SUCCESS_URL || process.env.FRONTEND_URL || 'http://localhost:5173/auth/callback';
    
    console.log('Redirecting to frontend:', frontendUrl);
    
    // Build URL with tokens
    const params = new URLSearchParams({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    
    // Only add provider_token if it exists
    if (providerToken) {
      params.append('provider_token', providerToken);
    }
    
    const successUrl = `${frontendUrl}?${params.toString()}`;
    
    console.log('Redirect URL length:', successUrl.length);
    console.log('Redirect URL (first 100 chars):', successUrl.substring(0, 100));
    
    // Use 302 redirect with proper headers
    return new Response(null, {
      status: 302,
      headers: {
        'Location': successUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    
    // Redirect to frontend with error
    const frontendUrl = process.env.FRONTEND_ERROR_URL || process.env.FRONTEND_URL || 'http://localhost:5173/login';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorUrl = `${frontendUrl}?error=${encodeURIComponent(errorMessage)}`;
    return Response.redirect(errorUrl);
  }
}

/**
 * POST method for API-based callback handling
 * POST /api/auth/google/callback
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return ApiResponse.error('Missing authorization code', 400);
    }

    // Create Supabase client
    const supabase = createServerClient();

    // Exchange code for session
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Code exchange error:', exchangeError);
      const errorMessage = parseOAuthError(exchangeError);
      return ApiResponse.error(errorMessage, 400);
    }

    if (!data.user || !data.session) {
      return ApiResponse.error('Failed to authenticate', 500);
    }

    // Extract user info
    const userInfo = extractUserInfo('google', {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
      picture: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
      email_verified: data.user.email_confirmed_at ? true : false,
    });

    return ApiResponse.success({
      user: userInfo,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
      },
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return errorResponse(error);
  }
}
