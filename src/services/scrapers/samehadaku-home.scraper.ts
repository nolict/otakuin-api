import { fetchHTML, parseDOM } from '../../utils/dom-parser';

import type { AnimeItem, ScraperResult } from '../../types/anime';

const SAMEHADAKU_HOME_URL = 'https://v1.samehadaku.how/anime-terbaru/';

function extractAnimeSlug(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? '';
  } catch {
    return '';
  }
}

export async function scrapeHomePage(): Promise<ScraperResult<AnimeItem[]>> {
  try {
    const html = await fetchHTML(SAMEHADAKU_HOME_URL);
    const $ = parseDOM(html);
    const animeList: AnimeItem[] = [];

    $('.post-show ul li').each((_, element) => {
      const $item = $(element);
      const $link = $item.find('a');
      const $image = $item.find('img');

      const url = $link.attr('href') ?? '';
      const animename = $link.attr('title') ?? $image.attr('alt') ?? '';
      const coverurl = $image.attr('src') ?? '';

      if (url.length > 0 && animename.length > 0 && coverurl.length > 0) {
        const slug = extractAnimeSlug(url);

        if (slug.length > 0) {
          animeList.push({
            slug,
            animename: animename.trim(),
            coverurl: coverurl.trim()
          });
        }
      }
    });

    if (animeList.length === 0) {
      return {
        success: false,
        error: 'No anime items found. The page structure may have changed.'
      };
    }

    return {
      success: true,
      data: animeList
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
