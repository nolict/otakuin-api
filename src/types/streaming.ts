// Streaming-related type definitions

export interface StreamingLink {
  code: string;
  provider: 'samehadaku' | 'animasu';
  url: string;
  url_video: string | null;
  resolution: string;
  server?: string;
}

export interface StreamingResponse {
  mal_id: number;
  episode: number;
  sources: StreamingLink[];
}

export interface StreamingCacheData {
  mal_id: number;
  episode: number;
  sources: StreamingLink[];
  cached_at: string;
  expires_at: string;
}

export interface StreamingScraperResult {
  success: boolean;
  sources: StreamingLink[];
  error?: string;
}
