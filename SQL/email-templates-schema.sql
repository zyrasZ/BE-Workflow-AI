-- Email Templates Database Schema
-- 
-- This migration adds the email_templates table for centralized email template management
-- with variable extraction, syntax validation, and usage tracking.
-- 
-- Requirements: 28 (Template Management)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Drop existing table if structure needs to be updated
-- ============================================================================
-- WARNING: This will delete all existing data. Comment out if you want to preserve data.
-- For production, use ALTER TABLE statements instead.

-- Uncomment the following line if you need to recreate the table:
DROP TABLE IF EXISTS email_templates CASCADE;

-- ============================================================================
-- email_templates: Centralized email template definitions
-- ============================================================================
-- 
-- Requirement 28.1: Provide APIs to create, read, update, and delete Email_Template definitions
-- Requirement 28.2: Store template subject and body content
-- Requirement 28.3: Extract and store variable names from template content
-- Requirement 28.4: Support categorizing templates with tags
-- Requirement 28.5: Track template usage count and last used date
-- Requirement 28.6: Provide a template preview feature with sample data
-- Requirement 28.7: Validate template syntax when templates are saved
-- Requirement 28.8: Support both plain text and HTML template formats

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User ownership
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Template identification
  name TEXT NOT NULL,
  description TEXT,
  
  -- Template content
  -- Requirement 28.2: Store template subject and body content
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Template format
  -- Requirement 28.8: Support both plain text and HTML template formats
  -- 'text': Plain text format
  -- 'html': HTML format
  format TEXT NOT NULL DEFAULT 'text' CHECK (format IN ('text', 'html')),
  
  -- Variable extraction
  -- Requirement 28.3: Extract and store variable names from template content
  -- Array of variable names found in {{variableName}} syntax
  variables JSONB NOT NULL DEFAULT '[]',
  
  -- Categorization
  -- Requirement 28.4: Support categorizing templates with tags
  tags JSONB NOT NULL DEFAULT '[]',
  
  -- Usage tracking
  -- Requirement 28.5: Track template usage count and last used date
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Template status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one template name per user
  UNIQUE(user_id, name)
);

-- Create indexes for email_templates
CREATE INDEX IF NOT EXISTS idx_email_templates_user ON email_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_format ON email_templates(format);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_tags ON email_templates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_email_templates_usage_count ON email_templates(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_email_templates_last_used_at ON email_templates(last_used_at DESC);

-- ============================================================================
-- Update trigger for updated_at timestamps
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_email_templates_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- 
-- Requirement 28: Users should only access their own templates

-- Enable RLS on email_templates
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own email templates
CREATE POLICY email_templates_select_policy ON email_templates
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own email templates
CREATE POLICY email_templates_insert_policy ON email_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own email templates
CREATE POLICY email_templates_update_policy ON email_templates
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own email templates
CREATE POLICY email_templates_delete_policy ON email_templates
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE email_templates IS 'Centralized email template definitions with variable extraction and usage tracking';

COMMENT ON COLUMN email_templates.user_id IS 'User who owns this email template';
COMMENT ON COLUMN email_templates.name IS 'Friendly name for the email template';
COMMENT ON COLUMN email_templates.description IS 'Optional description of the template purpose';
COMMENT ON COLUMN email_templates.subject IS 'Email subject template with {{variable}} placeholders';
COMMENT ON COLUMN email_templates.body IS 'Email body template with {{variable}} placeholders';
COMMENT ON COLUMN email_templates.format IS 'Template format: text (plain text) or html (HTML)';
COMMENT ON COLUMN email_templates.variables IS 'Array of variable names extracted from template content';
COMMENT ON COLUMN email_templates.tags IS 'Array of tags for categorizing templates';
COMMENT ON COLUMN email_templates.usage_count IS 'Number of times this template has been used';
COMMENT ON COLUMN email_templates.last_used_at IS 'Timestamp of last template usage';
COMMENT ON COLUMN email_templates.is_active IS 'Whether this template is currently active';
