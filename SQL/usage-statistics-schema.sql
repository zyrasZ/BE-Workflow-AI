-- Usage Statistics Database Schema
-- 
-- This migration adds the usage_statistics table for persistent historical tracking:
-- - Stores aggregated usage data per user per time period
-- - Preserves historical data even after rate limit windows expire
-- - Enables usage analytics and reporting
-- 
-- Requirement 30: System SHALL track usage statistics per user (API calls, emails sent, executions)
-- Requirement 30: System SHALL reset rate limit counters at appropriate intervals

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- usage_statistics: Persistent historical usage tracking
-- ============================================================================
-- 
-- Requirement 30: System SHALL track usage statistics per user

CREATE TABLE IF NOT EXISTS usage_statistics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User ID (references auth.users in Supabase)
  user_id UUID NOT NULL,
  
  -- Resource type being tracked
  -- 'ai-api': AI API calls
  -- 'email-send': Email sending
  -- 'workflow-execution': Workflow executions
  resource_type TEXT NOT NULL CHECK (resource_type IN ('ai-api', 'email-send', 'workflow-execution')),
  
  -- Time period for this statistic
  -- 'minute': Per-minute aggregation
  -- 'hour': Per-hour aggregation
  -- 'day': Per-day aggregation
  period_type TEXT NOT NULL CHECK (period_type IN ('minute', 'hour', 'day')),
  
  -- Start of the time period
  period_start TIMESTAMPTZ NOT NULL,
  
  -- End of the time period
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Number of requests made in this period
  request_count INTEGER NOT NULL DEFAULT 0,
  
  -- Maximum requests allowed in this period
  max_requests INTEGER NOT NULL,
  
  -- Peak requests in a single window (for sub-period tracking)
  peak_requests INTEGER,
  
  -- Average requests per window in this period
  average_requests NUMERIC(10, 2),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for usage_statistics
-- Composite index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_resource_period 
  ON usage_statistics(user_id, resource_type, period_start DESC);

-- Index for period queries
CREATE INDEX IF NOT EXISTS idx_usage_stats_period_start 
  ON usage_statistics(period_start DESC);

-- Index for resource type queries
CREATE INDEX IF NOT EXISTS idx_usage_stats_resource_type 
  ON usage_statistics(resource_type);

-- Index for period type queries
CREATE INDEX IF NOT EXISTS idx_usage_stats_period_type 
  ON usage_statistics(period_type);

-- Unique constraint to prevent duplicate statistics for same period
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_stats_unique_period
  ON usage_statistics(user_id, resource_type, period_type, period_start);

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

CREATE TRIGGER update_usage_statistics_updated_at
  BEFORE UPDATE ON usage_statistics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Function to aggregate and archive rate limit data
-- ============================================================================
-- 
-- Requirement 30: System SHALL reset rate limit counters at appropriate intervals

-- Function to archive rate limit data to usage_statistics before cleanup
CREATE OR REPLACE FUNCTION archive_rate_limit_data()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER := 0;
  rate_limit_record RECORD;
  period_type TEXT;
  period_start_ts TIMESTAMPTZ;
  period_end_ts TIMESTAMPTZ;
BEGIN
  -- Archive expired rate limit records to usage_statistics
  FOR rate_limit_record IN
    SELECT 
      user_id,
      resource_type,
      window_start,
      window_start + (window_seconds || ' seconds')::INTERVAL AS window_end,
      request_count,
      max_requests,
      window_seconds
    FROM rate_limits
    WHERE window_start + (window_seconds || ' seconds')::INTERVAL < NOW()
  LOOP
    -- Determine period type based on window_seconds
    IF rate_limit_record.window_seconds = 60 THEN
      period_type := 'minute';
      period_start_ts := date_trunc('minute', rate_limit_record.window_start);
      period_end_ts := period_start_ts + INTERVAL '1 minute';
    ELSIF rate_limit_record.window_seconds = 3600 THEN
      period_type := 'hour';
      period_start_ts := date_trunc('hour', rate_limit_record.window_start);
      period_end_ts := period_start_ts + INTERVAL '1 hour';
    ELSIF rate_limit_record.window_seconds = 86400 THEN
      period_type := 'day';
      period_start_ts := date_trunc('day', rate_limit_record.window_start);
      period_end_ts := period_start_ts + INTERVAL '1 day';
    ELSE
      -- Skip unknown window sizes
      CONTINUE;
    END IF;

    -- Insert or update usage statistics
    INSERT INTO usage_statistics (
      user_id,
      resource_type,
      period_type,
      period_start,
      period_end,
      request_count,
      max_requests,
      peak_requests,
      average_requests
    ) VALUES (
      rate_limit_record.user_id,
      rate_limit_record.resource_type,
      period_type,
      period_start_ts,
      period_end_ts,
      rate_limit_record.request_count,
      rate_limit_record.max_requests,
      rate_limit_record.request_count,
      rate_limit_record.request_count
    )
    ON CONFLICT (user_id, resource_type, period_type, period_start)
    DO UPDATE SET
      request_count = usage_statistics.request_count + EXCLUDED.request_count,
      peak_requests = GREATEST(usage_statistics.peak_requests, EXCLUDED.peak_requests),
      average_requests = (usage_statistics.request_count + EXCLUDED.request_count) / 2.0,
      updated_at = NOW();

    archived_count := archived_count + 1;
  END LOOP;

  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to cleanup old usage statistics
