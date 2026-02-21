# Cloudflare Workers Setup Guide

Complete guide for deploying video streaming proxy to Cloudflare Workers.

---

## Overview

Cloudflare Workers provides a serverless video proxy that:

- **Global CDN** - 200+ edge locations worldwide
- **Zero server load** - All video streaming offloaded from your API
- **Free tier** - 100,000 requests/day at no cost
- **Auto-scaling** - Handles unlimited concurrent requests
- **CORS built-in** - Cross-origin streaming support
- **Private repo support** - Access GitHub private repositories

---

## Prerequisites

- Cloudflare account (free tier available at [cloudflare.com](https://cloudflare.com))
- Node.js 18+ installed
- GitHub storage account token (see [Token Management](./TOKEN-MANAGEMENT.md))

---

## Step 1: Install Wrangler CLI

Wrangler is Cloudflare's official CLI for Workers deployment.

```bash
# Install globally
npm install -g wrangler

# Verify installation
wrangler --version
# Output: ⛅️ wrangler 4.66.0
```

---

## Step 2: Login to Cloudflare

```bash
cd workers/video-proxy
npx wrangler login
```

**What happens:**
1. Browser opens with Cloudflare login page
2. Authorize Wrangler to access your account
3. Terminal shows: `✨ Successfully logged in`

---

## Step 3: Review Configuration

Open `workers/video-proxy/wrangler.toml`:

```toml
name = "anime-video-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.production]
name = "anime-video-proxy"
workers_dev = false

[env.development]
name = "anime-video-proxy-dev"
workers_dev = true
```

**Configuration explained:**
- `name` - Worker name (will be subdomain: `anime-video-proxy.workers.dev`)
- `main` - Entry point file
- `workers_dev` - Enable/disable workers.dev subdomain
- `[env.production]` - Production environment settings
- `[env.development]` - Development environment settings

**Customization (optional):**
```toml
# Change worker name (subdomain will change too)
name = "my-video-proxy"
# Subdomain: my-video-proxy.your-subdomain.workers.dev
```

---

## Step 4: Install Dependencies

```bash
cd workers/video-proxy
npm install
```

**Dependencies installed:**
- `wrangler` - Cloudflare Workers CLI
- `@cloudflare/workers-types` - TypeScript definitions

---

## Step 5: Set GitHub Token Secret

Workers needs your **storage account token** to access private GitHub repos.

**Get your token:**
1. See [Token Management Guide](./TOKEN-MANAGEMENT.md#token-2-storage-account-token)
2. Copy the storage account token (e.g., from @demamtinggi1)

**Deploy secret:**

```bash
echo "ghp_YOUR_STORAGE_ACCOUNT_TOKEN" | npx wrangler secret put GITHUB_STORAGE_TOKEN
```

**Expected output:**
```
🌀 Creating the secret for the Worker "anime-video-proxy"
✨ Success! Uploaded secret GITHUB_STORAGE_TOKEN
```

**Verify secret:**

```bash
npx wrangler secret list
```

**Output:**
```json
[
  {
    "name": "GITHUB_STORAGE_TOKEN",
    "type": "secret_text"
  }
]
```

⚠️ **Important:** Token value is encrypted and cannot be viewed after upload.

---

## Step 6: Test Locally (Optional)

Before deploying to production, test locally:

```bash
npm run dev
```

**Output:**
```
⛅️ wrangler 4.66.0
------------------
Your worker has access to the following bindings:
- Vars:
  - GITHUB_STORAGE_TOKEN: "(hidden)"

⎔ Starting local server...
Ready on http://localhost:8787
```

**Test locally:**

```bash
# Test with a video URL (must be encoded)
curl "http://localhost:8787/?url=https%3A%2F%2Fs0.wibufile.com%2Fvideo01%2Ftest.mp4"

# Or test with browser
open http://localhost:8787/?url=https%3A%2F%2Fs0.wibufile.com%2Fvideo01%2Ftest.mp4
```

**Stop local server:** Press `Ctrl+C`

---

## Step 7: Deploy to Production

Deploy to Cloudflare's global network:

```bash
npm run deploy
```

**Or deploy explicitly:**

```bash
npx wrangler deploy
```

**Expected output:**
```
Total Upload: xx.xx KiB / gzip: xx.xx KiB
Uploaded anime-video-proxy (x.xx sec)
Deployed anime-video-proxy triggers (x.xx sec)
  https://anime-video-proxy.your-subdomain.workers.dev
Current Version ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Save your Workers URL:**

```bash
# Copy the URL from deployment output
https://anime-video-proxy.your-subdomain.workers.dev
```

---

## Step 8: Update API Configuration

Add Workers URL to your main API `.env`:

```bash
# Edit .env in project root
WORKER_VIDEO_PROXY_URL=https://anime-video-proxy.your-subdomain.workers.dev
```

**Restart API server:**

```bash
# Stop server (Ctrl+C)
bun run dev
```

---

## Step 9: Test End-to-End

Test complete flow from API to Workers to GitHub:

**1. Get streaming URL:**

```bash
curl "http://localhost:3000/api/streaming/60285/1" | jq '.saved_videos[0].url'
```

**Output:**
```
"https://anime-video-proxy.workers.dev/?url=https%3A%2F%2Fapi.github.com%2Frepos%2F..."
```

**2. Test Workers proxy:**

```bash
curl -I "https://anime-video-proxy.workers.dev/?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fdemamtinggi1%2Fanime-video-storage-1%2Freleases%2Fassets%2F359678354"
```

**Expected output:**
```
HTTP/2 200 
content-type: video/mp4
content-length: 83597228
accept-ranges: bytes
access-control-allow-origin: *
```

✅ **Success!** Video streaming works through Cloudflare Workers!

---

## Workers URL Formats

Workers supports multiple video providers:

### GitHub Private Repos (with asset_id)
```
https://anime-video-proxy.workers.dev/?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fuser%2Frepo%2Freleases%2Fassets%2F123456
```

### Direct MP4 URLs
```
https://anime-video-proxy.workers.dev/?url=https%3A%2F%2Fs0.wibufile.com%2Fvideo01%2Ffile.mp4
```

### Cloudflare R2 (Filedon)
```
https://anime-video-proxy.workers.dev/?url=https%3A%2F%2Ffiledon.r2.cloudflarestorage.com%2F...
```

**URL Encoding:**
```bash
# Encode URL before passing to Workers
# Use online tool: https://www.urlencoder.org/
# Or use JavaScript: encodeURIComponent("https://...")
```

---

## Monitoring & Debugging

### View Real-Time Logs

```bash
cd workers/video-proxy
npx wrangler tail
```

**Output shows:**
- Request URLs
- Response status codes
- Errors and exceptions
- Performance metrics

**Stop tailing:** Press `Ctrl+C`

---

### View Deployment History

```bash
npx wrangler deployments list
```

**Output:**
```
Deployment ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Created on:    2026-02-21 12:00:00
Author:        your-email@example.com
```

---

### Check Worker Analytics

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages**
3. Click on your worker: `anime-video-proxy`
4. View **Metrics** tab

**Metrics available:**
- Requests per second
- Success rate (200 OK)
- Error rate (4xx, 5xx)
- CPU time usage
- Bandwidth usage

---

## Updating Workers

When you make code changes:

**1. Edit source files:**
```bash
cd workers/video-proxy/src
# Edit index.ts
```

**2. Test locally:**
```bash
npm run dev
```

**3. Deploy update:**
```bash
npm run deploy
```

**4. Verify:**
```bash
# Test updated worker
curl -I "https://anime-video-proxy.workers.dev/?url=..."
```

---

## Custom Domain (Optional)

Map Workers to your own domain:

**Prerequisites:**
- Domain registered on Cloudflare
- SSL certificate (automatic with Cloudflare)

**Steps:**

1. Go to Cloudflare Dashboard → **Workers & Pages**
2. Click your worker: `anime-video-proxy`
3. Go to **Settings** → **Triggers** → **Custom Domains**
4. Click **Add Custom Domain**
5. Enter: `video.yourdomain.com`
6. Click **Add domain**
7. Wait for DNS propagation (~5 minutes)

**Update .env:**
```bash
WORKER_VIDEO_PROXY_URL=https://video.yourdomain.com
```

---

## Troubleshooting

### Problem: 403 Forbidden from GitHub API

**Cause:** Missing or invalid storage account token

**Solution:**

```bash
# Delete old secret
npx wrangler secret delete GITHUB_STORAGE_TOKEN

# Upload new secret
echo "ghp_NEW_TOKEN" | npx wrangler secret put GITHUB_STORAGE_TOKEN

# Deploy
npx wrangler deploy
```

---

### Problem: 404 Not Found

**Cause:** Video URL invalid or asset doesn't exist

**Solution:**
1. Verify asset_id exists in GitHub repo
2. Check if repo is accessible with token
3. Test manual access:

```bash
curl -I -H "Authorization: token ghp_XXX" \
  "https://api.github.com/repos/user/repo/releases/assets/123456"
```

---

### Problem: CORS errors in browser

**Cause:** Workers not returning CORS headers

**Solution:**
1. Check Workers code has:
```typescript
headers['Access-Control-Allow-Origin'] = '*';
```

2. Redeploy Workers:
```bash
npx wrangler deploy
```

---

### Problem: "wrangler: command not found"

**Cause:** Wrangler not installed or not in PATH

**Solution:**

```bash
# Install globally
npm install -g wrangler

# Or use npx (no global install needed)
npx wrangler login
npx wrangler deploy
```

---

### Problem: Deployment fails with "unauthorized"

**Cause:** Not logged in to Cloudflare

**Solution:**

```bash
npx wrangler login
# Browser opens → Authorize Wrangler
```

---

## Performance Optimization

### Enable Caching

Workers already configured with caching:

```typescript
cf: {
  cacheTtl: 3600,        // Cache for 1 hour
  cacheEverything: true  // Cache all responses
}
```

**Cache behavior:**
- First request: Fetch from origin (slow)
- Subsequent requests: Serve from edge cache (fast)
- Cache expires after 1 hour

---

### Purge Cache (if needed)

```bash
# Purge all cache for your worker
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purge_everything":true}'
```

---

## Cost & Limits

### Free Tier Limits

- **Requests:** 100,000 requests/day
- **CPU Time:** 10ms per request
- **Memory:** 128MB
- **Script Size:** 1MB after compression

### Paid Plan ($5/month)

- **Requests:** 10,000,000 requests/month
- **CPU Time:** 50ms per request
- **Memory:** 128MB
- **Script Size:** 10MB

**Current usage check:**
```bash
# Go to Cloudflare Dashboard → Workers & Pages → Analytics
```

---

## Security Best Practices

1. **Rotate tokens** every 90 days (see [Token Management](./TOKEN-MANAGEMENT.md))
2. **Use secrets** for all sensitive data (never hardcode tokens)
3. **Monitor logs** for suspicious activity
4. **Enable rate limiting** (optional, requires Cloudflare rate limiting rules)
5. **Restrict origins** if serving specific domains only

---

## Next Steps

After Workers setup is complete:

1. **[GitHub Action Setup](./GITHUB-ACTION-SETUP.md)** - Setup video upload automation
2. **[API Deployment](./DEPLOYMENT.md)** - Deploy main API server
3. **[Token Management](./TOKEN-MANAGEMENT.md)** - Manage and rotate tokens

---

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Workers Examples](https://developers.cloudflare.com/workers/examples/)
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
