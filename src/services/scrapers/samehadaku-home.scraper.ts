import { fetchHTML, parseDOM } from '../../utils/dom-parser';
import { logger } from '../../utils/logger';

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

async function extractFullTitleFromDetailPage(slug: string): Promise<string | null> {
  try {
    const detailUrl = `https://v1.samehadaku.how/anime/${slug}/`;
    const html = await fetchHTML(detailUrl);
    const $ = parseDOM(html);
    
    const paragraphs = $('.entry-content p');
    
    if (paragraphs.length >= 2) {
      const p0 = $(paragraphs[0]).text().trim();
      const p1 = $(paragraphs[1]).text().trim();
      
      if (p0 === 'Judul lengkap:' && p1.length > 0) {
        logger.debug(`Extracted full title for ${slug}: ${p1}`);
        return p1;
      }
    }
    
    return null;
  } catch (error) {
    logger.warn(`Failed to extract full title for ${slug}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
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

    // Enrich ALL titles with full Japanese title from detail page for maximum accuracy
    logger.info(`Enriching ${animeList.length} anime titles from Samehadaku detail pages...`);
    
    const enrichPromises = animeList.map(async (anime) => {
      // ALWAYS fetch detail page to get official Japanese title from synopsis
      logger.debug(`Fetching full title for: "${anime.animename}"`);
      const fullTitle = await extractFullTitleFromDetailPage(anime.slug);
      if (fullTitle !== null) {
        logger.info(`Enriched: "${anime.animename}" → "${fullTitle}"`);
        anime.animename = fullTitle;
      } else {
        logger.debug(`No full title found, keeping original: "${anime.animename}"`);
      }
    });

    await Promise.all(enrichPromises);

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
