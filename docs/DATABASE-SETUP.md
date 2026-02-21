# Database Setup Guide

Complete guide for setting up Supabase PostgreSQL database for Otakuin API.

---

## Prerequisites

- Supabase account (free tier available at [supabase.com](https://supabase.com))
- Database management tool (optional: use Supabase SQL Editor)

---

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Fill in project details:
   - **Name:** `otakuin-api` (or your preferred name)
   - **Database Password:** Strong password (save this!)
   - **Region:** Choose closest to your server location
4. Click **"Create new project"**
5. Wait for project to initialize (~2 minutes)

---

## Step 2: Get Database Credentials

1. Go to **Project Settings** (⚙️ icon in sidebar)
2. Navigate to **API** section
3. Copy the following values:

**Project URL:**
```
https://xxxxxxxxxxxxx.supabase.co
```

**anon/public key:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

4. Save these to your `.env` file:

```bash
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 3: Run Database Schema

1. Go to **SQL Editor** in Supabase dashboard
2. Click **"New query"**
3. Copy the entire content from `database-schema.sql` in project root
4. Paste into SQL Editor
5. Click **"Run"** or press `Ctrl+Enter`

**Expected output:**
```
Success. No rows returned
```

---

## Step 4: Verify Tables Created

1. Go to **Table Editor** in Supabase dashboard
2. You should see the following tables:

**Cache Tables:**
- `anime_cache` - Full anime metadata cache (20-min TTL)
- `streaming_cache` - Streaming links cache (20-min TTL)
- `home_page_cache` - Home page cache (6-hour TTL)
- `video_url_cache` - Video URL extraction cache (6-hour TTL)

**Permanent Storage Tables:**
- `slug_mappings` - MAL ID to scraper slug mappings
- `video_queue` - Video processing queue
- `video_storage` - Saved video metadata with GitHub URLs
- `github_storage_accounts` - Storage account configuration
- `github_storage_repos` - Repository tracking

3. Click on each table to verify structure

---

## Step 5: Test Database Connection

**From your project root:**

```bash
# Create test script
cat > test-db.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function testConnection() {
  const { data, error } = await supabase
    .from('slug_mappings')
    .select('count');
  
  if (error) {
    console.error('❌ Connection failed:', error.message);
  } else {
    console.log('✅ Connection successful!');
    console.log('Slug mappings count:', data);
  }
}

testConnection();
EOF

# Run test
bun test-db.ts

# Clean up
rm test-db.ts
```

**Expected output:**
```
✅ Connection successful!
Slug mappings count: []
```

---

## Step 6: Setup Storage Accounts (Optional)

If you plan to use GitHub video storage system:

1. Go to SQL Editor
2. Run the following query to add storage accounts:

```sql
INSERT INTO github_storage_accounts (account_name, username, is_active)
VALUES 
  ('storage-account-1', 'your-github-username-1', true),
  ('storage-account-2', 'your-github-username-2', true),
  ('storage-account-3', 'your-github-username-3', true)
ON CONFLICT (account_name) DO NOTHING;
```

3. Verify:

```sql
SELECT * FROM github_storage_accounts;
```

---

## Database Schema Overview

### Cache Tables (Temporary - Auto-Expire)

| Table | TTL | Purpose |
|-------|-----|---------|
| `anime_cache` | 20 minutes | Full anime metadata from Jikan + scrapers |
| `streaming_cache` | 20 minutes | Streaming source URLs per episode |
| `home_page_cache` | 6 hours | Home page anime listings |
| `video_url_cache` | 6 hours | Extracted video URLs from embed services |

### Permanent Tables

| Table | Purpose |
|-------|---------|
| `slug_mappings` | MAL ID to scraper slug mappings (never expires) |
| `video_queue` | Videos waiting to be uploaded to GitHub |
| `video_storage` | Saved video metadata with GitHub URLs and asset IDs |
| `github_storage_accounts` | Configuration for multi-account mirroring |
| `github_storage_repos` | Tracks repositories and episode counts |

---

## Automatic Cleanup

The database has automatic cleanup functions that run via triggers:

**Cleanup Schedule:**
- Every `INSERT` or `UPDATE` on cache tables
- Removes expired entries based on `expires_at` timestamp
- No manual intervention needed

**Manual cleanup (if needed):**

```sql
-- Force cleanup of all expired cache
DELETE FROM anime_cache WHERE expires_at < NOW();
DELETE FROM streaming_cache WHERE expires_at < NOW();
DELETE FROM home_page_cache WHERE expires_at < NOW();
DELETE FROM video_url_cache WHERE expires_at < NOW();
```

---

## Database Maintenance

### Backup Database

**Using Supabase Dashboard:**
1. Go to **Database** → **Backups**
2. Click **"Create backup"**
3. Download SQL dump

**Using pg_dump (requires database password):**

```bash
# Get database password from Project Settings → Database
pg_dump -h db.xxxxx.supabase.co -U postgres -d postgres > backup.sql
```

### Restore Database

```bash
psql -h db.xxxxx.supabase.co -U postgres -d postgres < backup.sql
```

---

## Monitoring

### Check Cache Hit Rate

```sql
-- Anime cache statistics
SELECT 
  COUNT(*) as total_entries,
  COUNT(*) FILTER (WHERE expires_at > NOW()) as active_entries,
  COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_entries
FROM anime_cache;
```

### Check Storage Usage

```sql
-- Total videos stored
SELECT 
  COUNT(*) as total_videos,
  SUM(file_size_bytes) as total_size_bytes,
  pg_size_pretty(SUM(file_size_bytes)::bigint) as total_size
FROM video_storage;
```

### Check Queue Status

```sql
-- Video queue statistics
SELECT 
  status,
  COUNT(*) as count
FROM video_queue
GROUP BY status;
```

---

## Troubleshooting

### Problem: Connection timeout

**Cause:** Firewall or network issue

**Solution:**
1. Check Supabase project status (Settings → General)
2. Verify SUPABASE_URL is correct
3. Test connection from different network

---

### Problem: "relation does not exist" error

**Cause:** Tables not created or wrong database

**Solution:**
1. Re-run `database-schema.sql`
2. Verify you're connected to correct project
3. Check Table Editor to see which tables exist

---

### Problem: Cache not working

**Cause:** Expired entries not being cleaned up

**Solution:**

```sql
-- Force cleanup
DELETE FROM anime_cache WHERE expires_at < NOW();
DELETE FROM streaming_cache WHERE expires_at < NOW();

-- Verify cleanup function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'cleanup_expired_cache';
```

---

## Next Steps

After database setup is complete:

1. **[GitHub Action Setup](./GITHUB-ACTION-SETUP.md)** - Setup video upload automation
2. **[Cloudflare Workers Setup](./WORKERS-SETUP.md)** - Setup video streaming proxy
3. **[Deployment Guide](./DEPLOYMENT.md)** - Deploy the API server

---

## Security Best Practices

1. **Never commit `.env` file** to git
2. **Use environment variables** for all credentials
3. **Enable Row Level Security (RLS)** for production:
   ```sql
   ALTER TABLE video_storage ENABLE ROW LEVEL SECURITY;
   ```
4. **Rotate anon key** if leaked (Project Settings → API → Reset key)
5. **Monitor database logs** in Supabase dashboard

---

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Manual](https://www.postgresql.org/docs/)
- [SQL Tutorial](https://www.postgresqltutorial.com/)
