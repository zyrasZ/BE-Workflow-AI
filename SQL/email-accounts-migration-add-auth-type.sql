-- Migration: Add auth_type column to existing email_accounts table
-- This is a safe migration that preserves existing data

-- Add auth_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_accounts' AND column_name = 'auth_type'
  ) THEN
    ALTER TABLE email_accounts 
    ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'imap-smtp' 
    CHECK (auth_type IN ('imap-smtp', 'oauth2'));
    
    RAISE NOTICE 'Added auth_type column to email_accounts table';
  ELSE
    RAISE NOTICE 'auth_type column already exists';
  END IF;
END $$;

-- Create index for auth_type if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_email_accounts_auth_type ON email_accounts(auth_type);

COMMENT ON COLUMN email_accounts.auth_type IS 'Authentication method: imap-smtp (password) or oauth2';
