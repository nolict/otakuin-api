import { fetchHTML, parseDOM } from '../../utils/dom-parser';
import { logger } from '../../utils/logger';

import type { AnimeItem, ScraperResult } from '../../types/anime';

const SAMEHADAKU_BASE_URL = process.env.SAMEHADAKU_BASE_URL ?? 'https://v1.samehadaku.how';
const SAMEHADAKU_HOME_URL = `${SAMEHADAKU_BASE_URL}/anime-terbaru/`;

// In-memory cache for enriched home page results
// Cache expires after 5 minutes to keep data fresh
let cachedHomePageResult: { data: AnimeItem[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

async function extractFullTitleFromDetailPage(slug: string): Promise<string | null> {
  try {
    const detailUrl = `${SAMEHADAKU_BASE_URL}/anime/${slug}/`;
    const html = await fetchHTML(detailUrl);
    const $ = parseDOM(html);

    const paragraphs = $('.entry-content p');

    if (paragraphs.length >= 2) {
      const p0 = $(paragraphs[0]).text().trim();
      const p1 = $(paragraphs[1]).text().trim();

      if (p0 === 'Judul lengkap:' && p1.length > 0) {
        return p1;
      }
    }

    return null;
  } catch {
    // Silent fail - not all anime have full titles
    return null;
  }
}

export async function scrapeHomePage(): Promise<ScraperResult<AnimeItem[]>> {
  try {
    // Check in-memory cache first
    if (cachedHomePageResult !== null) {
      const now = Date.now();
      const age = now - cachedHomePageResult.timestamp;

      if (age < CACHE_TTL_MS) {
        const ageSeconds = Math.floor(age / 1000);
        logger.debug(`Using cached home page (age: ${ageSeconds}s, ${cachedHomePageResult.data.length} anime)`);
        return {
          success: true,
          data: cachedHomePageResult.data
        };
      } else {
        logger.debug('Cache expired, fetching fresh home page data');
        cachedHomePageResult = null;
      }
    }

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

    // Enrich ALL titles with full Japanese title from detail page for maximum accuracy
    logger.info(`Enriching ${animeList.length} anime titles from Samehadaku detail pages...`);

    const enrichPromises = animeList.map(async (anime) => {
      // ALWAYS fetch detail page to get official Japanese title from synopsis
      const fullTitle = await extractFullTitleFromDetailPage(anime.slug);
      if (fullTitle !== null) {
        logger.debug(`Enriched: "${anime.animename}" → "${fullTitle}"`);
        anime.animename = fullTitle;
      }
    });

    await Promise.all(enrichPromises);

    // Cache the enriched results
    cachedHomePageResult = {
      data: animeList,
      timestamp: Date.now()
    };
    logger.debug(`Cached enriched home page (${animeList.length} anime, TTL: 5 minutes)`);

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
