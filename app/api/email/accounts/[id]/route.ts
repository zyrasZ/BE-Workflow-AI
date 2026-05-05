/**
 * Email Accounts API - Single Account Routes
 * 
 * Handles operations for individual email accounts
 * 
 * Routes:
 * - GET /api/email/accounts/[id] - Get single email account
 * - PATCH /api/email/accounts/[id] - Update email account
 * - DELETE /api/email/accounts/[id] - Delete email account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { encryptConfig, decryptConfig, redactSensitiveFields } from '@/lib/email-nodes/utils/encryption';
import { validateEmailAccountConnection } from '@/lib/email-nodes/utils/connection-validator';

/**
 * Email account configuration types
 */
interface EmailAccountConfig {
  username?: string;
  password?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

interface UpdateEmailAccountRequest {
  name?: string;
  email_address?: string;
  auth_type?: 'imap-smtp' | 'oauth2';
  config?: EmailAccountConfig;
  is_active?: boolean;
  last_sync_at?: string;
  last_error?: string;
  validate_connection?: boolean; // Optional flag to validate connection on update
}

/**
 * GET /api/email/accounts/[id]
 * Get single email account by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const accountId = params.id;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(accountId)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid account ID format' },
        { status: 400 }
      );
    }
    
    // Fetch account
    const { data: account, error: queryError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();
    
    if (queryError) {
      if (queryError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Not found', message: 'Email account not found' },
          { status: 404 }
        );
      }
      
      console.error('Error fetching email account:', queryError);
      return NextResponse.json(
        { error: 'Database error', message: queryError.message },
        { status: 500 }
      );
    }
    
    // Decrypt configuration
    try {
      const decryptedConfig = decryptConfig({
        encrypted: account.encrypted_config,
        iv: account.encryption_iv,
        authTag: account.encryption_auth_tag,
        algorithm: account.encryption_algorithm
      });
      
      // Redact sensitive fields
      const redactedConfig = redactSensitiveFields(decryptedConfig);
      
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
        }
      });
    } catch (decryptError) {
      console.error('Error decrypting account configuration:', decryptError);
      return NextResponse.json(
        { error: 'Decryption error', message: 'Failed to decrypt account configuration' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error in GET /api/email/accounts/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/email/accounts/[id]
 * Update email account
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const accountId = params.id;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(accountId)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid account ID format' },
        { status: 400 }
      );
    }
    
    // Parse request body
    const body: UpdateEmailAccountRequest = await request.json();
    
    // Validate at least one field to update
    if (!body.name && !body.email_address && !body.auth_type && !body.config && body.is_active === undefined && !body.last_sync_at && body.last_error === undefined) {
      return NextResponse.json(
        { error: 'Validation error', message: 'At least one field must be provided for update' },
        { status: 400 }
      );
    }
    
    // Validate email address format if provided
    if (body.email_address) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email_address)) {
        return NextResponse.json(
          { error: 'Validation error', message: 'Invalid email address format' },
          { status: 400 }
        );
      }
    }
    
    // Validate auth_type if provided
    if (body.auth_type) {
      const validAuthTypes = ['imap-smtp', 'oauth2'];
      if (!validAuthTypes.includes(body.auth_type)) {
        return NextResponse.json(
          { error: 'Validation error', message: `Invalid auth_type. Must be one of: ${validAuthTypes.join(', ')}` },
          { status: 400 }
        );
      }
    }
    
    // Validate connection if config is being updated and validation is requested
    const shouldValidate = body.config && body.validate_connection !== false;
    
    if (shouldValidate && body.config) {
      // Fetch current account to get auth_type
      const { data: currentAccount, error: fetchError } = await supabase
        .from('email_accounts')
        .select('auth_type')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single();
      
      if (fetchError) {
        console.error('Error fetching current account:', fetchError);
        return NextResponse.json(
          { error: 'Database error', message: 'Failed to fetch current account' },
          { status: 500 }
        );
      }
      
      const authType = body.auth_type || currentAccount.auth_type || 'imap-smtp';
      
      try {
        const validationResult = await validateEmailAccountConnection(
          authType,
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
        body.last_sync_at = new Date().toISOString();
        body.last_error = undefined; // Clear any previous errors
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
    
    // Build update object
    const updateData: any = {};
    
    if (body.name) updateData.name = body.name;
    if (body.email_address) updateData.email_address = body.email_address;
    if (body.auth_type) updateData.auth_type = body.auth_type;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.last_sync_at) updateData.last_sync_at = body.last_sync_at;
    if (body.last_error !== undefined) updateData.last_error = body.last_error;
    
    // Encrypt new configuration if provided
    if (body.config) {
      try {
        const encryptedData = encryptConfig(body.config);
        updateData.encrypted_config = encryptedData.encrypted;
        updateData.encryption_iv = encryptedData.iv;
        updateData.encryption_auth_tag = encryptedData.authTag;
        updateData.encryption_algorithm = encryptedData.algorithm;
      } catch (encryptError) {
        console.error('Error encrypting configuration:', encryptError);
        return NextResponse.json(
          { error: 'Encryption error', message: 'Failed to encrypt account configuration' },
          { status: 500 }
        );
      }
    }
    
    // Update account
    const { data: account, error: updateError } = await supabase
      .from('email_accounts')
      .update(updateData)
      .eq('id', accountId)
      .eq('user_id', user.id)
      .select()
      .single();
    
    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Not found', message: 'Email account not found' },
          { status: 404 }
        );
      }
      
      // Handle unique constraint violation
      if (updateError.code === '23505') {
        return NextResponse.json(
          { error: 'Conflict', message: 'An account with this email address and provider already exists' },
          { status: 409 }
        );
      }
      
      console.error('Error updating email account:', updateError);
      return NextResponse.json(
        { error: 'Database error', message: updateError.message },
        { status: 500 }
      );
    }
    
    // Decrypt and redact configuration for response
    try {
      const decryptedConfig = decryptConfig({
        encrypted: account.encrypted_config,
        iv: account.encryption_iv,
        authTag: account.encryption_auth_tag,
        algorithm: account.encryption_algorithm
      });
      
      const redactedConfig = redactSensitiveFields(decryptedConfig);
      
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
        message: 'Email account updated successfully'
      });
    } catch (decryptError) {
      console.error('Error decrypting updated account:', decryptError);
      return NextResponse.json(
        { error: 'Decryption error', message: 'Account updated but failed to decrypt configuration' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Error in PATCH /api/email/accounts/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email/accounts/[id]
 * Delete email account
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const accountId = params.id;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(accountId)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid account ID format' },
        { status: 400 }
      );
    }
    
    // Delete account
    const { error: deleteError } = await supabase
      .from('email_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id);
    
    if (deleteError) {
      console.error('Error deleting email account:', deleteError);
      return NextResponse.json(
        { error: 'Database error', message: deleteError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      message: 'Email account deleted successfully'
    });
    
  } catch (error) {
    console.error('Error in DELETE /api/email/accounts/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
