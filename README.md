# Anime Scraper API

A modular, production-ready API ecosystem for scraping anime content from multiple Indonesian sources with intelligent metadata-based matching. Built with modern TypeScript and optimized for the Bun runtime.

## Overview

This project provides a unified API for accessing anime information from multiple sources (Samehadaku, Animasu) using MyAnimeList as the source of truth. Features an advanced matching algorithm that scores anime based on metadata comparison.

### Key Features

- **Multi-Source Unified API**: Single endpoint returning episodes from multiple sources
- **Intelligent Matching**: Advanced 4-layer metadata-based algorithm (83.3% accuracy)
- **Database Caching**: Supabase integration with 20-minute TTL for 99% faster responses
- **Permanent Slug Storage**: Eliminates repeated slug discovery after first request
- **MyAnimeList Integration**: Uses Jikan API v4 as source of truth
- **Slug Detection**: Smart variation generator for season-based anime (Part/Cour/Season/Roman numerals)
- **Fuzzy Matching**: 70% similarity threshold for flexible slug detection
- **Episode Merging**: Combines episodes from all sources by episode number
- **Blogger Video Extraction**: Extract direct Google Video URLs from Blogger embeds
- **Video Proxy System**: Stream IP-locked videos through server proxy
- **Type-Safe**: Full TypeScript strict mode with comprehensive type definitions
- **Developer-Friendly**: Includes DOM inspection tools for rapid scraper development
- **Production-Ready**: Robust error handling and structured responses
- **Code Quality**: 60+ ESLint rules enforcing best practices

## Technology Stack

- **Runtime**: Bun
- **Language**: TypeScript (Strict Mode)
- **Framework**: ElysiaJS
- **Database**: Supabase (PostgreSQL)
- **Scraping**: Cheerio
- **Code Quality**: ESLint with TypeScript configuration

## Installation

### Prerequisites

