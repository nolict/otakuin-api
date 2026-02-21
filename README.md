# Otakuin API

Unified anime streaming API with multi-source aggregation, MyAnimeList integration, and automated video storage.

## Features

- Multi-source anime data aggregation (Samehadaku + Animasu)
- MyAnimeList normalization via Jikan API
- Advanced matching algorithm with 83.3% accuracy
- Streaming links extraction with multiple providers
- Automated video storage to GitHub
- Cloudflare Workers global CDN streaming
- Database caching for optimal performance

## Installation

```bash
# Clone repository
git clone https://github.com/nolict/otakuin-api.git
cd otakuin-api

# Install dependencies
bun install

# Copy environment template
cp .env.example .env

# Configure environment variables (see docs/SETUP.md)
nano .env

# Run development server
bun run dev
```

## Quick Start

```bash
# Development mode with hot reload
bun run dev

# Production mode
bun run start

# Linting
bun run lint
bun run lint:fix

# Generate documentation
bun run docs
```

## API Endpoints

- `GET /api/home` - Latest anime listing with pagination
- `GET /api/anime/:id` - Anime details with episodes
- `GET /api/streaming/:id/:episode` - Streaming sources for episode
- `GET /api/video/:code` - Direct video access

Full API documentation available at `/docs` when server is running.

## Documentation

- [Setup Guide](docs/SETUP.md) - Database and environment configuration
- [API Reference](docs/API.md) - Complete endpoint documentation
- [Deployment Guide](docs/DEPLOYMENT.md) - PM2, Docker, and Systemd setup

## Requirements

- Bun runtime (latest version)
- Supabase account (PostgreSQL database)
- Cloudflare Workers account (optional, for video proxy)
- GitHub account (optional, for automated storage)

## Environment Variables

Required variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

SAMEHADAKU_BASE_URL=https://v1.samehadaku.how
ANIMASU_BASE_URL=https://v0.animasu.app
```

See `.env.example` for complete configuration options.

## Tech Stack

- Runtime: Bun
- Framework: ElysiaJS
- Database: Supabase (PostgreSQL)
- CDN: Cloudflare Workers
- Parser: Cheerio

## License

MIT
