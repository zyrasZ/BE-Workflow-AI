/**
 * Debug endpoint to check environment variables
 * DELETE THIS FILE after debugging!
 */

import { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/utils/response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Check if environment variables are loaded
  const envCheck = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing',
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ? '✅ Set' : '❌ Missing',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing',
    EMAIL_ENCRYPTION_KEY: process.env.EMAIL_ENCRYPTION_KEY ? '✅ Set' : '❌ Missing',
    
    // Show first 10 chars only for security
    GOOGLE_CLIENT_ID_preview: process.env.GOOGLE_CLIENT_ID?.substring(0, 10) + '...',
    GOOGLE_CLIENT_SECRET_preview: process.env.GOOGLE_CLIENT_SECRET?.substring(0, 10) + '...',
  };

  return ApiResponse.success(envCheck);
}
