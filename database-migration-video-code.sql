-- ============================================================================
-- VIDEO CODE CACHE TABLE MIGRATION
-- ============================================================================
-- Purpose: Add short code system for easy video streaming access
-- Version: 1.8.0
-- Date: 2026-02-03
-- ============================================================================

-- Step 1: Create video_code_cache table
-- Purpose: Map short 6-character codes to video source data
-- TTL: 24 hours (auto-cleanup)
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_code_cache (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(6) NOT NULL UNIQUE,
  source_data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Step 2: Create indexes for performance
-- ============================================================================

-- Fast code lookup (primary use case)
CREATE INDEX IF NOT EXISTS idx_video_code_cache_code 
  ON video_code_cache(code);

-- Automatic cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_video_code_cache_expires_at 
  ON video_code_cache(expires_at);

-- ============================================================================
-- Step 3: Add table and column comments for documentation
-- ============================================================================

COMMENT ON TABLE video_code_cache IS 
  'Temporary cache for video short codes with 24 hour TTL';

COMMENT ON COLUMN video_code_cache.code IS 
  'Short 6-character alphanumeric code (e.g., bexi68)';

COMMENT ON COLUMN video_code_cache.source_data IS 
  'Full StreamingLink object with provider, url, url_video, resolution, server';

COMMENT ON COLUMN video_code_cache.expires_at IS 
  'Cache expiration timestamp (24 hours from creation)';

-- ============================================================================
-- Step 4: Update cleanup function to include video_code_cache
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_anime INTEGER;
  deleted_streaming INTEGER;
  deleted_video_code INTEGER;
  total_deleted INTEGER;
BEGIN
  -- Clean up expired anime cache
  DELETE FROM anime_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_anime = ROW_COUNT;
  
  -- Clean up expired streaming cache
  DELETE FROM streaming_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_streaming = ROW_COUNT;
  
  -- Clean up expired video codes
  DELETE FROM video_code_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_video_code = ROW_COUNT;
  
  total_deleted := deleted_anime + deleted_streaming + deleted_video_code;
  
  RAISE NOTICE 'Cleanup completed: % anime, % streaming, % video codes (total: %)', 
    deleted_anime, deleted_streaming, deleted_video_code, total_deleted;
  
  RETURN total_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_cache IS 
  'Automatically removes expired entries from all cache tables';

-- ============================================================================
-- Step 5: Optional - Enable Row Level Security (RLS)
-- ============================================================================
-- Uncomment the following lines if you want to enable RLS for production:

-- ALTER TABLE video_code_cache ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Allow read access to all users" 
--   ON video_code_cache FOR SELECT 
--   USING (true);

-- CREATE POLICY "Allow insert for authenticated users" 
--   ON video_code_cache FOR INSERT 
--   WITH CHECK (true);

-- ============================================================================
-- Step 6: Verify migration
-- ============================================================================

-- Check if table exists
SELECT 
  table_name, 
  table_type
FROM information_schema.tables 
WHERE table_name = 'video_code_cache';

-- Check indexes
SELECT 
  indexname, 
  indexdef
FROM pg_indexes 
WHERE tablename = 'video_code_cache';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Restart your API server (bun run dev)
-- 2. Test: curl http://localhost:3000/api/streaming/21/1 | jq '.sources[0].code'
-- 3. Use code: curl http://localhost:3000/api/video/{code}
-- ============================================================================
