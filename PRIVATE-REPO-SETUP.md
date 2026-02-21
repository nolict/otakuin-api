# Private Repository Setup Guide

## Ringkasan Perubahan

Semua repository video storage (`anime-video-storage-1`, `anime-video-storage-2`, dll) sekarang dibuat sebagai **private repository** untuk keamanan dan privasi.

## Yang Berubah

### 1. GitHub Action Worker

**File:** `github-action-worker/src/index.js`

**Perubahan:**
```javascript
// BEFORE
await octokit.repos.createForAuthenticatedUser({
  name: newRepoName,
  private: false,  // ❌ Public repository
  auto_init: true
});

// AFTER
await octokit.repos.createForAuthenticatedUser({
  name: newRepoName,
  private: true,   // ✅ Private repository
  auto_init: true
});
```

### 2. Cloudflare Workers

**File:** `workers/video-proxy/src/index.ts`

**Perubahan:**
- Menambahkan interface `Env` untuk environment variables
- Menambahkan GitHub token authorization header untuk akses private repo

```typescript
// BEFORE
export default {
  async fetch(request: Request): Promise<Response> {
    // No GitHub authentication
  }
}

// AFTER
interface Env {
  GITHUB_STORAGE_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Add GitHub token for private repos
    if (videoUrl.includes('github.com') && env.GITHUB_STORAGE_TOKEN) {
      headers.Authorization = `token ${env.GITHUB_STORAGE_TOKEN}`;
    }
  }
}
```

### 3. Environment Variables

**File:** `.env.example`

**Penambahan:**
```bash
# Cloudflare Workers Configuration
WORKER_VIDEO_PROXY_URL=https://anime-video-proxy.your-subdomain.workers.dev
GITHUB_STORAGE_TOKEN=ghp_your_github_token_for_cloudflare_workers
```

---

## Setup Instructions

### Langkah 1: Generate GitHub Personal Access Token

1. **Buka GitHub Settings:**
   - Klik profile → Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **Create New Token:**
   - Click "Generate new token (classic)"
   - Note: `Anime Video Storage Access`
   - Expiration: `No expiration` atau sesuai kebutuhan
   - **Scopes yang diperlukan:**
     - ✅ `repo` (Full control of private repositories)
       - ✅ `repo:status`
       - ✅ `repo_deployment`
       - ✅ `public_repo`
       - ✅ `repo:invite`
       - ✅ `security_events`

3. **Copy Token:**
   - Token format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **PENTING:** Save token ini, karena tidak akan bisa dilihat lagi!

### Langkah 2: Deploy Token ke Cloudflare Workers

```bash
# Navigate to workers directory
cd workers/video-proxy

# Deploy token as secret (akan diminta input token)
npx wrangler secret put GITHUB_STORAGE_TOKEN

# Saat prompt muncul, paste token:
# Enter a secret value: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Verification:**
```bash
# List all secrets (tidak menampilkan value)
npx wrangler secret list

# Expected output:
# [
#   {
#     "name": "GITHUB_STORAGE_TOKEN",
#     "type": "secret_text"
#   }
# ]
```

### Langkah 3: Deploy Cloudflare Workers

```bash
# Deploy to production
npm run deploy

# Expected output:
# ✨ Successfully created/updated secret GITHUB_STORAGE_TOKEN
# Published anime-video-proxy (1.23 sec)
#   https://anime-video-proxy.your-subdomain.workers.dev
```

### Langkah 4: Update Main API Environment

```bash
# Kembali ke root project
cd ../..

# Update .env file
echo "WORKER_VIDEO_PROXY_URL=https://anime-video-proxy.your-subdomain.workers.dev" >> .env
echo "GITHUB_STORAGE_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" >> .env
```

### Langkah 5: Restart API Server

```bash
# Stop server (Ctrl+C)
# Start server
bun run dev
```

---

## Testing

### Test 1: Verify Worker Can Access Private Repo

```bash
# Get video URL from API
curl "http://localhost:3000/api/streaming/61983/3" | jq '.saved_videos[0].url'

# Expected: GitHub release download URL
# https://github.com/username/anime-video-storage-1/releases/download/anime-61983/61983-EP003-1080p-S01.mp4

# Test through Cloudflare Workers proxy
curl -I "https://anime-video-proxy.your-subdomain.workers.dev/?url=https://github.com/username/..."

# Expected headers:
# HTTP/2 200 OK
# content-type: video/mp4
# access-control-allow-origin: *
```

### Test 2: Verify Private Repository

```bash
# Try accessing without authentication (should fail)
curl -I "https://github.com/username/anime-video-storage-1/releases/download/anime-61983/file.mp4"

# Expected:
# HTTP/2 404 Not Found (private repo)

# Try accessing with Cloudflare Workers proxy (should work)
curl -I "https://anime-video-proxy.your-subdomain.workers.dev/?url=https://github.com/..."

