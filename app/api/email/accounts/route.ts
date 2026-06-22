/**
 * Email Accounts API - Collection Routes
 * 
 * Handles CRUD operations for email accounts with encrypted credentials
 * 
 * Routes:
 * - GET /api/email/accounts - List all email accounts for authenticated user
 * - POST /api/email/accounts - Create new email account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { encryptConfig, decryptConfig, redactSensitiveFields } from '@/lib/email-nodes/utils/encryption';
import { validateEmailAccountConnection } from '@/lib/email-nodes/utils/connection-validator';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Email account configuration types
 */
interface EmailAccountConfig {
  // Common fields
  username?: string;
  password?: string;
  
  // IMAP/POP3/SMTP specific
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

interface CreateEmailAccountRequest {
  name: string;
  email_address: string;
  provider: 'imap' | 'pop3' | 'gmail' | 'outlook' | 'smtp';
  auth_type: 'imap-smtp' | 'oauth2';
  config: EmailAccountConfig;
  validate_connection?: boolean; // Optional flag to validate connection on creation
}

interface EmailAccountResponse {
  id: string;
  user_id: string;
  name: string;
  email_address: string;
  provider: string;
  config: EmailAccountConfig; // Decrypted config (with sensitive fields redacted for GET)
  is_active: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/email/accounts
 * List all email accounts for authenticated user
 */
export async function GET(request: NextRequest) {
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
    
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const is_active = searchParams.get('is_active');
    
    // Build query
    let query = supabase
      .from('email_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (provider) {
      query = query.eq('provider', provider);
    }
    
    if (is_active !== null) {
      query = query.eq('is_active', is_active === 'true');
    }
    
    // Execute query
    const { data: accounts, error: queryError } = await query;
    
    if (queryError) {
      console.error('Error fetching email accounts:', queryError);
      return NextResponse.json(
        { error: 'Database error', message: queryError.message },
        { status: 500 }
      );
    }
    
    // Decrypt and redact sensitive fields
    const accountsWithConfig = accounts.map(account => {
      try {
        const decryptedConfig = decryptConfig({
          encrypted: account.encrypted_config,
          iv: account.encryption_iv,
          authTag: account.encryption_auth_tag,
          algorithm: account.encryption_algorithm
        });
        
        // Redact sensitive fields for security
        const redactedConfig = redactSensitiveFields(decryptedConfig);
        
        return {
          id: account.id,
          user_id: account.user_id,
          name: account.name,
          email_address: account.email_address,
          provider: account.provider,
          config: redactedConfig,
          is_active: account.is_active,
          last_sync_at: account.last_sync_at,
          last_error: account.last_error,
          created_at: account.created_at,
          updated_at: account.updated_at
        };
      } catch (decryptError) {
        console.error(`Error decrypting account ${account.id}:`, decryptError);
        // Return account without config if decryption fails
        return {
          id: account.id,
          user_id: account.user_id,
          name: account.name,
          email_address: account.email_address,
          provider: account.provider,
          config: { error: 'Failed to decrypt configuration' },
          is_active: account.is_active,
          last_sync_at: account.last_sync_at,
          last_error: account.last_error,
          created_at: account.created_at,
          updated_at: account.updated_at
        };
      }
    });
    
    return NextResponse.json({
      accounts: accountsWithConfig,
      count: accountsWithConfig.length
    });
    
  } catch (error) {
    console.error('Error in GET /api/email/accounts:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/email/accounts
 * Create new email account with encrypted credentials
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
    const body: CreateEmailAccountRequest = await request.json();
    
    // Validate required fields
    if (!body.name || !body.email_address || !body.provider || !body.auth_type || !body.config) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Missing required fields: name, email_address, provider, auth_type, config' },
        { status: 400 }
      );
    }
    
    // Validate provider
    const validProviders = ['imap', 'pop3', 'gmail', 'outlook', 'smtp'];
    if (!validProviders.includes(body.provider)) {
      return NextResponse.json(
        { error: 'Validation error', message: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
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
    
    // Validate email address format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email_address)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid email address format' },
        { status: 400 }
      );
    }
    
    // Validate connection if requested (default: true)
    const shouldValidate = body.validate_connection !== false;
    let lastSyncAt = null;
    
    if (shouldValidate) {
      try {
        const validationResult = await validateEmailAccountConnection(
          body.auth_type,
          body.config
        );
        
        if (!validationResult.success) {
          return NextResponse.json(
            { 
              error: 'Connection validation failed', 
              message: validationResult.message,
              details: validationResult.error 
            },
            { status: 400 }
          );
        }
        
        // Set last_sync_at to current time on successful validation
        lastSyncAt = new Date().toISOString();
      } catch (validationError) {
        console.error('Error validating connection:', validationError);
        return NextResponse.json(
          { 
            error: 'Connection validation error', 
            message: 'Failed to validate email account connection',
            details: validationError instanceof Error ? validationError.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
    }
    
    // Encrypt configuration
    let encryptedData;
    try {
      encryptedData = encryptConfig(body.config);
    } catch (encryptError) {
      console.error('Error encrypting configuration:', encryptError);
      return NextResponse.json(
        { error: 'Encryption error', message: 'Failed to encrypt account configuration' },
        { status: 500 }
      );
    }
    
    // Insert into database
    const { data: account, error: insertError } = await supabase
      .from('email_accounts')
      .insert({
        user_id: user.id,
        name: body.name,
        email_address: body.email_address,
        provider: body.provider,
        auth_type: body.auth_type,
        encrypted_config: encryptedData.encrypted,
        encryption_iv: encryptedData.iv,
        encryption_auth_tag: encryptedData.authTag,
        encryption_algorithm: encryptedData.algorithm,
        is_active: true,
        last_sync_at: lastSyncAt,
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error inserting email account:', insertError);
      
      // Handle unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'Conflict', message: 'An account with this email address and provider already exists' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: 'Database error', message: insertError.message },
        { status: 500 }
      );
    }
    
    // Return created account with redacted config
    const redactedConfig = redactSensitiveFields(body.config);
    
    return NextResponse.json({
      account: {
        id: account.id,
        user_id: account.user_id,
        name: account.name,
        email_address: account.email_address,
        provider: account.provider,
        config: redactedConfig,
        is_active: account.is_active,
        last_sync_at: account.last_sync_at,
        last_error: account.last_error,
        created_at: account.created_at,
        updated_at: account.updated_at
      },
      message: 'Email account created successfully'
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error in POST /api/email/accounts:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
