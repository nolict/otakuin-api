# Anime Video Proxy - Cloudflare Workers

Cloudflare Workers untuk streaming video anime dengan dukungan:
- ✅ Range requests (seeking/skipping)
- ✅ HLS playlist proxy
- ✅ CORS headers
- ✅ Global CDN (200+ locations)
- ✅ Auto-scaling unlimited
- ✅ Free tier: 100,000 requests/day

## Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI

## Installation

```bash
cd workers/video-proxy
npm install
```

## Development

```bash
# Test locally
npm run dev

# Visit: http://localhost:8787/?url=https://...
```

## Deployment

### 1. Login ke Cloudflare (first time only)

```bash
npx wrangler login
```

### 2. Deploy ke Production

```bash
npm run deploy
```

Output:
```
Published anime-video-proxy (1.23 sec)
  https://anime-video-proxy.your-subdomain.workers.dev
```

### 3. Update Main API .env

```bash
# Di root project (bukan di workers/)
echo "WORKER_VIDEO_PROXY_URL=https://anime-video-proxy.your-subdomain.workers.dev" >> .env
```

### 4. Restart API Server

```bash
# Di root project
bun run dev
```

## Testing

```bash
# Test video proxy
curl -I "https://anime-video-proxy.your-subdomain.workers.dev/?url=https://s0.wibufile.com/video01/test.mp4"

# Test range request
curl -H "Range: bytes=0-1000" "https://anime-video-proxy.your-subdomain.workers.dev/?url=https://..."
```

## Environment

**Production:**
- URL: `https://anime-video-proxy.your-subdomain.workers.dev`
- Auto-scaling unlimited
- Global CDN caching

**Development:**
- URL: `https://anime-video-proxy-dev.your-subdomain.workers.dev`
- Same as production but separate deployment

## Supported Providers

| Provider | Method | Notes |
|----------|--------|-------|
| WibuFile | Direct MP4 | ✅ Working |
| Filedon | Cloudflare R2 | ✅ Working |
| BerkasDrive | CDN Direct | ✅ Working |
| MP4Upload | SSL Bypass + Referer | ✅ Working |
| Mega.nz | Direct stream | ✅ Working |
| VidHidePro | HLS Proxy | ⚠️ Requires session |

## Architecture

```
Client → Cloudflare Workers → Video Source
  ↓
  ↓ (Proxy headers, CORS, Range support)
  ↓
Client receives video stream
```

## Troubleshooting

**Error: "Missing url parameter"**
- Solution: Add `?url=https://...` to request

**Error: 403 Forbidden**
- VidHidePro: Requires browser session (not supported)
- MP4Upload: Workers handles Referer header automatically

**Error: Worker exceeded CPU limit**
- Solution: Video proxy is lightweight, should not happen
- Check if request is HLS playlist (processing overhead)

## Limits

| Resource | Free Tier | Pro ($5/month) |
|----------|-----------|----------------|
| Requests/day | 100,000 | 10,000,000 |
| CPU time | 10ms | 50ms |
| Memory | 128MB | 128MB |
| Worker size | 1MB | 10MB |

## Custom Domain (Optional)

```bash
# wrangler.toml
[env.production]
routes = [
  { pattern = "video.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

Deploy:
```bash
npm run deploy
```

Access: `https://video.yourdomain.com/?url=...`
