export interface SlugMapping {
  id: number;
  mal_id: number;
  samehadaku_slug: string | null;
  animasu_slug: string | null;
  confidence_samehadaku: number | null;
  confidence_animasu: number | null;
  created_at: string;
  updated_at: string;
}

export interface AnimeCache {
  id: number;
  mal_id: number;
  metadata: AnimeCacheMetadata;
  expires_at: string;
  created_at: string;
}

export interface AnimeCacheMetadata {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  synopsis: string | null;
  image_url: string | null;
  type: string | null;
  episodes: number | null;
  status: string | null;
  year: number | null;
  season: string | null;
  studios: string[];
  genres: string[];
  themes: string[];
  demographics: string[];
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  rating: string | null;
  source: string | null;
  duration: string | null;
  broadcast_day: string | null;
  broadcast_time: string | null;
  samehadaku_slug: string | null;
  animasu_slug: string | null;
  episode_list: EpisodeCache[];
}

export interface EpisodeCache {
  episode: number;
  title: string | null;
  sources: EpisodeSourceCache[];
}

export interface EpisodeSourceCache {
  source: string;
  url: string;
}

export interface SlugMappingInsert {
  mal_id: number;
  samehadaku_slug: string | null;
  animasu_slug: string | null;
  confidence_samehadaku: number | null;
  confidence_animasu: number | null;
}

export interface AnimeCacheInsert {
  mal_id: number;
  metadata: AnimeCacheMetadata;
  expires_at: string;
}
