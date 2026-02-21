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


-- Table 5: Video URL Cache (Temporary Storage - 6 hours TTL)
-- Purpose: Cache extracted video URLs from all providers to reduce extraction overhead
CREATE TABLE IF NOT EXISTS video_url_cache (
  id BIGSERIAL PRIMARY KEY,
  embed_url TEXT NOT NULL,
  provider VARCHAR(50) NOT NULL,
  video_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(embed_url, provider)
);

-- Index for fast lookup by embed URL and provider
CREATE INDEX IF NOT EXISTS idx_video_url_cache_embed_provider ON video_url_cache(embed_url, provider);

-- Index for automatic cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_video_url_cache_expires_at ON video_url_cache(expires_at);

-- Comments for documentation
COMMENT ON TABLE video_url_cache IS 'Temporary cache for extracted video URLs with 6 hour TTL';
COMMENT ON COLUMN video_url_cache.embed_url IS 'Original embed URL from streaming source';
COMMENT ON COLUMN video_url_cache.provider IS 'Video provider (wibufile, filedon, berkasdrive, mp4upload)';
COMMENT ON COLUMN video_url_cache.video_url IS 'Extracted direct video URL';
COMMENT ON COLUMN video_url_cache.expires_at IS 'Cache expiration timestamp (6 hours from creation)';


