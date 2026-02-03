-- ============================================
-- Supabase Database Schema
-- Anime Scraper API - Phase 2.3
-- ============================================

-- Table 1: Slug Mapping (Permanent Storage)
-- Purpose: Store MAL ID to Samehadaku/Animasu slug mappings permanently
-- This prevents re-matching for every request
CREATE TABLE IF NOT EXISTS slug_mappings (
  id BIGSERIAL PRIMARY KEY,
  mal_id INTEGER NOT NULL UNIQUE,
  samehadaku_slug TEXT,
  animasu_slug TEXT,
  confidence_samehadaku REAL,
  confidence_animasu REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast MAL ID lookup
CREATE INDEX IF NOT EXISTS idx_slug_mappings_mal_id ON slug_mappings(mal_id);

-- Comments for documentation
COMMENT ON TABLE slug_mappings IS 'Permanent storage for MAL ID to scraper slug mappings';
COMMENT ON COLUMN slug_mappings.mal_id IS 'MyAnimeList anime ID (unique)';
COMMENT ON COLUMN slug_mappings.samehadaku_slug IS 'Matched slug for Samehadaku website (null if not found)';
COMMENT ON COLUMN slug_mappings.animasu_slug IS 'Matched slug for Animasu website (null if not found)';
COMMENT ON COLUMN slug_mappings.confidence_samehadaku IS 'Matching confidence score (0-100)';
COMMENT ON COLUMN slug_mappings.confidence_animasu IS 'Matching confidence score (0-100)';


-- Table 2: Anime Metadata Cache (Temporary Storage - 20 minutes TTL)
-- Purpose: Cache full anime metadata response to reduce scraping load
CREATE TABLE IF NOT EXISTS anime_cache (
  id BIGSERIAL PRIMARY KEY,
  mal_id INTEGER NOT NULL UNIQUE,
  metadata JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast MAL ID lookup
CREATE INDEX IF NOT EXISTS idx_anime_cache_mal_id ON anime_cache(mal_id);

-- Index for automatic cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_anime_cache_expires_at ON anime_cache(expires_at);

-- Comments for documentation
COMMENT ON TABLE anime_cache IS 'Temporary cache for anime metadata with 20 minute TTL';
COMMENT ON COLUMN anime_cache.mal_id IS 'MyAnimeList anime ID (unique)';
COMMENT ON COLUMN anime_cache.metadata IS 'Full anime response in JSON format (title, synopsis, episodes, etc)';
COMMENT ON COLUMN anime_cache.expires_at IS 'Cache expiration timestamp (20 minutes from creation)';


-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on slug_mappings
CREATE TRIGGER update_slug_mappings_updated_at
  BEFORE UPDATE ON slug_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- Function: Clean expired cache entries
-- Run this periodically via cron job or pg_cron extension
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_anime INTEGER;
  deleted_streaming INTEGER;
  total_deleted INTEGER;
BEGIN
  DELETE FROM anime_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_anime = ROW_COUNT;
  
  DELETE FROM streaming_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_streaming = ROW_COUNT;
  
  total_deleted := deleted_anime + deleted_streaming;
  RETURN total_deleted;
END;
$$ LANGUAGE plpgsql;

-- Table 3: Streaming Links Cache (Temporary Storage - 20 minutes TTL)
-- Purpose: Cache streaming links per episode to reduce scraping load
CREATE TABLE IF NOT EXISTS streaming_cache (
  id BIGSERIAL PRIMARY KEY,
  mal_id INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  sources JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mal_id, episode)
);

-- Index for fast lookup by MAL ID and episode
CREATE INDEX IF NOT EXISTS idx_streaming_cache_mal_episode ON streaming_cache(mal_id, episode);

-- Index for automatic cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_streaming_cache_expires_at ON streaming_cache(expires_at);

-- Comments for documentation
COMMENT ON TABLE streaming_cache IS 'Temporary cache for streaming links with 20 minute TTL';
COMMENT ON COLUMN streaming_cache.mal_id IS 'MyAnimeList anime ID';
COMMENT ON COLUMN streaming_cache.episode IS 'Episode number';
COMMENT ON COLUMN streaming_cache.sources IS 'Array of streaming links with provider, url, resolution, server';
COMMENT ON COLUMN streaming_cache.expires_at IS 'Cache expiration timestamp (20 minutes from creation)';


-- Table 4: Video Code Cache (Temporary Storage - 24 hours TTL)
-- Purpose: Map short codes to video source data for easy streaming access
CREATE TABLE IF NOT EXISTS video_code_cache (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(6) NOT NULL UNIQUE,
  source_data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast code lookup
CREATE INDEX IF NOT EXISTS idx_video_code_cache_code ON video_code_cache(code);

-- Index for automatic cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_video_code_cache_expires_at ON video_code_cache(expires_at);

-- Comments for documentation
COMMENT ON TABLE video_code_cache IS 'Temporary cache for video short codes with 24 hour TTL';
COMMENT ON COLUMN video_code_cache.code IS 'Short 6-character alphanumeric code (e.g., bexi68)';
COMMENT ON COLUMN video_code_cache.source_data IS 'Full StreamingLink object with provider, url, url_video, resolution, server';
COMMENT ON COLUMN video_code_cache.expires_at IS 'Cache expiration timestamp (24 hours from creation)';


-- Update cleanup function to include video_code_cache
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_anime INTEGER;
  deleted_streaming INTEGER;
  deleted_video_code INTEGER;
  total_deleted INTEGER;
BEGIN
  DELETE FROM anime_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_anime = ROW_COUNT;
  
  DELETE FROM streaming_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_streaming = ROW_COUNT;
  
  DELETE FROM video_code_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_video_code = ROW_COUNT;
  
  total_deleted := deleted_anime + deleted_streaming + deleted_video_code;
  RETURN total_deleted;
END;
$$ LANGUAGE plpgsql;


-- Optional: Enable Row Level Security (RLS) for production
-- ALTER TABLE slug_mappings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE anime_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE streaming_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE video_code_cache ENABLE ROW LEVEL SECURITY;

-- Optional: Create policies for API access
-- CREATE POLICY "Allow read access to all users" ON slug_mappings FOR SELECT USING (true);
-- CREATE POLICY "Allow read access to all users" ON anime_cache FOR SELECT USING (true);
-- CREATE POLICY "Allow read access to all users" ON streaming_cache FOR SELECT USING (true);
-- CREATE POLICY "Allow read access to all users" ON video_code_cache FOR SELECT USING (true);
