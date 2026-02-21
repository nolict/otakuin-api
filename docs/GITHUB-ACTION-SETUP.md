# GitHub Action Setup Guide

Complete guide for setting up automated video upload to GitHub storage accounts.

---

## Overview

GitHub Action automatically uploads videos to multiple GitHub accounts for:

- **Unlimited storage** - 2GB per video file, unlimited repos
- **Multi-account mirroring** - Redundant copies across multiple accounts
- **Automatic triggers** - Uploads start on API request
- **Release-based organization** - One release per anime
- **Private repositories** - Secure video storage

---

## Prerequisites

- GitHub account for Workers (main account)
- GitHub account(s) for Storage (1-10 accounts recommended)
- Personal Access Tokens from both accounts
- Supabase database configured (see [Database Setup](./DATABASE-SETUP.md))

---

## Architecture Overview

```
API Server → Trigger GitHub Action (via repository_dispatch)
                        ↓
            GitHub Action Worker (runs on Workers account)
                        ↓
            Download video → Upload to Storage Accounts (1-10 accounts)
                        ↓
            Save metadata to Supabase (with asset_ids)
```

---

## Step 1: Create Storage Accounts

**Recommended setup:** 1 Workers account + 3-5 Storage accounts

**For each storage account:**

1. Create new GitHub account (or use existing)
   - Example: @demamtinggi1, @demamtinggi2, @demamtinggi3

2. **Important:** Keep credentials safe
   - Username
   - Email
   - Password

3. Generate Personal Access Token:
   - Go to: Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Name: `Storage Account Token`
   - Expiration: No expiration (or 1 year)
   - Scopes: **repo** (full control)
   - Generate token → Copy `ghp_XXX...`