-- ============================================
-- Table 6: Home Page Cache (Temporary Storage - 6 hours TTL)
-- ============================================
-- Purpose: Cache home page anime list with MAL metadata to reduce scraping overhead
CREATE TABLE IF NOT EXISTS home_page_cache (
  id BIGSERIAL PRIMARY KEY,
  mal_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cover TEXT NOT NULL,
  last_episode INTEGER,
  slug_samehadaku TEXT,
  slug_animasu TEXT,
  aired_from TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by MAL ID
CREATE INDEX IF NOT EXISTS idx_home_page_cache_mal_id ON home_page_cache(mal_id);

-- Index for automatic cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_home_page_cache_expires_at ON home_page_cache(expires_at);

-- Trigger for automatic updated_at timestamp
CREATE TRIGGER update_home_page_cache_updated_at
  BEFORE UPDATE ON home_page_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE home_page_cache IS 'Temporary cache for home page anime list with 6 hour TTL';
COMMENT ON COLUMN home_page_cache.mal_id IS 'MyAnimeList ID (primary identifier)';
COMMENT ON COLUMN home_page_cache.name IS 'Anime title from MAL';
COMMENT ON COLUMN home_page_cache.cover IS 'Cover image URL from MAL';
COMMENT ON COLUMN home_page_cache.last_episode IS 'Latest episode number from scraped sources';
COMMENT ON COLUMN home_page_cache.slug_samehadaku IS 'Samehadaku anime slug for URL construction';
COMMENT ON COLUMN home_page_cache.slug_animasu IS 'Animasu anime slug for URL construction';
COMMENT ON COLUMN home_page_cache.aired_from IS 'Anime air date from MAL (for is_new calculation)';
COMMENT ON COLUMN home_page_cache.expires_at IS 'Cache expiration timestamp (6 hours from creation)';


-- Update cleanup function to include all cache tables
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_anime INTEGER;
  deleted_streaming INTEGER;
  deleted_video_code INTEGER;
  deleted_video_url INTEGER;
  deleted_home_page INTEGER;
  total_deleted INTEGER;
BEGIN
  DELETE FROM anime_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_anime = ROW_COUNT;
  
  DELETE FROM streaming_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_streaming = ROW_COUNT;
  
  DELETE FROM video_code_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_video_code = ROW_COUNT;
  
  DELETE FROM video_url_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_video_url = ROW_COUNT;
  
  DELETE FROM home_page_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_home_page = ROW_COUNT;
  
  total_deleted := deleted_anime + deleted_streaming + deleted_video_code + deleted_video_url + deleted_home_page;
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


-- ============================================
-- CLEANUP: Remove Blogger & VidHidePro Data
-- Phase 2.13 - One-time cleanup (Optional)
-- ============================================

-- Clean up video_url_cache entries for removed providers
-- DELETE FROM video_url_cache
-- WHERE provider IN ('blogger', 'vidhidepro')
--    OR embed_url LIKE '%blogger.com%'
--    OR embed_url LIKE '%vidhidepro.com%'
--    OR embed_url LIKE '%vidhidefast.com%'
--    OR embed_url LIKE '%callistanise.com%';

-- Clean up streaming_cache entries containing removed providers
-- UPDATE streaming_cache
-- SET sources = (
--   SELECT jsonb_agg(source)
--   FROM jsonb_array_elements(sources) AS source
--   WHERE NOT (
--     source->>'url' LIKE '%blogger.com%' OR
--     source->>'url' LIKE '%vidhidepro.com%' OR
--     source->>'url' LIKE '%vidhidefast.com%' OR
--     source->>'url' LIKE '%callistanise.com%'
--   )
-- )
-- WHERE sources::text LIKE '%blogger.com%'
--    OR sources::text LIKE '%vidhidepro.com%'
--    OR sources::text LIKE '%vidhidefast.com%'
--    OR sources::text LIKE '%callistanise.com%';

-- Clean up video_code_cache entries for removed providers
-- DELETE FROM video_code_cache
-- WHERE source_data->>'url' LIKE '%blogger.com%'
--    OR source_data->>'url' LIKE '%vidhidepro.com%'
--    OR source_data->>'url' LIKE '%vidhidefast.com%'
--    OR source_data->>'url' LIKE '%callistanise.com%';

-- Note: Cleanup queries are commented out because the API now filters
-- removed providers automatically. Run these queries only if you want
-- to permanently remove old data from the database.


-- ============================================
-- VIDEO STORAGE SYSTEM - Phase 2.18
-- ============================================

-- Table 7: GitHub Storage Accounts
-- Purpose: Store GitHub account credentials for multi-account video storage
CREATE TABLE IF NOT EXISTS github_storage_accounts (
  id BIGSERIAL PRIMARY KEY,
  account_name VARCHAR(100) NOT NULL UNIQUE,
  github_username VARCHAR(100) NOT NULL,
  github_token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_repos INTEGER NOT NULL DEFAULT 0,
  total_episodes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_accounts_active ON github_storage_accounts(is_active);

CREATE TRIGGER update_github_storage_accounts_updated_at
  BEFORE UPDATE ON github_storage_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE github_storage_accounts IS 'Multi-account GitHub storage configuration for video backup';
COMMENT ON COLUMN github_storage_accounts.account_name IS 'Friendly name for the account (e.g., storage-account-1)';
COMMENT ON COLUMN github_storage_accounts.github_username IS 'GitHub username for API access';
COMMENT ON COLUMN github_storage_accounts.github_token IS 'GitHub Personal Access Token (PAT) with repo permissions';
COMMENT ON COLUMN github_storage_accounts.is_active IS 'Whether this account is available for uploads';
COMMENT ON COLUMN github_storage_accounts.total_repos IS 'Total repositories created under this account';
COMMENT ON COLUMN github_storage_accounts.total_episodes IS 'Total episodes stored across all repos in this account';


-- Table 8: GitHub Storage Repositories
-- Purpose: Track created repositories for video storage (max 500 episodes per repo)
CREATE TABLE IF NOT EXISTS github_storage_repos (
  id BIGSERIAL PRIMARY KEY,
  repo_name VARCHAR(200) NOT NULL,
  github_account_id BIGINT NOT NULL REFERENCES github_storage_accounts(id) ON DELETE CASCADE,
  repo_url TEXT NOT NULL,
  episode_count INTEGER NOT NULL DEFAULT 0,
  is_full BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repo_name, github_account_id)
);

CREATE INDEX IF NOT EXISTS idx_github_repos_account ON github_storage_repos(github_account_id);
CREATE INDEX IF NOT EXISTS idx_github_repos_full ON github_storage_repos(is_full);

CREATE TRIGGER update_github_storage_repos_updated_at
  BEFORE UPDATE ON github_storage_repos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE github_storage_repos IS 'Track GitHub repositories for video storage with 500 episode limit';
COMMENT ON COLUMN github_storage_repos.repo_name IS 'Repository name (e.g., anime-video-storage-1)';
COMMENT ON COLUMN github_storage_repos.github_account_id IS 'Foreign key to github_storage_accounts';
COMMENT ON COLUMN github_storage_repos.repo_url IS 'Full GitHub repository URL';
COMMENT ON COLUMN github_storage_repos.episode_count IS 'Current number of episodes in this repo';
COMMENT ON COLUMN github_storage_repos.is_full IS 'True when episode_count >= 500';


-- Table 9: Video Queue
-- Purpose: Queue system for video downloads via GitHub Actions
CREATE TABLE IF NOT EXISTS video_queue (
  id BIGSERIAL PRIMARY KEY,
  mal_id INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  anime_title TEXT NOT NULL,
  code VARCHAR(10) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  url_video TEXT NOT NULL,
  resolution VARCHAR(20) NOT NULL,
  server INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(mal_id, episode, resolution, server)
);

CREATE INDEX IF NOT EXISTS idx_video_queue_status ON video_queue(status);
CREATE INDEX IF NOT EXISTS idx_video_queue_priority ON video_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_video_queue_mal_episode ON video_queue(mal_id, episode);

CREATE TRIGGER update_video_queue_updated_at
  BEFORE UPDATE ON video_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE video_queue IS 'Queue system for video downloads with GitHub Actions integration';
COMMENT ON COLUMN video_queue.mal_id IS 'MyAnimeList anime ID';
COMMENT ON COLUMN video_queue.episode IS 'Episode number';
COMMENT ON COLUMN video_queue.anime_title IS 'Anime title for file naming';
COMMENT ON COLUMN video_queue.code IS 'Short code from streaming API';
COMMENT ON COLUMN video_queue.provider IS 'Video provider (wibufile, filedon, etc)';
COMMENT ON COLUMN video_queue.url_video IS 'Direct video URL for download';
COMMENT ON COLUMN video_queue.resolution IS 'Video resolution (360p, 720p, 1080p)';
COMMENT ON COLUMN video_queue.server IS 'Server number for ordering (1, 2, 3, etc)';
COMMENT ON COLUMN video_queue.status IS 'Queue status: pending, processing, completed, failed';
COMMENT ON COLUMN video_queue.priority IS 'Higher number = higher priority (0 = normal)';
COMMENT ON COLUMN video_queue.error_message IS 'Error details if status = failed';
COMMENT ON COLUMN video_queue.retry_count IS 'Number of retry attempts';
COMMENT ON COLUMN video_queue.max_retries IS 'Maximum retry attempts before permanent failure';


-- Table 10: Video Storage
-- Purpose: Track successfully uploaded videos across all GitHub accounts
CREATE TABLE IF NOT EXISTS video_storage (
  id BIGSERIAL PRIMARY KEY,
  mal_id INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  anime_title TEXT NOT NULL,
  code VARCHAR(10) NOT NULL,
  resolution VARCHAR(20) NOT NULL,
  server INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  release_tag VARCHAR(100) NOT NULL,
  github_urls JSONB NOT NULL,
  github_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mal_id, episode, resolution, server)
);

