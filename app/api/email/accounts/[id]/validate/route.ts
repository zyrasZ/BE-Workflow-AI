/**
 * Email Account Validation API - Single Account
 * 
 * POST /api/email/accounts/[id]/validate - Test connection for existing email account
 * 
 * This endpoint tests the connection for an existing email account and updates
 * the last_sync_at timestamp on success.
 * 
 * Requirements: 27.4 - Validate Email_Account configurations by testing connections
 * Requirements: 27.7 - Track last successful connection time for each Email_Account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { decryptConfig } from '@/lib/email-nodes/utils/encryption';
import { validateEmailAccountConnection } from '@/lib/email-nodes/utils/connection-validator';

/**
 * POST /api/email/accounts/[id]/validate
 * Test connection for existing email account
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const accountId = (await params).id;
    // Get authenticated user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
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
    let decryptedConfig;
    try {
      decryptedConfig = decryptConfig({
        encrypted: account.encrypted_config,
        iv: account.encryption_iv,
        authTag: account.encryption_auth_tag,
        algorithm: account.encryption_algorithm
      });
    } catch (decryptError) {
      console.error('Error decrypting account configuration:', decryptError);
      return NextResponse.json(
        { error: 'Decryption error', message: 'Failed to decrypt account configuration' },
        { status: 500 }
      );
    }
    
    // Validate connection
    const authType = account.auth_type || 'imap-smtp'; // Default to imap-smtp for backward compatibility
    const validationResult = await validateEmailAccountConnection(
      authType,
      decryptedConfig
    );
    
    // Update last_sync_at on successful validation
    if (validationResult.success) {
      const { error: updateError } = await supabase
        .from('email_accounts')
        .update({
          last_sync_at: new Date().toISOString(),
          last_error: null, // Clear any previous errors
        })
        .eq('id', accountId)
        .eq('user_id', user.id);
      
      if (updateError) {
        console.error('Error updating last_sync_at:', updateError);
        // Don't fail the request, just log the error
      }
    } else {
      // Update last_error on failed validation
      const { error: updateError } = await supabase
        .from('email_accounts')
        .update({
          last_error: validationResult.error || validationResult.message,
        })
        .eq('id', accountId)
        .eq('user_id', user.id);
      
      if (updateError) {
        console.error('Error updating last_error:', updateError);
        // Don't fail the request, just log the error
      }
    }
    
    // Return validation result
    if (validationResult.success) {
      return NextResponse.json({
        valid: true,
        message: validationResult.message,
        provider: validationResult.provider,
        timestamp: validationResult.timestamp,
        account: {
          id: account.id,
          name: account.name,
          email_address: account.email_address,
          last_sync_at: new Date().toISOString(),
        },
      });
    } else {
      return NextResponse.json({
        valid: false,
        message: validationResult.message,
        provider: validationResult.provider,
        error: validationResult.error,
        timestamp: validationResult.timestamp,
        account: {
          id: account.id,
          name: account.name,
          email_address: account.email_address,
        },
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Error in POST /api/email/accounts/[id]/validate:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
