import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Create Supabase client (use regular client for auth operations)
    const supabase = await createServerClient();

    // Sign out user
    const { error } = await supabase.auth.signOut();

    if (error) {
      return ApiResponse.error(error.message, 500);
    }

    return ApiResponse.success({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