CREATE INDEX IF NOT EXISTS idx_video_storage_mal_episode ON video_storage(mal_id, episode);
CREATE INDEX IF NOT EXISTS idx_video_storage_code ON video_storage(code);
CREATE INDEX IF NOT EXISTS idx_video_storage_release ON video_storage(release_tag);

CREATE TRIGGER update_video_storage_updated_at
  BEFORE UPDATE ON video_storage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE video_storage IS 'Track uploaded videos with multi-account GitHub Release URLs';
COMMENT ON COLUMN video_storage.mal_id IS 'MyAnimeList anime ID';
COMMENT ON COLUMN video_storage.episode IS 'Episode number';
COMMENT ON COLUMN video_storage.anime_title IS 'Anime title for reference';
COMMENT ON COLUMN video_storage.code IS 'Short code from streaming API';
COMMENT ON COLUMN video_storage.resolution IS 'Video resolution (360p, 720p, 1080p)';
COMMENT ON COLUMN video_storage.server IS 'Server number matching streaming API order';
COMMENT ON COLUMN video_storage.file_name IS 'Obfuscated file name on GitHub';
COMMENT ON COLUMN video_storage.file_size_bytes IS 'Video file size in bytes';
COMMENT ON COLUMN video_storage.release_tag IS 'GitHub Release tag (e.g., anime-21 for One Piece)';
COMMENT ON COLUMN video_storage.github_urls IS 'JSON array of download URLs from all accounts: [{"account": "storage-1", "url": "https://github.com/..."}]';
COMMENT ON COLUMN video_storage.github_asset_ids IS 'JSON array of GitHub asset IDs for API access: [{"account": "storage-1", "asset_id": 123456, "repo": "owner/repo"}]';


-- Update cleanup function to include new tables (video_queue old entries)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_anime INTEGER;
  deleted_streaming INTEGER;
  deleted_video_code INTEGER;
  deleted_video_url INTEGER;
  deleted_home_page INTEGER;
  deleted_completed_queue INTEGER;
  total_deleted INTEGER;
BEGIN
  DELETE FROM anime_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_anime = ROW_COUNT;
  
  DELETE FROM streaming_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_streaming = ROW_COUNT;
  
  DELETE FROM video_code_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_video_code = ROW_COUNT;
  
  DELETE FROM video_url_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_video_url = ROW_COUNT;
  
  DELETE FROM home_page_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_home_page = ROW_COUNT;
  
  -- Clean up completed/failed queue items older than 7 days
  DELETE FROM video_queue 
  WHERE status IN ('completed', 'failed') 
    AND completed_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_completed_queue = ROW_COUNT;
  
  total_deleted := deleted_anime + deleted_streaming + deleted_video_code + deleted_video_url + deleted_home_page + deleted_completed_queue;
  RETURN total_deleted;
END;
$$ LANGUAGE plpgsql;
