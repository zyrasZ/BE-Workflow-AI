/**
 * Email Account Validation API
 * 
 * POST /api/email/accounts/validate - Validate email account configuration
 * 
 * This endpoint tests email account connections without saving to database.
 * Useful for validating configurations before creating accounts.
 * 
 * Requirements: 27.4 - Validate Email_Account configurations by testing connections
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { validateEmailAccountConnection } from '@/lib/email-nodes/utils/connection-validator';

/**
 * Email account configuration types
 */
interface EmailAccountConfig {
  // Common fields
  username?: string;
  password?: string;
  
  // IMAP/SMTP specific
  host?: string;
  port?: number;
  secure?: boolean;
  
  // OAuth2 specific (Gmail, Outlook)
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

interface ValidateEmailAccountRequest {
  auth_type: 'imap-smtp' | 'oauth2';
  config: EmailAccountConfig;
}

/**
 * POST /api/email/accounts/validate
 * Validate email account configuration by testing connection
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Parse request body
    const body: ValidateEmailAccountRequest = await request.json();
    
    // Validate required fields
    if (!body.auth_type || !body.config) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Missing required fields: auth_type, config' },
        { status: 400 }
      );
    }
    
    // Validate auth_type
    const validAuthTypes = ['imap-smtp', 'oauth2'];
    if (!validAuthTypes.includes(body.auth_type)) {
      return NextResponse.json(
        { error: 'Validation error', message: `Invalid auth_type. Must be one of: ${validAuthTypes.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validate connection
    const validationResult = await validateEmailAccountConnection(
      body.auth_type,
      body.config
    );
    
    // Return validation result
    if (validationResult.success) {
      return NextResponse.json({
        valid: true,
        message: validationResult.message,
        provider: validationResult.provider,
        timestamp: validationResult.timestamp,
      });
    } else {
      return NextResponse.json({
        valid: false,
        message: validationResult.message,
        provider: validationResult.provider,
        error: validationResult.error,
        timestamp: validationResult.timestamp,
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Error in POST /api/email/accounts/validate:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
