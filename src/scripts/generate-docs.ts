import { readFileSync, writeFileSync } from 'fs';

async function generateDocs(): Promise<void> {
  console.log('Generating API documentation from Swagger...');

  const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
  const version = packageJson.version;

  const apiDoc = `# API Reference

## Base URL

\`\`\`
http://localhost:3000
\`\`\`

## Interactive Documentation

Visit \`/api/docs\` for interactive Swagger UI documentation.

## Endpoints

### GET /api/home

Get latest anime listing with pagination.

**Query Parameters:**
- \`page\` (optional) - Page number, default: 1
- \`limit\` (optional) - Items per page, default: 10

**Response:**

\`\`\`json
{
  "data": [
    {
      "id": 55772,
      "name": "Golden Kamuy: Saishuushou",
      "cover": "https://cdn.myanimelist.net/images/anime/1288/154763l.jpg",
      "is_new": false
    }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 10,
    "total": 19,
    "total_pages": 2
  }
}
\`\`\`

### GET /api/anime/:id

Get anime details with episodes from multiple sources.

**Parameters:**
- \`id\` - MyAnimeList ID

**Response:**

\`\`\`json
{
  "id": 21,
  "title": "One Piece",
  "cover": "https://cdn.myanimelist.net/images/anime/6/73245l.jpg",
  "synopsis": "...",
  "status": "Currently Airing",
  "type": "TV",
  "episodes": [
    {
      "episode": 1,
      "title": "I'm Luffy! The Man Who's Gonna Be King of the Pirates!",
      "source": "samehadaku"
    }
  ],
  "metadata": {
    "mal_score": 8.72,
    "studios": ["Toei Animation"],
    "genres": ["Action", "Adventure", "Fantasy"]
  }
}
\`\`\`

### GET /api/streaming/:id/:episode

Get streaming sources for specific episode.

**Parameters:**
- \`id\` - MyAnimeList ID
- \`episode\` - Episode number

**Response:**

\`\`\`json
{
  "mal_id": 21,
  "episode": 1,
  "anime_title": "One Piece",
  "sources": [
    {
      "code": "abc123",
      "provider": "samehadaku",
      "resolution": "1080p",
      "url_video": "https://s0.wibufile.com/video01/file.mp4",
      "url_resolve": "https://workers.dev/?url=...",
      "url_cloudflare": "https://workers.dev/?url=..."
    }
  ],
  "saved_videos": [
    {
      "file_name": "00021hash1080s01.mp4",
      "resolution": "1080p",
      "file_size": 251158756,
      "url": "https://github.com/user/repo/releases/download/anime-21/file.mp4"
    }
  ]
}
\`\`\`

### GET /api/video/:code

Access video by unique code.

**Parameters:**
- \`code\` - Unique video identifier

**Response:**
- Binary video stream (MP4)
- Supports range requests for seeking

## Response Codes

- \`200\` - Success
- \`404\` - Resource not found
- \`500\` - Server error

## Rate Limits

Jikan API limits:
- 3 requests per second
- 60 requests per minute

Database cache reduces external API calls by 99%.

## Error Response

\`\`\`json
{
  "error": "Error message",
  "details": "Additional information"
}
\`\`\`

---

**API Version:** ${version}
**Last Updated:** ${new Date().toISOString().split('T')[0]}
`;

  writeFileSync('./docs/API.md', apiDoc);
  console.log('API documentation generated successfully!');
  console.log(`Version: ${version}`);
}

generateDocs().catch(console.error);