4. Save token securely (you'll need it later)

---

## Step 2: Create Workers Account Token

This is the token used by GitHub Action to upload to storage accounts.

1. Login to your **Workers GitHub account** (main account)

2. Go to: Settings → Developer settings → Personal access tokens → Tokens (classic)

3. Click "Generate new token (classic)"

4. Configure token:
   - **Name:** `GitHub Action Upload Token`
   - **Expiration:** No expiration (or 1 year)
   - **Scopes:** **repo** (full control)

5. Generate token → Copy `ghp_XXX...`

6. Save this token - you'll use it in multiple places

---

## Step 3: Create GitHub Action Repository

**Option A: Use separate repository (Recommended)**

```bash
# Create new repository on GitHub
# Name: github-action-worker
# Visibility: Private (recommended)

# Clone to local
git clone https://github.com/your-username/github-action-worker.git
cd github-action-worker

# Copy worker files from main project
cp -r /path/to/otakuin-api/github-action-worker/* .

# Initialize git (if new repo)
git add .
git commit -m "Initial GitHub Action worker setup"
git push origin main
```

**Option B: Use same repository**

Skip this step - use your main API repository.

---

## Step 4: Configure Storage Accounts JSON

Create the configuration file for storage accounts:

```bash
cd github-action-worker

# Create storage accounts configuration
cat > storage-accounts.json << 'EOF'
[
  {
    "name": "storage-account-1",
    "username": "demamtinggi1",
    "token": "ghp_WORKERS_ACCOUNT_TOKEN_HERE"
  },
  {
    "name": "storage-account-2",
    "username": "your-username-2",
    "token": "ghp_WORKERS_ACCOUNT_TOKEN_HERE"
  },
  {
    "name": "storage-account-3",
    "username": "your-username-3",
    "token": "ghp_WORKERS_ACCOUNT_TOKEN_HERE"
  }
]
EOF
```

**⚠️ CRITICAL:** Use **Workers account token** (not storage account tokens) for all entries!

**Why?**
- GitHub Action runs on Workers account
- Workers account uploads to Storage accounts
- Token must have permission to create repos on Storage accounts

---

## Step 5: Setup GitHub Secrets

Add secrets to your GitHub Action repository:

1. Go to your repository on GitHub
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**

**Secret 1: SUPABASE_URL**
- Name: `SUPABASE_URL`
- Secret: Your Supabase project URL
  ```
  https://xxxxxxxxxxxxx.supabase.co
  ```

**Secret 2: SUPABASE_ANON_KEY**
- Name: `SUPABASE_ANON_KEY`
- Secret: Your Supabase anon/public key
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

**Secret 3: STORAGE_ACCOUNTS**
- Name: `STORAGE_ACCOUNTS`
- Secret: Copy entire content from `storage-accounts.json`
  ```json
  [
    {
      "name": "storage-account-1",
      "username": "demamtinggi1",
      "token": "ghp_WORKERS_TOKEN"
    }
  ]
  ```

**Verify secrets added:**
- You should see 3 secrets listed
- Secret values are hidden (normal behavior)

---

## Step 6: Update Workflow File

Edit `.github/workflows/video-download-upload.yml`:

```yaml
name: Video Download and Upload

on:
  repository_dispatch:
    types: [process-video-queue]
  workflow_dispatch:
    inputs:
      limit:
        description: 'Number of queue items to process'
        required: false
        default: '5'

jobs:
  process-queue:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Process queue items
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          STORAGE_ACCOUNTS: ${{ secrets.STORAGE_ACCOUNTS }}
          QUEUE_LIMIT: ${{ github.event.inputs.limit || github.event.client_payload.limit || 5 }}
        run: node src/index.js
```

**Commit and push:**

```bash
git add .github/workflows/video-download-upload.yml
git commit -m "Update workflow configuration"
git push origin main
```

---

## Step 7: Update Main API Configuration

Configure main API to trigger GitHub Action:

**Edit `.env` in main API project:**

```bash
# GitHub Action Configuration
GITHUB_ACTION_TOKEN=ghp_YOUR_WORKERS_ACCOUNT_TOKEN
GITHUB_ACTION_REPO=your-username/github-action-worker

# Primary storage account (for client response)
PRIMARY_STORAGE_ACCOUNT=storage-account-1
```

**Restart API server:**

```bash
cd /path/to/otakuin-api
bun run dev
```

---

## Step 8: Test GitHub Action Manually

Test workflow before automated triggers:

1. Go to your GitHub Action repository
2. Navigate to: **Actions** tab
3. Click workflow: **"Video Download and Upload"**
4. Click **"Run workflow"** dropdown
5. Set limit: `1` (process 1 video only)
6. Click **"Run workflow"**

**Monitor execution:**
- Workflow starts in ~5 seconds
- Click on running workflow to see logs
- Check for errors in console output

**Expected output:**
```
Fetched 1 pending queue items from database
Processing 1 queue items
=== Processing Queue Item 1 ===
Anime: Sakamoto Days Part 2 (MAL: 60285)
Episode: 1 | Resolution: 1080p | Server: 1
Downloading video from: https://...
✅ Download completed: 265.60 MB in 45.2s
📁 Uploading to 3 storage account(s)...
  ✅ Account: storage-account-1 (@demamtinggi1)
  ✅ Account: storage-account-2 (@username2)
  ✅ Account: storage-account-3 (@username3)
✅ Saved to database (including asset IDs)
✅ Queue item marked as completed
```

---

## Step 9: Test Automated Trigger

Test end-to-end flow from API to GitHub Action:

**1. Queue a video:**

```bash
curl "http://localhost:3000/api/streaming/60285/1"
```

**Expected response:**
```json
{
  "mal_id": 60285,
  "episode": 1,
  "sources": [...]
}
```

**2. Check queue in database:**

```sql
SELECT * FROM video_queue WHERE status = 'pending';
```

**3. Monitor GitHub Action:**
- Go to Actions tab in repository
- Should see new workflow run starting
- Click to view logs

**4. Verify upload:**

```bash
# After ~2-5 minutes, check saved videos
curl "http://localhost:3000/api/streaming/60285/1" | jq '.saved_videos'
```

**Expected output:**
```json
[
  {
    "file_name": "60285-EP001-1080p-S01.mp4",
    "resolution": "1080p",
    "file_size": 265600976,
    "url": "https://anime-video-proxy.workers.dev/?url=..."
  }
]
```

---

## How It Works

### 1. User Requests Video

```bash
GET /api/streaming/60285/1
```

API checks:
1. Video already saved? → Return `saved_videos`
2. Not saved → Scrape streaming sources
3. Extract `url_video` (direct video URL)
4. Add to `video_queue` table (status: pending)
5. Trigger GitHub Action via `repository_dispatch` API

### 2. GitHub Action Processes Queue

Action runs:
1. Connect to Supabase database
2. Query `video_queue` (status='pending', limit=5)
3. Download video to temporary storage
4. Upload to ALL storage accounts (parallel)
5. Save metadata to `video_storage` (with asset_ids)
6. Update queue status to 'completed'
7. Delete temporary file

### 3. Client Streams Video

```bash
GET /api/streaming/60285/1
```

API returns:
- `sources[]` - Original streaming providers
- `saved_videos[]` - GitHub URLs (wrapped with Cloudflare Workers)

Client plays video via Cloudflare Workers proxy.

---

## File Naming Convention

Videos are named using semi-obfuscated format:

**Format:** `{MAL_ID}-EP{EPISODE}-{RESOLUTION}-S{SERVER}.mp4`

**Example:** `60285-EP001-1080p-S01.mp4`

**Breakdown:**
- `60285` - MAL ID (MyAnimeList ID)
- `EP001` - Episode number (zero-padded 3 digits)
- `1080p` - Resolution (1080p/720p/480p/360p)
- `S01` - Server number (zero-padded 2 digits)

**Benefits:**
- Sortable by episode
- No anime title (prevents scraping)
- Contains all metadata
- Compact and readable

---

## Repository Management

### Auto-Create Repositories

Action automatically creates repositories:

**Naming:** `anime-video-storage-{N}`
- `anime-video-storage-1` (0-500 episodes)
- `anime-video-storage-2` (501-1000 episodes)
- `anime-video-storage-3` (1001-1500 episodes)

**When full (500 episodes):**
- Automatically creates next repo
- All episodes for one anime stay in same release

### Release Organization

**One release per anime:**

**Release tag format:** `anime-{MAL_ID}`

**Example:**
```
Repo: anime-video-storage-1
├─ Release: anime-60285 (Sakamoto Days Part 2)
│  ├─ 60285-EP001-1080p-S01.mp4
│  ├─ 60285-EP002-1080p-S01.mp4
│  └─ 60285-EP003-1080p-S01.mp4
├─ Release: anime-21 (One Piece)
│  ├─ 00021-EP001-720p-S01.mp4
│  └─ 00021-EP002-720p-S01.mp4
```

**Benefits:**
- All episodes grouped together
- Easy to find and manage
- GitHub release CDN for fast downloads

---

## Monitoring

### View Queue Status

```sql
SELECT 
  status,
  COUNT(*) as count
FROM video_queue
GROUP BY status;
```

**Output:**
```
status    | count
----------|------
pending   | 5
completed | 120
failed    | 2
```

### View Failed Uploads

```sql
SELECT 
  mal_id,
  episode,
  anime_title,
  error_message,
  created_at
FROM video_queue
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Retry Failed Uploads

```sql
-- Reset failed items to pending
UPDATE video_queue
SET status = 'pending', error_message = NULL
WHERE status = 'failed';
```

---

## Troubleshooting

### Problem: Action not triggering automatically

**Cause:** `GITHUB_ACTION_TOKEN` invalid or missing

**Solution:**

1. Check `.env` has correct token:
```bash
grep GITHUB_ACTION_TOKEN .env
```

2. Verify token has `repo` scope

3. Test manual trigger:
```bash
curl -X POST \
  -H "Authorization: token ghp_XXX" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/user/repo/dispatches" \
  -d '{"event_type":"process-video-queue"}'
```

---

### Problem: "name already exists" error

**Cause:** Repo already created by previous run

**Solution:** 
- **This is normal!** ✅
- Code handles this with try-catch
- Logs show: `⚠️ Repository already exists, using it...`
- No action needed

---

### Problem: Download timeout

**Cause:** Server slow or video too large

**Solution:**

1. Check video size in queue:
```sql
SELECT mal_id, episode, url_video FROM video_queue WHERE id = X;
```

2. Test manual download:
```bash
curl -o test.mp4 "URL_FROM_QUEUE"
```

3. Increase timeout in `src/index.js`:
```javascript
// Line ~80
const DOWNLOAD_TIMEOUT = 600000; // 10 minutes
```

---

### Problem: Upload fails to storage account

**Cause:** Token doesn't have permission

**Solution:**

1. Verify token is from **Workers account** (not storage account)

2. Check token scopes:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Verify token has `repo` (full control)

3. Regenerate token if needed

4. Update `STORAGE_ACCOUNTS` secret in GitHub

---

### Problem: Multiple episodes upload to different repos

**Cause:** Concurrent actions creating new repos

**Solution:**
- **This is safe!** Race condition is handled
- Both episodes will end up in correct release
- One action creates repo, other reuses it

---

## Performance Tuning

### Parallel Downloads

Edit `src/index.js`:

```javascript
// Line ~20
const MAX_CONCURRENT_DOWNLOADS = 3; // Default: 3

// Increase for faster processing (uses more bandwidth)
const MAX_CONCURRENT_DOWNLOADS = 5;
```

### Queue Limit

Process more videos per action run:

**Via API trigger:**
```typescript
// src/services/github/dispatcher.ts
const limit = 10; // Default: 5
```

**Via manual trigger:**
- Go to Actions → Run workflow
- Set limit: `10`

---

## Security Best Practices

1. **Use private repositories** for Action worker (recommended)
2. **Never commit tokens** to git (use GitHub Secrets)
3. **Rotate tokens** every 90 days (see [Token Management](./TOKEN-MANAGEMENT.md))
4. **Monitor Action logs** for suspicious activity
5. **Set storage repos as private** (default behavior)

---

## Cost & Limits

### GitHub Actions Free Tier

- **Minutes:** 2,000 minutes/month (public repos: unlimited)
- **Storage:** 500MB packages + releases
- **Concurrent jobs:** 20 for free accounts

### GitHub Storage Limits

- **File size:** 2GB per file (release assets)
- **Repo size:** Soft limit 5GB, hard limit 100GB
- **Release assets:** Unlimited (within repo size)

### Current Usage

Check Action usage:
1. Go to GitHub → Settings → Billing
2. View Actions usage
3. Check storage usage

---

## Next Steps

After GitHub Action setup is complete:

1. **[Cloudflare Workers Setup](./WORKERS-SETUP.md)** - Setup video streaming
2. **[Token Management](./TOKEN-MANAGEMENT.md)** - Manage tokens
3. **[API Deployment](./DEPLOYMENT.md)** - Deploy main API

---

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Repository Dispatch API](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
