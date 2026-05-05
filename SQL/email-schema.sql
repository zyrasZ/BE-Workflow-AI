-- Email Processing Nodes - Database Schema Migration
-- This migration creates tables for email accounts, templates, and logs with RLS policies

-- ============================================================================
-- Table: email_accounts
-- Stores email account configurations with encrypted credentials
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Account identification
  name VARCHAR(255) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('imap', 'pop3', 'gmail', 'outlook', 'smtp')),
  
  -- Encrypted configuration (JSON containing credentials and settings)
  -- This field stores encrypted JSON with provider-specific config
  encrypted_config TEXT NOT NULL,
  
  -- Encryption metadata
  encryption_algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
  encryption_iv TEXT NOT NULL, -- Initialization vector for decryption
  encryption_auth_tag TEXT NOT NULL, -- Authentication tag for GCM mode
  
  -- Account status
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, email_address, provider)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON email_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_email_accounts_is_active ON email_accounts(is_active);

-- ============================================================================
-- Table: email_templates
-- Stores email templates for sending emails
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Template identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Template content
  subject VARCHAR(500) NOT NULL,
  body_text TEXT, -- Plain text version
  body_html TEXT, -- HTML version
  body_type VARCHAR(20) NOT NULL DEFAULT 'both' CHECK (body_type IN ('text', 'html', 'both')),
  
  -- Template variables (JSON array of variable names used in template)
  variables JSONB DEFAULT '[]'::jsonb,
  
  -- Template metadata
  category VARCHAR(100), -- e.g., 'customer_support', 'marketing', 'notification'
  tags TEXT[], -- Array of tags for organization
  
  -- Usage tracking
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, name)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_tags ON email_templates USING GIN(tags);

-- ============================================================================
-- Table: email_logs
-- Stores logs of email operations (send, receive, errors)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  
  -- Operation details
  operation VARCHAR(50) NOT NULL CHECK (operation IN ('send', 'receive', 'parse', 'filter', 'error')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failure', 'pending', 'retrying')),
  
  -- Email details
  email_from VARCHAR(255),
  email_to TEXT[], -- Array of recipient addresses
  email_subject VARCHAR(500),
  message_id VARCHAR(255), -- Provider message ID
  thread_id VARCHAR(255), -- Provider thread ID
  
  -- Operation metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional operation-specific data
  
  -- Error information
  error_code VARCHAR(100),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  
  -- Performance metrics
  processing_time_ms INTEGER, -- Time taken to process in milliseconds
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CHECK (retry_count >= 0)
);

-- Indexes for faster lookups and analytics
CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_account_id ON email_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_template_id ON email_logs(template_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_operation ON email_logs(operation);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_message_id ON email_logs(message_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies for email_accounts
-- ============================================================================

-- Policy: Users can view their own email accounts
CREATE POLICY "Users can view own email accounts"
  ON email_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own email accounts
CREATE POLICY "Users can insert own email accounts"
  ON email_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own email accounts
CREATE POLICY "Users can update own email accounts"
  ON email_accounts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own email accounts
CREATE POLICY "Users can delete own email accounts"
  ON email_accounts
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies for email_templates
-- ============================================================================

-- Policy: Users can view their own email templates
CREATE POLICY "Users can view own email templates"
  ON email_templates
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own email templates
CREATE POLICY "Users can insert own email templates"
  ON email_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own email templates
CREATE POLICY "Users can update own email templates"
  ON email_templates
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own email templates
CREATE POLICY "Users can delete own email templates"
  ON email_templates
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- RLS Policies for email_logs
-- ============================================================================

-- Policy: Users can view their own email logs
CREATE POLICY "Users can view own email logs"
  ON email_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own email logs
CREATE POLICY "Users can insert own email logs"
  ON email_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users cannot update email logs (immutable audit trail)
-- No UPDATE policy - logs should be immutable

-- Policy: Users can delete their own email logs (for data retention compliance)
CREATE POLICY "Users can delete own email logs"
  ON email_logs
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update updated_at on email_accounts
CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update updated_at on email_templates
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE email_accounts IS 'Stores email account configurations with encrypted credentials for IMAP, POP3, Gmail, Outlook, and SMTP';
COMMENT ON TABLE email_templates IS 'Stores reusable email templates with variable substitution support';
COMMENT ON TABLE email_logs IS 'Audit trail for all email operations including sends, receives, and errors';

COMMENT ON COLUMN email_accounts.encrypted_config IS 'Encrypted JSON containing provider-specific credentials and configuration';
COMMENT ON COLUMN email_accounts.encryption_iv IS 'Initialization vector used for AES-256-GCM encryption';
COMMENT ON COLUMN email_accounts.encryption_auth_tag IS 'Authentication tag for verifying encrypted data integrity';

COMMENT ON COLUMN email_templates.variables IS 'JSON array of variable names used in the template (e.g., ["user_name", "order_id"])';
COMMENT ON COLUMN email_templates.body_type IS 'Specifies whether template has text, html, or both versions';

COMMENT ON COLUMN email_logs.metadata IS 'Additional operation-specific data stored as JSON';
COMMENT ON COLUMN email_logs.processing_time_ms IS 'Time taken to process the operation in milliseconds';
