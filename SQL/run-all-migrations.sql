-- ============================================================================
-- Run All Migrations Script
-- ============================================================================
-- This script safely adds missing columns to existing tables
-- Run this BEFORE running the full schema files

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Migration 1: Add auth_type to email_accounts
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_accounts' AND column_name = 'auth_type'
  ) THEN
    ALTER TABLE email_accounts 
    ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'imap-smtp' 
    CHECK (auth_type IN ('imap-smtp', 'oauth2'));
    
    RAISE NOTICE '✓ Added auth_type column to email_accounts table';
  ELSE
    RAISE NOTICE '✓ auth_type column already exists in email_accounts';
  END IF;
END $$;

-- Create index for auth_type if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_email_accounts_auth_type ON email_accounts(auth_type);

-- ============================================================================
-- Migration 2: Add format to email_templates
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'format'
  ) THEN
    ALTER TABLE email_templates 
    ADD COLUMN format TEXT NOT NULL DEFAULT 'text' 
    CHECK (format IN ('text', 'html'));
    
    RAISE NOTICE '✓ Added format column to email_templates table';
  ELSE
    RAISE NOTICE '✓ format column already exists in email_templates';
  END IF;
END $$;

-- Create index for format if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_email_templates_format ON email_templates(format);

-- ============================================================================
-- Add comments
-- ============================================================================

COMMENT ON COLUMN email_accounts.auth_type IS 'Authentication method: imap-smtp (password) or oauth2';
COMMENT ON COLUMN email_templates.format IS 'Template format: text (plain text) or html (HTML)';

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All migrations completed successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;
