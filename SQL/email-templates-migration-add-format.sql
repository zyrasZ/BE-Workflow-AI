-- Migration: Add format column to existing email_templates table
-- This is a safe migration that preserves existing data

-- Add format column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'format'
  ) THEN
    ALTER TABLE email_templates 
    ADD COLUMN format TEXT NOT NULL DEFAULT 'text' 
    CHECK (format IN ('text', 'html'));
    
    RAISE NOTICE 'Added format column to email_templates table';
  ELSE
    RAISE NOTICE 'format column already exists';
  END IF;
END $$;

-- Create index for format if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_email_templates_format ON email_templates(format);

COMMENT ON COLUMN email_templates.format IS 'Template format: text (plain text) or html (HTML)';
