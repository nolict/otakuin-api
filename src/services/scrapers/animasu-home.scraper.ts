import { fetchHTML, parseDOM } from '../../utils/dom-parser';

import type { AnimeItem, ScraperResult } from '../../types/anime';

const ANIMASU_HOME_URL = 'https://v1.animasu.app/anime-sedang-tayang-terbaru/';

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

function extractEpisodeNumber(episodeText: string): number | null {
  const patterns = [
    /Episode\s+(\d+)/i,
    /Ep\s+(\d+)/i,
    /^(\d+)$/
  ];

  for (const pattern of patterns) {
    const match = episodeText.match(pattern);
    if (match?.[1] !== undefined) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

export async function scrapeAnimasuHomePage(): Promise<ScraperResult<AnimeItem[]>> {
  try {
    const html = await fetchHTML(ANIMASU_HOME_URL);
    const $ = parseDOM(html);
    const animeList: AnimeItem[] = [];

    $('.listupd .bs').each((_, element) => {
      const $item = $(element);
      const $link = $item.find('.bsx a');
      const $image = $item.find('.bsx img');
      const $title = $item.find('.tt');
      const $episodeSpan = $item.find('.epx');

      const url = $link.attr('href') ?? '';
      const titleText = $title.text().trim();
      const animename = titleText.length > 0 ? titleText : ($image.attr('alt') ?? '');
      const coverurl = $image.attr('src') ?? '';
      const episodeText = $episodeSpan.text().trim();

      if (url.length > 0 && animename.length > 0 && coverurl.length > 0) {
        const slug = extractAnimeSlug(url);

        if (slug.length > 0) {
          const lastEpisode = extractEpisodeNumber(episodeText);

          animeList.push({
            slug,
            animename: animename.trim(),
            coverurl: coverurl.trim(),
            lastEpisode: lastEpisode ?? undefined
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
