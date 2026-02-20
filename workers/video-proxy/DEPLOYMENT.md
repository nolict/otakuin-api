# Deployment Guide - Step by Step

## Step 1: Install Dependencies

```bash
cd workers/video-proxy
npm install
```

Expected output:
```
added 150 packages in 10s
```

## Step 2: Login to Cloudflare

```bash
npx wrangler login
```

Browser akan terbuka → Login dengan Cloudflare account → Allow access

Expected output:
```
✅ Successfully logged in
```

## Step 3: Deploy to Production

```bash
npm run deploy
```

Expected output:
```
⛅️ wrangler 3.78.12
------------------
Total Upload: 2.34 KiB / gzip: 0.89 KiB
Uploaded anime-video-proxy (1.23 sec)
Published anime-video-proxy (1.45 sec)
  https://anime-video-proxy.abcd1234.workers.dev
Current Deployment ID: 12345678-1234-1234-1234-123456789abc
```

**SIMPAN URL INI!** → `https://anime-video-proxy.abcd1234.workers.dev`

## Step 4: Test Worker

```bash
# Test basic request
curl -I "https://anime-video-proxy.abcd1234.workers.dev/?url=https://s0.wibufile.com/video01/test.mp4"
```

Expected response:
```
HTTP/2 200 
content-type: video/mp4
access-control-allow-origin: *
accept-ranges: bytes
```

## Step 5: Update Main API .env

```bash
# Kembali ke root project
cd ../..

# Tambahkan WORKER_VIDEO_PROXY_URL
echo "WORKER_VIDEO_PROXY_URL=https://anime-video-proxy.abcd1234.workers.dev" >> .env
```

Verify:
```bash
cat .env | grep WORKER
```

Expected output:
```
WORKER_VIDEO_PROXY_URL=https://anime-video-proxy.abcd1234.workers.dev
```

## Step 6: Restart API Server

```bash
# Stop server (Ctrl+C)
# Start server
bun run dev
```

Expected logs:
```
🦊 Server is running at localhost:3000
[INFO] Worker video proxy URL: https://anime-video-proxy.abcd1234.workers.dev
```

## Step 7: Test Integration

```bash
# Test streaming endpoint
curl "http://localhost:3000/api/streaming/61983/1" | jq '.sources[0]'
```

Expected response:
```json
{
  "code": "abc123",
  "provider": "samehadaku",
  "url": "https://...",
  "url_video": "https://anime-video-proxy.abcd1234.workers.dev/?url=https://...",
  "resolution": "1080p",
  "server": "1",
  "storage_type": "cloudflare"
}
```

**✅ url_video sudah pakai Workers URL!**

## Verification Checklist

- [ ] Workers deployed successfully
- [ ] Test curl returns 200 OK
- [ ] .env updated with WORKER_VIDEO_PROXY_URL
- [ ] API server restarted
- [ ] Streaming response shows Workers URL

## Troubleshooting

### Issue: "Not authenticated"

```bash
npx wrangler login
```

### Issue: "Failed to publish"

Check `wrangler.toml`:
```toml
name = "anime-video-proxy"
main = "src/index.ts"
```

### Issue: "Module not found"

```bash
npm install
```

### Issue: URL not updated in response

```bash
# Stop server (Ctrl+C)
# Restart server
bun run dev
```

## Next Steps

1. Monitor usage di Cloudflare Dashboard
2. Check logs: `npx wrangler tail`
3. Update worker: `npm run deploy`

## Custom Domain (Advanced)

### Prerequisites
- Domain di Cloudflare DNS
- Workers Paid Plan ($5/month)

### Steps

1. Edit `wrangler.toml`:
```toml
[env.production]
name = "anime-video-proxy"
routes = [
  { pattern = "video.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

2. Add DNS record (Cloudflare Dashboard):
```
Type: CNAME
Name: video
Target: anime-video-proxy.abcd1234.workers.dev
Proxy: On (orange cloud)
```

3. Deploy:
```bash
npm run deploy
```

4. Update .env:
```bash
WORKER_VIDEO_PROXY_URL=https://video.yourdomain.com
```

5. Test:
```bash
curl -I "https://video.yourdomain.com/?url=https://..."
```
