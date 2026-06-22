import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { validateRequired, validateEmail, validatePassword, errorResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validation
    validateRequired({ email, password }, ['email', 'password']);
    validateEmail(email);
    validatePassword(password);

    // Create Supabase client (use regular client for auth operations)
    const supabase = await createServerClient();

    // Sign up user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0],
        },
      },
    });

    if (error) {
      return ApiResponse.error(error.message, 400);
    }

    if (!data.user) {
      return ApiResponse.error('Failed to create user', 500);
    }

    return ApiResponse.success(
      {
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name,
        },
        session: data.session,
      },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
