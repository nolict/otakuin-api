# 📦 Video Storage System Documentation

Dokumentasi lengkap sistem penyimpanan video anime menggunakan GitHub Releases sebagai storage backend.

---

## 📖 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [System Flow](#system-flow)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [GitHub Action Worker](#github-action-worker)
7. [File Naming Convention](#file-naming-convention)
8. [Multi-Account Strategy](#multi-account-strategy)
9. [Performance & Limits](#performance--limits)
10. [Security](#security)

---

## 🎯 Overview

Sistem ini secara otomatis mendownload dan menyimpan video anime dari berbagai provider ke multiple GitHub accounts menggunakan GitHub Releases sebagai CDN global yang gratis dan unlimited.

### Key Features

- ✅ **Auto-triggered**: User fetch streaming → Queue → GitHub Action berjalan otomatis
- ✅ **Multi-account mirroring**: Video diupload ke N akun GitHub sekaligus (backup)
- ✅ **Auto repository management**: Otomatis bikin repo baru setiap 500 episode
- ✅ **Obfuscated naming**: Nama file disamarkan untuk keamanan
- ✅ **Scalable**: Unlimited storage via GitHub Releases
- ✅ **Global CDN**: GitHub servers worldwide untuk fast download

### Technology Stack

**Backend API:**
- Bun + ElysiaJS
- Supabase (PostgreSQL)
- TypeScript

**Worker:**
- GitHub Actions (Ubuntu runners)
- Node.js
- Octokit (GitHub API client)

**Storage:**
- GitHub Releases (unlimited, 2GB per file)
- Global CDN

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER REQUEST                           │
│                    GET /api/streaming/21/1                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API SERVER                              │
│  1. Fetch streaming links from scrapers                         │
│  2. Extract direct video URLs (url_video)                       │
│  3. Check if already saved in video_storage                     │
│  4. If NOT saved → Add to video_queue                           │
│  5. Trigger GitHub Action via repository_dispatch              │
│  6. Return response with sources + saved_videos                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE DATABASE                            │
│  - video_queue: Queue untuk video yang perlu didownload         │
│  - video_storage: Metadata video yang sudah tersimpan           │
│  - github_storage_accounts: Config akun GitHub                  │
│  - github_storage_repos: Tracking repo yang dibuat              │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   GITHUB ACTION WORKER                          │
│  1. Connect to Supabase with SUPABASE_URL & SUPABASE_ANON_KEY   │
│  2. Query video_queue table (status='pending', limit=5)         │
│  3. Download video to /tmp/anime-videos/                        │
│  4. For each storage account:                                   │
│     - Get/Create repository (anime-video-storage-N)             │
│     - Get/Create release (anime-{mal_id})                       │
│     - Upload file to release assets                             │
│  5. Save metadata to video_storage table (via Supabase)         │
│  6. Update queue status to 'completed' (via Supabase)           │
│  7. Delete temporary file                                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GITHUB STORAGE ACCOUNTS                        │
│  Account 1: github.com/user1/anime-video-storage-1              │
│  Account 2: github.com/user2/anime-video-storage-1              │
│  Account 3: github.com/user3/anime-video-storage-1              │
│  ...                                                            │
│  Each account mirrors the same files (backup strategy)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 System Flow

### Flow 1: User Fetch Streaming (First Time)

```
1. User → GET /api/streaming/21/1
2. API scrapes streaming sources
3. API extracts url_video for each source
4. API checks video_storage table → NOT FOUND
5. API adds to video_queue table:
   {
     mal_id: 21,
     episode: 1,
     anime_title: "One Piece",
     url_video: "https://cdn.provider.com/video.mp4",
     resolution: "720p",
     server: 1,
     status: "pending"
   }
6. API triggers GitHub Action:
   POST https://api.github.com/repos/user/worker/dispatches
   {
     event_type: "process_queue"
   }
7. API returns response:
   {
     sources: [...],
     saved_videos: []  ← Empty karena belum ada
   }
```

### Flow 2: GitHub Action Processing

```
1. GitHub Action triggered (auto start dalam ~5 detik)
2. Action connects to Supabase (SUPABASE_URL + SUPABASE_ANON_KEY)
3. Action queries: SELECT * FROM video_queue WHERE status='pending' LIMIT 5
4. For each queue item:
   a. Update status to "processing" via Supabase
   b. Download video to /tmp/anime-videos/{filename}
   c. For each storage account (e.g., 3 accounts):
      - Check existing repos
      - If all repos full (≥500 episodes) → Create new repo
      - Get/Create release "anime-21"
      - Upload file to release assets
      - Get download URL
   d. Save to video_storage via Supabase:
      {
        file_name: "00021f5a1b7c0d720s01.mp4",
        github_urls: [
          {account: "storage-1", url: "https://github.com/user1/..."},
          {account: "storage-2", url: "https://github.com/user2/..."},
          {account: "storage-3", url: "https://github.com/user3/..."}
        ]
      }
   e. Update queue status to "completed" via Supabase
   f. Delete temporary file
5. Action completes
```

### Flow 3: User Fetch Streaming (After Saved)

```
1. User → GET /api/streaming/21/1
2. API scrapes streaming sources
3. API checks video_storage table → FOUND!
4. API returns response:
   {
     sources: [...],
     saved_videos: [
       {
         resolution: "720p",
         server: 1,
         file_name: "00021f5a1b7c0d720s01.mp4",
         file_size_bytes: 257234567,
         github_urls: [
           {
             account: "storage-1",
             username: "user1",
             repo_name: "anime-video-storage-1",
             url: "https://github.com/user1/.../00021f5a1b7c0d720s01.mp4"
           },
           {
             account: "storage-2",
             username: "user2",
             repo_name: "anime-video-storage-1",
             url: "https://github.com/user2/.../00021f5a1b7c0d720s01.mp4"
           }
         ]
       }
     ]
   }
```

---

## 🗄️ Database Schema

### Table: video_queue

Queue system untuk video yang perlu didownload.

```sql
CREATE TABLE video_queue (
  id BIGSERIAL PRIMARY KEY,
  mal_id INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  anime_title TEXT NOT NULL,
  code VARCHAR(10) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  url_video TEXT NOT NULL,
  resolution VARCHAR(20) NOT NULL,
  server INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
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
```

**Field Descriptions:**
- `mal_id`: MyAnimeList anime ID
- `episode`: Episode number
- `anime_title`: Anime title untuk file naming
- `code`: Short code dari streaming API
- `provider`: Video provider (wibufile, filedon, dll)
- `url_video`: Direct video URL untuk download
- `resolution`: Video resolution (360p, 720p, 1080p)
- `server`: Server number (1, 2, 3, dst)
- `status`: Current status
- `priority`: Higher = processed first (0 = normal)
- `retry_count`: Jumlah retry yang sudah dilakukan
- `max_retries`: Max retry sebelum permanent failure

### Table: video_storage

Metadata video yang sudah tersimpan di GitHub.

```sql
CREATE TABLE video_storage (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mal_id, episode, resolution, server)
);
```

**github_urls JSONB Format:**
```json
[
  {
    "account": "storage-1",
    "username": "github-user-1",
    "repo_name": "anime-video-storage-1",
    "url": "https://github.com/github-user-1/anime-video-storage-1/releases/download/anime-21/00021f5a1b7c0d720s01.mp4"
  },
  {
    "account": "storage-2",
    "username": "github-user-2",
    "repo_name": "anime-video-storage-1",
    "url": "https://github.com/github-user-2/anime-video-storage-1/releases/download/anime-21/00021f5a1b7c0d720s01.mp4"
  }
]
```

---

## 🔌 API Endpoints

### GET /api/streaming/:id/:episode

Fetch streaming links dengan auto-queue untuk video storage.

**Response (Enhanced):**
```json
{
  "mal_id": 21,
  "episode": 1,
  "anime_title": "One Piece",
  "sources": [
    {
      "code": "abc123",
      "provider": "animasu",
      "url": "https://embed.url",
      "url_video": "https://direct.video.url",
      "resolution": "720p",
      "server": "1"
    }
  ],
  "saved_videos": [
    {
      "resolution": "720p",
      "server": 1,
      "file_name": "00021f5a1b7c0d720s01.mp4",
      "file_size_bytes": 257234567,
      "github_urls": [...]
    }
  ]
}
```

### POST /api/webhook/queue-trigger

**Authentication:** Bearer token (WEBHOOK_SECRET)

Fetch pending queue items untuk diproses oleh GitHub Action.

**Request:**
```json
{
  "limit": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Found 3 pending items",
  "items": [
    {
      "id": 1,
      "mal_id": 21,
      "episode": 1,
      "anime_title": "One Piece",
      "url_video": "https://...",
      "resolution": "720p",
      "server": 1,
      ...
    }
  ]
}
```

### GET /api/webhook/queue-stats

**Authentication:** Bearer token

Get queue statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "pending": 45,
    "processing": 2,
    "completed": 128,
    "failed": 3,
    "total": 178
  }
}
```

### POST /api/webhook/queue-complete

**Authentication:** Bearer token

Update queue item status (called by GitHub Action).

**Request:**
```json
{
  "queue_id": 1,
  "status": "completed",
  "error_message": null
}
```

### POST /api/webhook/save-video-storage

**Authentication:** Bearer token

Save video metadata after successful upload (called by GitHub Action).

**Request:**
```json
{
  "mal_id": 21,
  "episode": 1,
  "anime_title": "One Piece",
  "code": "abc123",
  "resolution": "720p",
  "server": 1,
  "file_name": "00021f5a1b7c0d720s01.mp4",
  "file_size_bytes": 257234567,
  "release_tag": "anime-21",
  "github_urls": [...]
}
```

---

## ⚙️ GitHub Action Worker

### Trigger Methods

**1. Automatic (repository_dispatch)**
- Triggered by API when new queue items added
- Real-time processing (~5 seconds delay)

**2. Manual (workflow_dispatch)**
- Via GitHub Actions UI
- For testing or manual queue processing

### Workflow Configuration

```yaml
on:
  repository_dispatch:
    types: [process_queue]
  workflow_dispatch:
    inputs:
      limit:
        description: 'Number of queue items to process'
        default: '5'
```

### Processing Logic

```javascript
for each queue_item:
  1. Download video
  2. For each storage_account:
     - Get available repo (or create new if full)
     - Upload to release
     - Collect download URL
  3. Save metadata to database
  4. Update queue status
  5. Delete temp file
```

### Auto Repository Management

```javascript
function getOrCreateRepo(username, malId):
  repos = listRepos(username, pattern="anime-video-storage-*")
  
  for repo in repos:
    totalEpisodes = countReleaseAssets(repo)
    if totalEpisodes < 500:
      return repo  // Use this repo
  
  // All repos full, create new one
  newRepoNumber = repos.length + 1
  newRepo = createRepo("anime-video-storage-" + newRepoNumber)
  return newRepo
```

---

## 📝 File Naming Convention

### Format

```
{MAL_ID}{TITLE_HASH}{RESOLUTION}s{SERVER}.mp4
```

### Components

**1. MAL ID (5 digits, zero-padded)**
- Example: `00021` for One Piece (MAL ID 21)
- Example: `16498` for Shingeki no Kyojin

**2. Title Hash (8 characters)**
- MD5 hash of anime title (lowercase, no special chars)
- Shuffled with pattern: [2, 5, 1, 7, 0, 4, 3, 6]
- Example: "one piece" → MD5 → shuffle → `f5a1b7c0`

**3. Resolution (3-4 digits)**
- Remove 'p' from resolution
- Example: `720` for 720p, `1080` for 1080p

**4. Server (2 digits, zero-padded)**
- Server number matching streaming API order
- Example: `01`, `02`, `03`

### Examples

```
00021f5a1b7c0d720s01.mp4
  └─┬─┘└───┬───┘└┬┘└┬┘
    │      │     │  │
    │      │     │  └─ Server 1
    │      │     └─ 720p
    │      └─ Title hash (obfuscated)
    └─ MAL ID 00021 (One Piece)

16498a2c4e8f1d1080s03.mp4
  └─┬─┘└───┬───┘└─┬─┘└┬┘
    │      │      │   │
    │      │      │   └─ Server 3
    │      │      └─ 1080p
    │      └─ Title hash
    └─ MAL ID 16498 (Shingeki no Kyojin)
```

### Benefits

- ✅ **Obfuscated**: Tidak langsung ketahuan anime apa
- ✅ **Unique**: Kombinasi MAL ID + hash + resolution + server = unique
- ✅ **Sortable**: MAL ID di depan untuk easy sorting
- ✅ **Parseable**: Bisa extract info dari filename

---

## 🔄 Multi-Account Strategy

### Why Multiple Accounts?

1. **Redundancy**: Backup kalau satu account suspended/deleted
2. **Load distribution**: Multiple CDN endpoints
3. **Reliability**: Kalau satu down, user bisa pakai mirror lain
4. **Storage limit**: GitHub gak ada limit per account, tapi diversifikasi lebih aman

### Repository Naming

```
Account 1:
├── anime-video-storage-1  (Episodes 1-500)
├── anime-video-storage-2  (Episodes 501-1000)
└── anime-video-storage-3  (Episodes 1001-1500)

Account 2:
├── anime-video-storage-1  (Same episodes, mirrored)
├── anime-video-storage-2
└── anime-video-storage-3

Account 3:
├── anime-video-storage-1  (Same episodes, mirrored)
└── ...
```

**All accounts have IDENTICAL structure!**

### Release Structure

```
Repository: anime-video-storage-1
├── Release: anime-21 (One Piece)
│   ├── 00021f5a1b7c0d360s01.mp4
│   ├── 00021f5a1b7c0d720s01.mp4
│   └── ...
├── Release: anime-16498 (Shingeki no Kyojin)
│   ├── 16498a2c4e8f1d720s01.mp4
│   └── ...
```

**One release per anime, identified by MAL ID!**

---

## 📊 Performance & Limits

### GitHub Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| File size per release asset | 2 GB | Hard limit |
| Total release assets | Unlimited | Per release |
| Total releases | Unlimited | Per repository |
| Repositories per account | Unlimited | - |
| GitHub Actions minutes | 2000 min/month | Free tier (Ubuntu) |
| GitHub Actions storage | 500 MB | For artifacts (we delete immediately) |
| API rate limit | 5000 req/hour | Per token |
| Bandwidth | Unlimited | For public repos |

### Our Usage Estimate

**Scenario: 100 episodes/day**

**Storage:**
- Average video size: 250 MB
- Daily storage: 100 × 250 MB = 25 GB
- With 3 accounts: 75 GB total (all mirrored)
- Monthly: ~2.25 TB

**GitHub Actions:**
- Download time: ~2 min/episode
- Upload time: ~1 min/episode × 3 accounts = 3 min
- Total: 5 min/episode
- Daily: 100 × 5 = 500 minutes
- Monthly: 15,000 minutes ⚠️ **Exceeds free tier!**

**Solution:**
- Use paid GitHub Actions plan ($0.008/minute for Ubuntu)
- Or spread across multiple worker repos
- Or process in batches (manual trigger)

### Performance Optimizations

1. **Parallel uploads**: Upload ke semua accounts paralel (future)
2. **Smart queuing**: Priority system untuk popular anime
3. **Cleanup**: Auto-delete temp files
4. **Caching**: Streaming cache 20 min prevents duplicate downloads

---

## 🔐 Security

### Token Management

**Never commit tokens to git!**

✅ Use GitHub Secrets for worker repo
✅ Use .env for API server (add to .gitignore)
✅ Rotate tokens every 6-12 months
✅ Use separate tokens for different purposes

### Access Control

**Webhook endpoints:**
- Protected with Bearer token authentication
- Only GitHub Action can access

**GitHub Releases:**
- Public repos = public download URLs
- Private repos = require authentication (not recommended)

### Obfuscation

File names are obfuscated but **NOT encrypted**.

Anyone with the URL can download.

**Trade-off:**
- ✅ Easy to share
- ✅ Global CDN
- ⚠️ Publicly accessible

**Future enhancement:**
- Add encryption layer
- Use private repos + signed URLs

---

## 🎯 Future Enhancements

- [ ] Parallel uploads to multiple accounts
- [ ] Video quality compression (reduce file size)
- [ ] Automatic cleanup of old videos (retention policy)
- [ ] Download analytics (track which videos popular)
- [ ] Multiple worker repos (scale GitHub Actions minutes)
- [ ] Webhook notifications (Discord/Telegram on complete)
- [ ] Video verification (check integrity after upload)
- [ ] Thumbnail generation
- [ ] Subtitle storage
- [ ] Admin dashboard for monitoring

---

## 📄 License

MIT License - Use and modify as needed.

---

**Last Updated:** 2026-02-20  
**Version:** 1.16.0
