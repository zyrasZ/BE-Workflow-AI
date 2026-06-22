import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { validateRequired, validateEmail, errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validation
    validateRequired({ email, password }, ['email', 'password']);
    validateEmail(email);

    // Create Supabase client (use regular client for auth operations)
    const supabase = await createServerClient();

    // Sign in user
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return ApiResponse.unauthorized('Invalid email or password');
    }

    if (!data.user || !data.session) {
      return ApiResponse.unauthorized('Invalid email or password');
    }

    return ApiResponse.success({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
      },
      session: data.session,
      access_token: data.session.access_token,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