- Bun runtime installed ([installation guide](https://bun.sh/docs/installation))

### Setup

```bash
# Clone the repository
git clone https://github.com/nolict/otakuin-api
cd otakuin-api

# Install dependencies
bun install

# Configure environment variables
cp .env.example .env
# Edit .env with your Supabase credentials
```

For detailed setup instructions including database configuration, see [SETUP.md](SETUP.md).

## Usage

### Running the Server

```bash
# Development mode (with hot reload)
bun run dev

# Production mode
bun start
```

The server will start on `http://localhost:3000`

### DOM Inspection Tool

Use the scan utility to analyze website structure before implementing scrapers:

```bash
bun scan <url>

# Example
bun scan https://v1.samehadaku.how/anime-terbaru/
```

This tool provides:
- Document statistics
- Important structural elements
- All CSS classes with usage counts
- All element IDs
- Text content previews

### Code Quality

This project enforces strict code quality standards with 60+ ESLint rules covering type safety, import management, modern syntax, and formatting.

```bash
# Run linter
bun run lint

# Auto-fix issues
bun run lint:fix
```

**Key Standards:**
- Explicit return types required
- No `any` types allowed
- Organized imports with type separation
- Nullish coalescing (`??`) and optional chaining (`?.`)
- Consistent formatting (2 spaces, single quotes)

All rules are enforced via ESLint with 60+ comprehensive rules.

## API Documentation

### Base URL

```
http://localhost:3000
```

### Endpoints

#### GET /

Returns API information and available endpoints.

**Response:**
```json
{
  "message": "Anime Scraper API",
  "version": "1.0.0",
  "endpoints": {
    "home": "/api/home"
  }
}
```

#### GET /api/home

Scrapes the latest anime releases from Samehadaku.

**Response:**
```json
[
  {
    "slug": "anime-slug",
    "animename": "Anime Title",
    "coverurl": "https://example.com/cover.jpg"
  }
]
```

**Error Response:**
```json
{
  "error": "Error message",
  "data": []
}
```

**Status Codes:**
- `200`: Success
- `500`: Scraping error (returns error object)

#### GET /api/streaming/:mal_id/:episode

Get streaming video sources for a specific anime episode.

**Parameters:**
- `mal_id`: MyAnimeList ID (integer)
- `episode`: Episode number (integer)

**Response:**
```json
{
  "mal_id": 21,
  "episode": 1,
  "sources": [
    {
      "provider": "animasu",
      "url": "https://www.blogger.com/video.g?token=...",
      "url_video": "https://googlevideo.com/videoplayback?...",
      "resolution": "480p",
      "server": "1"
    },
    {
      "provider": "samehadaku",
      "url": "https://example.com/embed",
      "url_video": null,
      "resolution": "360p"
    }
  ]
}
```

**Notes:**
- Sources with `url_video` field have direct video URLs extracted
- Use `/api/video-proxy` endpoint to stream videos (required for IP-locked URLs)

#### GET /api/video-proxy?url={encoded_video_url}

Proxy endpoint for streaming IP-locked video URLs.

**Query Parameters:**
- `url`: URL-encoded video URL from `url_video` field

**Response:**
- Binary video stream (video/mp4)
- Supports Range headers for seeking

**Example Usage:**
```javascript
const source = response.sources[0];
const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(source.url_video)}`;
videoElement.src = proxyUrl;
```

## Application Integration

For detailed integration guides with Flutter, React, and other frameworks, see:

📖 **[Application Integration Guide](DOC-APPS.md)**

Includes:
- Complete Flutter implementation with video player
- React/Next.js integration examples
- API response schemas and error handling
- Troubleshooting common issues

## Testing

### HTML Test Interface

A web-based test interface is included for testing the streaming API:

```bash
# Start API server
bun run dev

# In another terminal, start test server
cd scripts
python3 -m http.server 8080
```

Open `http://localhost:8080/video-test.html` in your browser.

**Features:**
- Fetch streaming sources by MAL ID and episode
- Display all available video sources
- Play videos directly with HTML5 player
- Simple Linux-style UI

## Project Structure

```
anime-scraper-api/
├── src/
│   ├── api/              # Route handlers
│   │   └── home.ts
│   ├── services/         # Scraping logic
│   │   └── samehadaku-scraper.ts
│   ├── utils/            # Helper functions
│   │   └── dom-parser.ts
│   ├── scripts/          # CLI utilities
│   │   └── scan.ts
│   ├── types/            # TypeScript definitions
│   │   └── anime.ts
│   └── index.ts          # Entry point
├── .vscode/              # VS Code configuration
├── package.json
├── tsconfig.json
├── .eslintrc.json
└── README.md
```

## Development

### Adding a New Scraper

1. Create a service file in `src/services/[source]-scraper.ts`
2. Implement the scraping logic with proper error handling
3. Create a route handler in `src/api/[endpoint].ts`
4. Register the route in `src/index.ts`
5. Update type definitions if needed

### Code Style Guidelines

- Use descriptive variable names (camelCase for variables, PascalCase for types)
- Minimize code comments (code should be self-explanatory)
- Implement comprehensive error handling
- Follow TypeScript strict mode requirements
- Export explicit return types for all functions
- Separate type imports from value imports
- Use modern JavaScript features (nullish coalescing, optional chaining)
- Follow import ordering: external → internal → types
- Maximum line length: 120 characters

All rules are enforced via ESLint. Run `bun run lint:fix` before committing.

## Error Handling

All scrapers implement a consistent error handling pattern:

```typescript
interface ScraperResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

This ensures predictable error responses across all endpoints.

## Performance Considerations

- Scraping operations are asynchronous
- No caching implemented (each request fetches fresh data)
- Rate limiting not implemented (use responsibly)

## Future Roadmap

- Additional Samehadaku endpoints (search, details, episodes)
- Multiple anime source support
- Caching layer
- Rate limiting
- Request retry mechanism
- Comprehensive test suite

## License

MIT License

## Contributing

Contributions are welcome. Please follow the established code style and architecture patterns.

## Support

For issues and feature requests, please use the issue tracker.
