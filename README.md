# Otakuin API

**Unified anime streaming API with multi-source aggregation, intelligent matching, and automated video storage.**

Production-ready REST API for anime streaming with MyAnimeList integration, multi-provider video sources, and global CDN delivery via Cloudflare Workers.

---

## Features

### Core Functionality
- **Multi-Source Aggregation** - Combines data from Samehadaku and Animasu
- **MyAnimeList Normalization** - All anime mapped to MAL IDs via Jikan API v4
- **Advanced Matching Algorithm** - 4-layer validation with 83.3% accuracy
- **Intelligent Caching** - Multi-tier caching (20min/6hr TTL) for 99% faster responses

### Video Streaming
- **Multiple Providers** - WibuFile, Filedon, BerkasDrive, MP4Upload, Mega.nz
- **Automated Storage** - GitHub Actions upload to multiple accounts
- **Global CDN** - Cloudflare Workers streaming (200+ edge locations)
- **Private Repositories** - Secure video storage with asset ID system

### Performance
- **99% Cache Hit Rate** - Database-backed caching with auto-expiration
- **Parallel Processing** - Concurrent scraping and matching
- **Request Timeout Protection** - 10-second timeout prevents hanging
- **Range Request Support** - Video seeking/skipping enabled

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime (latest version)
- [Supabase](https://supabase.com) account (free tier)
- [Cloudflare Workers](https://workers.cloudflare.com) account (optional, 100k free requests/day)
- GitHub account (optional, for video storage)

### Installation

```bash
# Clone repository
git clone https://github.com/nolict/otakuin-api.git
cd otakuin-api

# Install dependencies
bun install

# Setup environment
cp .env.example .env
nano .env  # Configure required variables

# Run development server
bun run dev
```

Server starts at `http://localhost:3000`

Interactive API docs at `http://localhost:3000/api/docs`

---

## Documentation

### Setup Guides

Complete the setup in this order:

1. **[Database Setup](docs/DATABASE-SETUP.md)** - Configure Supabase PostgreSQL
2. **[Cloudflare Workers Setup](docs/WORKERS-SETUP.md)** - Deploy video streaming proxy
3. **[GitHub Action Setup](docs/GITHUB-ACTION-SETUP.md)** - Setup automated video uploads
4. **[Token Management](docs/TOKEN-MANAGEMENT.md)** - Generate and rotate tokens

### Reference Documentation

- **[API Reference](docs/API.md)** - Complete endpoint documentation with examples
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment (PM2/Docker/Systemd)

---

## API Overview

### Base URL
```
http://localhost:3000/api
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/home` | GET | Latest anime listings with pagination |
| `/anime/:id` | GET | Anime details with episodes (MAL ID) |
| `/streaming/:id/:episode` | GET | Streaming sources for specific episode |
| `/video/:code` | GET | Direct video access (proxy) |
| `/docs` | GET | Interactive Swagger documentation |

### Example Request

```bash
# Get anime details
curl "http://localhost:3000/api/anime/60285"

# Get streaming sources
curl "http://localhost:3000/api/streaming/60285/1"
```

**Full documentation:** [API Reference](docs/API.md)

---

## Configuration

### Required Environment Variables

```env
# Database
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Scraper Sources
SAMEHADAKU_BASE_URL=https://v1.samehadaku.how
ANIMASU_BASE_URL=https://v0.animasu.app
```

### Optional Configuration

```env
# Logging
LOG_LEVEL=INFO  # DEBUG | INFO | WARN | ERROR | SILENT

# GitHub Action (for video storage)
GITHUB_ACTION_TOKEN=ghp_xxx
GITHUB_ACTION_REPO=username/repo

# Cloudflare Workers (for video streaming)
WORKER_VIDEO_PROXY_URL=https://anime-video-proxy.workers.dev

# Storage
PRIMARY_STORAGE_ACCOUNT=storage-account-1
```

See [.env.example](.env.example) for complete configuration.

---

## Development

### Available Scripts

```bash
# Development with hot reload
bun run dev

# Production mode
bun run start

# Code quality
bun run lint        # Check for issues
bun run lint:fix    # Auto-fix formatting

# Documentation
bun run docs        # Generate API docs from Swagger
```

### Code Quality

- **TypeScript Strict Mode** - Full type safety
- **ESLint Configuration** - 60+ rules enforcing best practices
- **No `any` Types** - Explicit typing required
- **Import Management** - Automatic ordering and grouping

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh) |
| Framework | [ElysiaJS](https://elysiajs.com) v1.0 |
| Database | [Supabase](https://supabase.com) (PostgreSQL) |
| CDN | [Cloudflare Workers](https://workers.cloudflare.com) |
| Scraping | [Cheerio](https://cheerio.js.org) v1.0 |
| API Client | [Jikan](https://jikan.moe) v4 (MyAnimeList) |
| Automation | GitHub Actions |

### System Design

```
User Request
    ↓
ElysiaJS API Server
    ↓
Database Cache (Supabase) ← 99% cache hit rate
    ↓ (cache miss)
Parallel Scraping (Samehadaku + Animasu)
    ↓
Jikan API (MyAnimeList normalization)
    ↓
Advanced Matching Algorithm
    ↓
Save to Database
    ↓
Return Unified Response
```

**Video Streaming Flow:**
```
User → API → Extract Video URL → Queue for Upload
              ↓
GitHub Action → Download → Upload to Storage Accounts
              ↓
Cloudflare Workers → Stream to User (Global CDN)
```

---

## Performance

### Benchmarks

| Operation | Cache Hit | Cache Miss | Improvement |
|-----------|-----------|------------|-------------|
| Anime Details | ~100ms | ~7-10s | 99% faster |
| Streaming Links | ~100ms | ~2-3s | 95% faster |
| Home Page | ~100ms | ~28s | 99.6% faster |

### Optimization Features

- **Multi-tier caching** (20min metadata, 6hr video URLs)
- **Parallel scraping** from multiple sources
- **Automatic cleanup** of expired cache
- **Request timeout** protection (10 seconds)
- **Database indexing** for fast lookups

---

## Production Deployment

### Quick Deploy (PM2)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start bun --name "otakuin-api" -- run start

# Auto-restart on reboot
pm2 startup
pm2 save
```

**Complete guide:** [Deployment Guide](docs/DEPLOYMENT.md)

### Docker Support

```bash
# Build image
docker build -t otakuin-api .

# Run container
docker run -p 3000:3000 --env-file .env otakuin-api
```

---

## Security

- **Private repositories** for video storage
- **Token rotation** guide included
- **Environment variables** for all secrets
- **No hardcoded credentials** in codebase
- **Rate limiting** ready (configurable)

See [Token Management Guide](docs/TOKEN-MANAGEMENT.md) for security best practices.

---

## Contributing

Contributions welcome! Please follow:

1. **Code style** - Run `bun run lint:fix` before commit
2. **Documentation** - Update relevant docs for new features
3. **Testing** - Verify changes don't break existing functionality

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

## Support

- **Documentation:** Check [docs/](docs/) folder for detailed guides
- **Issues:** Create issue on GitHub repository
- **Architecture:** Review [AGENTS.md](AGENTS.md) for project details

---

**Version:** 1.18.0  
**Status:** Production Ready
