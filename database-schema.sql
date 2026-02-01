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
  deleted_count INTEGER;
BEGIN
  DELETE FROM anime_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Enable Row Level Security (RLS) for production
-- ALTER TABLE slug_mappings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE anime_cache ENABLE ROW LEVEL SECURITY;

-- Optional: Create policies for API access
-- CREATE POLICY "Allow read access to all users" ON slug_mappings FOR SELECT USING (true);
-- CREATE POLICY "Allow read access to all users" ON anime_cache FOR SELECT USING (true);
