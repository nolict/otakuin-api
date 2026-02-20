// Streaming-related type definitions

export interface StreamingLink {
  code?: string;
  provider: 'samehadaku' | 'animasu';
  resolution: string;
  url?: string;
  url_video?: string | null;
  url_resolve?: string | null;
  url_cloudflare?: string | null;
  server?: string;
  quality?: string;
  storage_type?: 'cloudflare' | 'github';
  github_urls?: Array<{ account: string; url: string }>;
}

export interface SavedVideo {
  file_name: string;
  resolution: string;
  file_size: number;
  url: string;
}

export interface StreamingResponse {
  mal_id: number;
  episode: number;
  anime_title?: string;
  sources: StreamingLink[];
  saved_videos?: SavedVideo[];
}

export interface StreamingCacheData {
  mal_id: number;
  episode: number;
  anime_title?: string;
  sources: StreamingLink[];
  cached_at: string;
  expires_at: string;
}

export interface StreamingScraperResult {
  success: boolean;
  sources: StreamingLink[];
  error?: string;
}
