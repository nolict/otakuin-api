export interface AnimeItem {
  slug: string;
  animename: string;
  coverurl: string;
  lastEpisode?: number;
}

export interface ScraperResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AnimeMetadata {
  title: string;
  alternativeTitles: {
    english?: string;
    japanese?: string;
    synonyms?: string[];
  };
  type: string;
  status: string;
  season?: string;
  year?: number;
  studio?: string;
  source?: string;
  duration?: string;
  totalEpisodes?: string;
  releasedDate?: string;
}

export interface Episode {
  number: number;
  title: string;
  url: string;
  releaseDate?: string;
}

export interface AnimeDetailScraped {
  metadata: AnimeMetadata;
  episodes: Episode[];
}

export interface UnifiedAnimeDetail {
  id: number;
  name: string;
  slug_samehadaku: string | null;
  slug_animasu: string | null;
  coverurl: string;
  type: string;
  status: string;
  season: string | null;
  year: number | null;
  studio: string | null;
  score: number | null;
  synopsis: string | null;
  genres: string[];
  episodes: UnifiedEpisode[];
}

export interface UnifiedEpisode {
  number: number;
  title: string;
  url_samehadaku: string | null;
  url_animasu: string | null;
  releaseDate: string | null;
}

export interface MatchScore {
  slug: string;
  score: number;
  reasons: string[];
}

export interface HomeAnimeItem {
  id: number;
  name: string;
  cover: string;
  is_new: boolean;
}
