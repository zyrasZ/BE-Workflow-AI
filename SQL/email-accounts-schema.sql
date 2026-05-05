-- Email Accounts Database Schema
-- 
-- This migration adds the email_accounts table for centralized email account management
-- with encrypted credentials and connection tracking.
-- 
-- Requirements: 27 (Email Account Management)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Drop existing table if structure needs to be updated
-- ============================================================================
-- WARNING: This will delete all existing data. Comment out if you want to preserve data.
-- For production, use ALTER TABLE statements instead.

-- Uncomment the following line if you need to recreate the table:
DROP TABLE IF EXISTS email_accounts CASCADE;

-- ============================================================================
-- email_accounts: Centralized email account configurations
-- ============================================================================
-- 
-- Requirement 27.1: Provide APIs to create, read, update, and delete Email_Account configurations
-- Requirement 27.2: Store Email_Account credentials securely (encrypted at rest)
-- Requirement 27.3: Support IMAP, SMTP, and OAuth2 (Gmail) authentication methods
-- Requirement 27.5: Associate Email_Account configurations with user accounts
-- Requirement 27.7: Track last successful connection time for each Email_Account

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User ownership
  user_id UUID NOT NULL,
  
  -- Account identification
  name TEXT NOT NULL,
  email_address TEXT NOT NULL,
  
  -- Provider type
  -- 'imap': IMAP for reading
  -- 'pop3': POP3 for reading
  -- 'smtp': SMTP for sending
  -- 'gmail': Gmail with OAuth2
  -- 'outlook': Outlook with OAuth2
  provider TEXT NOT NULL CHECK (provider IN ('imap', 'pop3', 'smtp', 'gmail', 'outlook')),
  
  -- Authentication type
  -- 'imap-smtp': Traditional IMAP/SMTP with username/password
  -- 'oauth2': OAuth2 authentication (Gmail, Outlook)
  auth_type TEXT NOT NULL DEFAULT 'imap-smtp' CHECK (auth_type IN ('imap-smtp', 'oauth2')),
  
  -- Encrypted configuration
  -- Contains: username, password, host, port, secure (for IMAP/SMTP)
  -- Or: clientId, clientSecret, accessToken, refreshToken, expiresAt, scopes (for OAuth2)
  encrypted_config TEXT NOT NULL,
  
  -- Encryption metadata
  encryption_algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  encryption_iv TEXT NOT NULL,
  encryption_auth_tag TEXT NOT NULL,
  
  -- Account status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Connection tracking
  -- Requirement 27.7: Track last successful connection time
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one account per user per email address per provider
  UNIQUE(user_id, email_address, provider)
);

-- Add foreign key constraint separately (in case auth.users doesn't exist yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_accounts_user_id_fkey'
  ) THEN
    ALTER TABLE email_accounts 
    ADD CONSTRAINT email_accounts_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for email_accounts
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON email_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_email_accounts_auth_type ON email_accounts(auth_type);
CREATE INDEX IF NOT EXISTS idx_email_accounts_is_active ON email_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email_address);

-- ============================================================================
-- Update trigger for updated_at timestamps
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_email_accounts_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- 
-- Requirement 27.6: Prevent users from accessing Email_Account configurations owned by other users

-- Enable RLS on email_accounts
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own email accounts
CREATE POLICY email_accounts_select_policy ON email_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own email accounts
CREATE POLICY email_accounts_insert_policy ON email_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own email accounts
CREATE POLICY email_accounts_update_policy ON email_accounts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own email accounts
CREATE POLICY email_accounts_delete_policy ON email_accounts
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE email_accounts IS 'Centralized email account configurations with encrypted credentials';

COMMENT ON COLUMN email_accounts.user_id IS 'User who owns this email account';
COMMENT ON COLUMN email_accounts.name IS 'Friendly name for the email account';
COMMENT ON COLUMN email_accounts.email_address IS 'Email address associated with this account';
COMMENT ON COLUMN email_accounts.provider IS 'Email provider type: imap, pop3, smtp, gmail, outlook';
COMMENT ON COLUMN email_accounts.auth_type IS 'Authentication method: imap-smtp (password) or oauth2';
COMMENT ON COLUMN email_accounts.encrypted_config IS 'AES-256-GCM encrypted configuration (credentials, server settings)';
COMMENT ON COLUMN email_accounts.encryption_algorithm IS 'Encryption algorithm used (aes-256-gcm)';
COMMENT ON COLUMN email_accounts.encryption_iv IS 'Initialization vector for encryption';
COMMENT ON COLUMN email_accounts.encryption_auth_tag IS 'Authentication tag for GCM mode';
COMMENT ON COLUMN email_accounts.is_active IS 'Whether this account is currently active';
COMMENT ON COLUMN email_accounts.last_sync_at IS 'Timestamp of last successful connection';
COMMENT ON COLUMN email_accounts.last_error IS 'Last error message if connection failed';
