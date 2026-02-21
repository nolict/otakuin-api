# Token Management Guide

## Overview

This project uses **2 different GitHub tokens** for different purposes:

1. **Workers Account Token** - For GitHub Action to upload videos
2. **Storage Account Token** - For Cloudflare Workers to stream videos

---

## Token 1: Workers Account Token

**Purpose:** GitHub Action uses this to upload videos to storage accounts

**Where to use:**
- `GITHUB_ACTION_TOKEN` in `.env`
- `STORAGE_ACCOUNTS` environment variable in GitHub Action

**How to generate:**
1. Login to **Workers GitHub account**
2. Go to: Settings → Developer settings → Personal access tokens → Tokens (classic)
3. Click "Generate new token (classic)"
4. Name: `GitHub Action Upload Token`
5. Scopes: **repo** (full control)
6. Generate token → Copy `ghp_XXX...`

**How to deploy:**

**For API Server (.env):**
```bash
# Edit .env file
GITHUB_ACTION_TOKEN=ghp_YOUR_WORKERS_ACCOUNT_TOKEN
```

**For GitHub Action:**
1. Go to your GitHub Action repository settings
2. Settings → Secrets and variables → Actions
3. New repository secret: `STORAGE_ACCOUNTS`
4. Value:
```json
[
  {
    "name": "storage-account-1",
    "username": "demamtinggi1",
    "token": "ghp_YOUR_WORKERS_ACCOUNT_TOKEN"
  },
  {
    "name": "storage-account-2",
    "username": "username2",
    "token": "ghp_YOUR_WORKERS_ACCOUNT_TOKEN"
  }
]
```

---

## Token 2: Storage Account Token

**Purpose:** Cloudflare Workers uses this to download videos from private repos

**Where to use:**
- Cloudflare Workers secret: `GITHUB_STORAGE_TOKEN`

**How to generate:**
1. Login to **Storage GitHub account** (e.g., @demamtinggi1)
2. Go to: Settings → Developer settings → Personal access tokens → Tokens (classic)
3. Click "Generate new token (classic)"
4. Name: `Cloudflare Workers Access Token`
5. Scopes: **repo** (full control)
6. Generate token → Copy `ghp_XXX...`

**How to deploy:**

**For Cloudflare Workers:**
```bash
cd workers/video-proxy
echo "ghp_YOUR_STORAGE_ACCOUNT_TOKEN" | npx wrangler secret put GITHUB_STORAGE_TOKEN
# Output: ✨ Success! Uploaded secret GITHUB_STORAGE_TOKEN
```

**Verify:**
```bash
npx wrangler secret list
# Should show: GITHUB_STORAGE_TOKEN
```

---

## Token Rotation Guide

### When to rotate tokens:
- Every 90 days (security best practice)
- If token is leaked
- When changing storage accounts

### How to rotate Workers Account Token:

**Step 1: Generate new token** (see Token 1 guide above)

**Step 2: Update .env**
```bash
# Edit .env
GITHUB_ACTION_TOKEN=ghp_NEW_WORKERS_TOKEN
```

**Step 3: Update GitHub Action Secret**
```bash
# Go to GitHub repo → Settings → Secrets → Actions
# Edit STORAGE_ACCOUNTS secret
# Replace old token with new token in JSON
```

**Step 4: Restart API server**
```bash
# Stop server (Ctrl+C)
bun run dev
```

**Step 5: Test**
```bash
# Trigger a video upload
curl "http://localhost:3000/api/streaming/60285/1"
# Check GitHub Action logs - should see successful upload
```

---

### How to rotate Storage Account Token:

**Step 1: Generate new token** (see Token 2 guide above)

**Step 2: Delete old secret**
```bash
cd workers/video-proxy
npx wrangler secret delete GITHUB_STORAGE_TOKEN
```

**Step 3: Upload new secret**
```bash
echo "ghp_NEW_STORAGE_TOKEN" | npx wrangler secret put GITHUB_STORAGE_TOKEN
```

**Step 4: Deploy Workers** (to refresh secret)
```bash
npx wrangler deploy
```

**Step 5: Test**
```bash
# Get a saved video URL
curl "http://localhost:3000/api/streaming/60285/1" | jq '.saved_videos[0].url'

# Test streaming (copy URL from above)
curl -I "https://anime-video-proxy.workers.dev/?url=..."
# Expected: HTTP/2 200
```

---

## Troubleshooting

### Problem: GitHub Action fails with 401 Unauthorized

**Cause:** Workers account token invalid or expired

**Solution:**
1. Generate new token from Workers account
2. Update `GITHUB_ACTION_TOKEN` in `.env`
3. Update `STORAGE_ACCOUNTS` in GitHub Secrets
4. Restart API server

---

### Problem: Cloudflare Workers returns 403 Forbidden

**Cause:** Storage account token invalid or missing User-Agent

**Solution:**
1. Generate new token from Storage account
2. Delete old secret: `npx wrangler secret delete GITHUB_STORAGE_TOKEN`
3. Upload new secret: `echo "TOKEN" | npx wrangler secret put GITHUB_STORAGE_TOKEN`
4. Deploy Workers: `npx wrangler deploy`
5. Test again

---

### Problem: "name already exists" error in GitHub Action

**Cause:** Normal! This happens when repo already exists

**Solution:** No action needed. The code has try-catch to handle this. Check logs for:
```
⚠️  Repository anime-video-storage-1 already exists, using it...
```

This is expected and safe! ✅

---

## Security Best Practices

1. **Never commit tokens** to git (use .env and .gitignore)
2. **Use minimum scopes** - Only `repo` scope needed
3. **Rotate tokens regularly** - Every 90 days recommended
4. **Use different tokens** for different purposes (Workers vs Storage)
5. **Revoke tokens** immediately if leaked
6. **Monitor token usage** - Check GitHub Settings → Developer settings → Personal access tokens

---

## Token Summary Table

| Token | Account | Used By | Where Deployed | Scope |
|-------|---------|---------|----------------|-------|
| Workers Account Token | GitHub Workers Account | GitHub Action | `.env` + GitHub Secrets | `repo` |
| Storage Account Token | GitHub Storage Account | Cloudflare Workers | Wrangler Secret | `repo` |

---

## Quick Reference

**Check Wrangler secrets:**
```bash
cd workers/video-proxy
npx wrangler secret list
```

**Set Wrangler secret:**
```bash
echo "TOKEN_VALUE" | npx wrangler secret put GITHUB_STORAGE_TOKEN
```

**Delete Wrangler secret:**
```bash
npx wrangler secret delete GITHUB_STORAGE_TOKEN
```

**Deploy Workers:**
```bash
npx wrangler deploy
```

**Test Workers:**
```bash
curl -I "https://anime-video-proxy.workers.dev/?url=ENCODED_GITHUB_URL"
```