# Expected:
# HTTP/2 200 OK
```

### Test 3: Video Playback

Open HTML test page:
```bash
cd scripts
python3 -m http.server 8080
# Visit: http://localhost:8080/video-test.html
```

1. Input MAL ID: `61983`
2. Input Episode: `3`
3. Click "Fetch Sources"
4. Find source with `storage_type: "github"`
5. Click "Play This Video"
6. **Expected:** Video plays successfully ✅

---

## Troubleshooting

### Error: 401 Unauthorized (GitHub)

**Penyebab:**
- Token tidak valid
- Token expired
- Token tidak memiliki scope `repo`

**Solusi:**
```bash
# Generate new token dengan scope 'repo'
# Deploy ulang ke Cloudflare Workers
cd workers/video-proxy
npx wrangler secret put GITHUB_STORAGE_TOKEN
# Paste new token

# Deploy ulang
npm run deploy
```

### Error: 404 Not Found (GitHub)

**Penyebab:**
- Repository benar-benar tidak ada
- Repository private tapi tidak ada token
- Token belum di-set di Cloudflare Workers

**Solusi:**
```bash
# Verify token deployed
npx wrangler secret list

# Jika GITHUB_STORAGE_TOKEN tidak ada:
npx wrangler secret put GITHUB_STORAGE_TOKEN
npm run deploy
```

### Error: Video tidak play di browser

**Penyebab:**
- CORS headers tidak ada
- Content-Type bukan video/mp4
- Workers tidak bisa akses private repo

**Solusi:**
```bash
# Check Workers logs
npx wrangler tail

# Test URL manually
curl -v "https://anime-video-proxy.workers.dev/?url=https://github.com/..."

# Check response headers
# Harus ada:
# - access-control-allow-origin: *
# - content-type: video/mp4
# - accept-ranges: bytes
```

### Token Management Best Practices

**Keamanan:**
- ✅ Gunakan token dengan scope minimal (`repo` only)
- ✅ Set expiration (e.g., 90 days) dan rotate regularly
- ✅ Jangan commit token ke Git
- ✅ Gunakan Wrangler secrets, bukan environment variables

**Rotation:**
```bash
# Every 90 days (or when compromised)
# 1. Generate new token di GitHub
# 2. Update Cloudflare Workers secret
npx wrangler secret put GITHUB_STORAGE_TOKEN
# 3. Update main API .env
# 4. Restart server
```

---

## Migration Checklist

Jika Anda sudah memiliki public repositories dan ingin migrate ke private:

### Option 1: Convert Existing Repos (Recommended)

```bash
# For each repository
# 1. Go to GitHub repo settings
# 2. Scroll to "Danger Zone"
# 3. Click "Change repository visibility"
# 4. Select "Make private"
# 5. Confirm

# Repeat for:
# - anime-video-storage-1
# - anime-video-storage-2
# - anime-video-storage-3
# - ... (all storage repos)
```

### Option 2: Start Fresh (Clean Slate)

```bash
# 1. Delete all old public repos manually
# 2. Clear video_storage table
supabase db reset --db-url "your-supabase-url"

# 3. Truncate tables
DELETE FROM video_storage;
DELETE FROM video_queue;

# 4. Next GitHub Action will create new private repos automatically
```

---

## Architecture Flow

### Before (Public Repos)

```
Client → API → GitHub Public Repo → Video Stream
         ↓
         No authentication needed ✅ (but publicly accessible ❌)
```

### After (Private Repos)

```
Client → API → Cloudflare Workers (with GitHub token) → GitHub Private Repo → Video Stream
         ↓                                ↓
         ↓                         Authorization: token ghp_xxx
         ↓
         Secure, only authorized access ✅
```

### Benefits

1. **Privacy:** Video files tidak bisa diakses publik
2. **Security:** Hanya aplikasi dengan token yang bisa akses
3. **Control:** Bisa revoke token kapan saja
4. **Compliance:** Memenuhi standar privasi konten

### Trade-offs

1. **Complexity:** Setup sedikit lebih kompleks (need token)
2. **Token Management:** Perlu rotate token secara berkala
3. **Debugging:** Lebih sulit debug (need valid token)

---

## Switching Storage Account

Jika salah satu storage account down atau penuh, Anda bisa switch ke account lain **tanpa perlu ubah token Cloudflare Workers**.

### Konsep

- **10 storage accounts** di database menyimpan **URL yang sama** (mirroring)
- **Cloudflare Workers** menggunakan **1 token** untuk akses semua account
- **PRIMARY_STORAGE_ACCOUNT** di `.env` menentukan URL mana yang ditampilkan ke client

### Cara Switch Account

**Scenario:** Account-1 down, mau switch ke Account-2

#### Step 1: Edit .env
```bash
# Stop server (Ctrl+C)
nano .env

# Ubah baris ini:
# DARI:
PRIMARY_STORAGE_ACCOUNT=storage-account-1

# JADI:
PRIMARY_STORAGE_ACCOUNT=storage-account-2

# Save (Ctrl+O, Enter, Ctrl+X)
```

#### Step 2: Restart Server
```bash
bun run dev
```

**Done!** API sekarang akan return URL dari storage-account-2 ke client.

### Verifikasi

```bash
# Test API response
curl "http://localhost:3000/api/streaming/61983/3" | jq '.saved_videos[0]'

