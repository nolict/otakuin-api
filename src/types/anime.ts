export interface AnimeItem {
  slug: string;
  animename: string;
  coverurl: string;
}

export interface ScraperResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