-- ============================================================================

-- Function to cleanup old usage statistics (older than retention period)
CREATE OR REPLACE FUNCTION cleanup_old_usage_statistics(
  retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete statistics older than retention period
  WITH deleted AS (
    DELETE FROM usage_statistics
    WHERE period_start < NOW() - (retention_days || ' days')::INTERVAL
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to get usage statistics for a user
-- ============================================================================

-- Function to get usage statistics for a specific period
CREATE OR REPLACE FUNCTION get_usage_statistics(
  p_user_id UUID,
  p_resource_type TEXT DEFAULT NULL,
  p_period_type TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  resource_type TEXT,
  period_type TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  request_count INTEGER,
  max_requests INTEGER,
  peak_requests INTEGER,
  average_requests NUMERIC,
  utilization_percent NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.resource_type,
    us.period_type,
    us.period_start,
    us.period_end,
    us.request_count,
    us.max_requests,
    us.peak_requests,
    us.average_requests,
    CASE 
      WHEN us.max_requests > 0 THEN 
        ROUND((us.request_count::NUMERIC / us.max_requests::NUMERIC) * 100, 2)
      ELSE 0
    END AS utilization_percent
  FROM usage_statistics us
  WHERE us.user_id = p_user_id
    AND (p_resource_type IS NULL OR us.resource_type = p_resource_type)
    AND (p_period_type IS NULL OR us.period_type = p_period_type)
    AND (p_start_date IS NULL OR us.period_start >= p_start_date)
    AND (p_end_date IS NULL OR us.period_start <= p_end_date)
  ORDER BY us.period_start DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to get aggregated usage summary
-- ============================================================================

-- Function to get aggregated usage summary for a user
CREATE OR REPLACE FUNCTION get_usage_summary(
  p_user_id UUID,
  p_resource_type TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  resource_type TEXT,
  total_requests BIGINT,
  average_requests NUMERIC,
  peak_requests INTEGER,
  total_periods INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.resource_type,
    SUM(us.request_count)::BIGINT AS total_requests,
    ROUND(AVG(us.request_count), 2) AS average_requests,
    MAX(us.peak_requests) AS peak_requests,
    COUNT(*)::INTEGER AS total_periods
  FROM usage_statistics us
  WHERE us.user_id = p_user_id
    AND (p_resource_type IS NULL OR us.resource_type = p_resource_type)
    AND us.period_start >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY us.resource_type
  ORDER BY us.resource_type;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE usage_statistics IS 'Persistent historical usage statistics per user per time period';

COMMENT ON COLUMN usage_statistics.user_id IS 'User ID from auth.users';
COMMENT ON COLUMN usage_statistics.resource_type IS 'Type of resource being tracked: ai-api, email-send, or workflow-execution';
COMMENT ON COLUMN usage_statistics.period_type IS 'Time period granularity: minute, hour, or day';
COMMENT ON COLUMN usage_statistics.period_start IS 'Start timestamp of the time period';
COMMENT ON COLUMN usage_statistics.period_end IS 'End timestamp of the time period';
COMMENT ON COLUMN usage_statistics.request_count IS 'Total number of requests made in this period';
COMMENT ON COLUMN usage_statistics.max_requests IS 'Maximum number of requests allowed in this period';
COMMENT ON COLUMN usage_statistics.peak_requests IS 'Peak requests in a single window within this period';
COMMENT ON COLUMN usage_statistics.average_requests IS 'Average requests per window in this period';

COMMENT ON FUNCTION archive_rate_limit_data() IS 'Archives expired rate limit data to usage_statistics before cleanup';
COMMENT ON FUNCTION cleanup_old_usage_statistics(INTEGER) IS 'Removes usage statistics older than retention period (default 90 days)';
COMMENT ON FUNCTION get_usage_statistics(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) IS 'Gets usage statistics for a user with optional filters';
COMMENT ON FUNCTION get_usage_summary(UUID, TEXT, INTEGER) IS 'Gets aggregated usage summary for a user over specified days';

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
-- 
-- Enable RLS to ensure users can only access their own usage statistics

ALTER TABLE usage_statistics ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own usage statistics
CREATE POLICY usage_statistics_select_own
  ON usage_statistics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for backend operations)
CREATE POLICY usage_statistics_service_all
  ON usage_statistics
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Initial data / configuration
-- ============================================================================

-- No initial data needed - records are created dynamically as usage is tracked

