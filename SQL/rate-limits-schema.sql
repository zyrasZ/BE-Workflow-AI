-- Rate Limiting Database Schema
-- 
-- This migration adds the rate_limits table for tracking API usage:
-- - Enforces AI API call limits (20 requests per minute per user)
-- - Enforces email sending limits (configurable, default 100 emails per hour per user)
-- - Enforces workflow execution limits (configurable, default 1000 executions per day per user)
-- 
-- Requirement 30: Rate Limiting and Quotas

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- rate_limits: Track usage per user per time window
-- ============================================================================
-- 
-- Requirement 30: System SHALL enforce rate limits on AI API calls, email sending, and workflow executions
-- Requirement 30: System SHALL track usage per user per time window

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User ID (references auth.users in Supabase)
  user_id UUID NOT NULL,
  
  -- Resource type being rate limited
  -- 'ai-api': AI API calls (20 per minute)
  -- 'email-send': Email sending (100 per hour, configurable)
  -- 'workflow-execution': Workflow executions (1000 per day, configurable)
  resource_type TEXT NOT NULL CHECK (resource_type IN ('ai-api', 'email-send', 'workflow-execution')),
  
  -- Start of the current time window
  window_start TIMESTAMPTZ NOT NULL,
  
  -- Number of requests made in this window
  request_count INTEGER NOT NULL DEFAULT 0,
  
  -- Window duration in seconds
  -- 60 for minute, 3600 for hour, 86400 for day
  window_seconds INTEGER NOT NULL,
  
  -- Maximum requests allowed in this window
  max_requests INTEGER NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for rate_limits
-- Composite index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_resource_window 
  ON rate_limits(user_id, resource_type, window_start DESC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start 
  ON rate_limits(window_start);

-- Index for resource type queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_resource_type 
  ON rate_limits(resource_type);

-- ============================================================================
-- Update trigger for updated_at timestamp
-- ============================================================================

-- Create trigger for updated_at (reuse existing function if available)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Cleanup function for old rate limit records
-- ============================================================================
-- 
-- Requirement 30: System SHALL reset rate limit counters at the appropriate intervals

-- Function to cleanup expired rate limit records
-- This should be called periodically (e.g., via cron job or scheduled task)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete records where window_start + window_seconds < NOW()
  WITH deleted AS (
    DELETE FROM rate_limits
    WHERE window_start + (window_seconds || ' seconds')::INTERVAL < NOW()
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Helper function to get current usage for a user
-- ============================================================================

-- Function to get current usage for a specific resource type
CREATE OR REPLACE FUNCTION get_current_usage(
  p_user_id UUID,
  p_resource_type TEXT
)
RETURNS TABLE (
  current_count INTEGER,
  max_allowed INTEGER,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rl.request_count,
    rl.max_requests,
    rl.window_start,
    rl.window_start + (rl.window_seconds || ' seconds')::INTERVAL AS window_end,
    GREATEST(0, rl.max_requests - rl.request_count) AS remaining
  FROM rate_limits rl
  WHERE rl.user_id = p_user_id
    AND rl.resource_type = p_resource_type
    AND rl.window_start + (rl.window_seconds || ' seconds')::INTERVAL > NOW()
  ORDER BY rl.window_start DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE rate_limits IS 'Rate limiting records tracking usage per user per time window';

COMMENT ON COLUMN rate_limits.user_id IS 'User ID from auth.users';
COMMENT ON COLUMN rate_limits.resource_type IS 'Type of resource being rate limited: ai-api, email-send, or workflow-execution';
COMMENT ON COLUMN rate_limits.window_start IS 'Start timestamp of the current rate limit window';
COMMENT ON COLUMN rate_limits.request_count IS 'Number of requests made in the current window';
COMMENT ON COLUMN rate_limits.window_seconds IS 'Duration of the rate limit window in seconds (60=minute, 3600=hour, 86400=day)';
COMMENT ON COLUMN rate_limits.max_requests IS 'Maximum number of requests allowed in this window';

COMMENT ON FUNCTION cleanup_expired_rate_limits() IS 'Removes expired rate limit records. Returns count of deleted records. Should be called periodically.';
COMMENT ON FUNCTION get_current_usage(UUID, TEXT) IS 'Gets current usage information for a user and resource type';

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- 
-- Enable RLS to ensure users can only access their own rate limit data

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own rate limits
CREATE POLICY rate_limits_select_own
  ON rate_limits
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for backend operations)
CREATE POLICY rate_limits_service_all
  ON rate_limits
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Initial data / configuration
-- ============================================================================

-- No initial data needed - records are created dynamically as users make requests