# Expected output:
# {
#   "file_name": "61983-EP003-1080p-S01.mp4",
#   "resolution": "1080p",
#   "file_size": 251158756,
#   "url": "https://github.com/user2/anime-video-storage-1/releases/download/anime-61983/file.mp4"
#   ^^^^^^^^^ account-2 username (bukan account-1)
# }
```

### Catatan Penting

**✅ TIDAK PERLU:**
- ❌ Ganti token Cloudflare Workers (tetap pakai token yang sama)
- ❌ Deploy ulang Cloudflare Workers
- ❌ Hapus database atau cache
- ❌ Re-upload video

**✅ HANYA PERLU:**
- ✅ Edit `.env` → Ganti `PRIMARY_STORAGE_ACCOUNT`
- ✅ Restart API server

**Alasan:** 
- Semua 10 account **punya file yang sama** (mirroring)
- Token bisa akses **semua account** (karena semua pakai token yang sama)
- Tinggal pilih mana yang mau ditampilkan

---

## FAQ

**Q: Apakah video lama di public repo masih bisa diakses?**

A: Ya, sampai Anda convert repo menjadi private. Setelah private, perlu token untuk akses.

---

**Q: Berapa lama token valid?**

A: Tergantung expiration yang Anda set. Bisa "No expiration" atau custom (30/60/90 days).

---

**Q: Apakah perlu token berbeda untuk GitHub Action dan Cloudflare Workers?**

A: Bisa sama atau berbeda. Untuk keamanan lebih baik, gunakan token berbeda:
- GitHub Action: Token dengan scope `repo` + `workflow`
- Cloudflare Workers: Token dengan scope `repo` only

**TAPI**, jika pakai token berbeda untuk Cloudflare Workers, pastikan token tersebut memiliki akses ke **semua 10 storage account repos**.

---

**Q: Bagaimana jika token compromised?**

A: 
1. Revoke token di GitHub Settings immediately
2. Generate new token
3. Update Cloudflare Workers: `npx wrangler secret put GITHUB_STORAGE_TOKEN`
4. Deploy ulang: `npm run deploy`
5. Update main API `.env` file
6. Restart API server

---

**Q: Apakah ada limit jumlah private repos di GitHub?**

A: 
- Free account: Unlimited private repos (dengan limit collaborators)
- Pro account: Unlimited private repos + unlimited collaborators
- Video storage repos tidak perlu collaborators, jadi free account cukup

---

**Q: Kalau 10 account semuanya pakai token yang sama, apakah aman?**

A: Ya, aman. Karena:
- Token hanya bisa akses repo milik owner token
- Jika semua 10 account adalah akun yang sama → 1 token cukup
- Jika 10 account berbeda → perlu token dengan access ke semua repos (GitHub App lebih cocok)

**Recommended Setup:**
- Gunakan 1 GitHub account dengan 10 repos berbeda
- Semua repos pakai 1 token yang sama
- Lebih mudah maintenance

---

**Q: Bagaimana cara test apakah switch account berhasil?**

A:
```bash
# 1. Cek account yang aktif sekarang
cat .env | grep PRIMARY_STORAGE_ACCOUNT
# Output: PRIMARY_STORAGE_ACCOUNT=storage-account-2

# 2. Test API
curl "http://localhost:3000/api/streaming/61983/3" | jq '.saved_videos[0].url'

# 3. Cek username di URL
# Harus sesuai dengan username dari storage-account-2 di database
```

---

**Q: Apakah bisa switch account secara otomatis jika account-1 down?**

A: Saat ini belum support auto-failover. Perlu manual switch di `.env`.

**Future enhancement:** Auto-failover dengan health check ke semua accounts.

---

## Summary

**Perubahan yang perlu dilakukan:**

1. ✅ GitHub Action sudah diupdate (otomatis buat private repo)
2. ✅ Cloudflare Workers sudah diupdate (support GitHub token)
3. ⏳ **TODO:** Deploy GitHub token ke Cloudflare Workers
4. ⏳ **TODO:** Test akses video dari private repo
5. ⏳ **TODO:** (Optional) Convert existing public repos ke private

**Estimasi waktu setup:** 10-15 menit

**Tested:** ⏳ Pending testing with actual private repository

---

## Quick Reference - Switching Storage Account

**Skenario:** Account-1 down, mau pakai Account-2

**Langkah:**
```bash
# 1. Stop server
Ctrl+C

# 2. Edit .env
PRIMARY_STORAGE_ACCOUNT=storage-account-2

# 3. Restart server
bun run dev
```

**SELESAI!** Tidak perlu:
- ❌ Ubah token Cloudflare Workers
- ❌ Deploy ulang Workers
- ❌ Hapus database
- ❌ Re-upload video

**Kenapa?** Karena:
- Semua 10 account punya file yang sama (mirroring)
- 1 token bisa akses semua account
- Tinggal pilih mana yang mau ditampilkan ke client

---

## Support

Jika ada masalah:
1. Check Cloudflare Workers logs: `npx wrangler tail`
2. Check GitHub token permissions
3. Verify token deployed: `npx wrangler secret list`
4. Test manually dengan curl
