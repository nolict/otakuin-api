import { logger } from '../../utils/logger';
import { searchAnimeByTitle } from '../clients/jikan.client';
import { findBestMatchFromJikanResults } from '../matchers/home-anime.matcher';
import { getCachedHomePage, saveHomePageCache } from '../repositories/home-page-cache.repository';
import { scrapeAnimasuHomePage } from '../scrapers/animasu-home.scraper';
import { scrapeHomePage } from '../scrapers/samehadaku-home.scraper';

import type { AnimeItem, HomeAnimeItem, ScraperResult } from '../../types/anime';
import type { HomePageCacheInsert } from '../../types/database';

interface MergedAnimeItem {
  animename: string;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeAnimeItems(
  samehadakuItems: AnimeItem[],
  animasuItems: AnimeItem[]
): Map<string, MergedAnimeItem> {
  const mergedMap = new Map<string, MergedAnimeItem>();
  const titleIndex = new Map<string, string>();

  for (const item of samehadakuItems) {
    const key = item.animename.toLowerCase().trim();
    const normalizedKey = normalizeTitle(item.animename);
    
    mergedMap.set(key, {
      animename: item.animename
    });
    
    titleIndex.set(normalizedKey, key);
  }

  for (const item of animasuItems) {
    const key = item.animename.toLowerCase().trim();
    const normalizedKey = normalizeTitle(item.animename);
    let existing = mergedMap.get(key);

    if (existing === undefined) {
      const matchedKey = titleIndex.get(normalizedKey);
      if (matchedKey !== undefined) {
        existing = mergedMap.get(matchedKey);
        logger.debug(`Fuzzy merged: "${item.animename}" → "${matchedKey}"`);
      }
    }

    if (existing === undefined) {
      mergedMap.set(key, {
        animename: item.animename
      });
      
      titleIndex.set(normalizedKey, key);
    }
  }

  return mergedMap;
}

async function normalizeToMAL(
  mergedItems: Map<string, MergedAnimeItem>
): Promise<HomePageCacheInsert[]> {
  const malMap = new Map<number, HomePageCacheInsert>();
  const failedAnime: string[] = [];

  let index = 0;
  for (const [, item] of mergedItems) {
    index++;

    if (index > 1 && index % 3 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info(`Searching MAL for: ${item.animename} (${index}/${mergedItems.size})`);

    const searchResult = await searchAnimeByTitle(item.animename);

    if (!searchResult.success || searchResult.data === undefined) {
      logger.warn(`MAL search failed for: ${item.animename}`);
      failedAnime.push(item.animename);
      continue;
    }
    const bestMatch = findBestMatchFromJikanResults(
      {
        slug: '',
        animename: item.animename,
        coverurl: '',
        lastEpisode: undefined
      },
      searchResult.data
    );

    if (bestMatch === null) {
      // Fallback: Try expanded search with first 2-3 words
      const words = item.animename.split(' ').filter((w) => w.length > 2);
      if (words.length >= 2) {
        const expandedQuery = words.slice(0, Math.min(3, words.length)).join(' ');
        logger.debug(`Fallback search with expanded query: "${expandedQuery}"`);
        
        await new Promise((resolve) => setTimeout(resolve, 350));
        const fallbackResult = await searchAnimeByTitle(expandedQuery);
        
        if (fallbackResult.success && fallbackResult.data !== undefined) {
          const fallbackMatch = findBestMatchFromJikanResults(
            {
              slug: '',
              animename: item.animename,
              coverurl: '',
              lastEpisode: undefined
            },
            fallbackResult.data
          );
          
          if (fallbackMatch !== null) {
            logger.info(`✅ Fallback match found: ${item.animename} → MAL ID ${fallbackMatch.mal_id}`);
            
            const coverUrl = fallbackMatch.images.jpg.large_image_url ??
                             fallbackMatch.images.jpg.image_url ??
                             '';
            
            malMap.set(fallbackMatch.mal_id, {
              mal_id: fallbackMatch.mal_id,
              name: fallbackMatch.title,
              cover: coverUrl,
              last_episode: null,
              slug_samehadaku: null,
              slug_animasu: null,
              aired_from: fallbackMatch.aired.from,
              expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
            });
            continue;
          }
        }
      }
      
      logger.warn(`No MAL match found for: ${item.animename}`);
      failedAnime.push(item.animename);
      continue;
    }

    if (malMap.has(bestMatch.mal_id)) {
      logger.debug(`Skipping duplicate MAL ID ${bestMatch.mal_id}: ${item.animename}`);
      continue;
    }

    const coverUrl = bestMatch.images.jpg.large_image_url ??
                     bestMatch.images.jpg.image_url ??
                     '';

    malMap.set(bestMatch.mal_id, {
      mal_id: bestMatch.mal_id,
      name: bestMatch.title,
      cover: coverUrl,
      last_episode: null,
      slug_samehadaku: null,
      slug_animasu: null,
      aired_from: bestMatch.aired.from,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    });
    logger.debug(`Matched: ${item.animename} → MAL ID ${bestMatch.mal_id}`);
  }

  if (failedAnime.length > 0) {
    logger.warn(`Failed to match ${failedAnime.length} anime to MAL:`);
    failedAnime.forEach((name) => logger.warn(`  - ${name}`));
  }

  return Array.from(malMap.values());
}

function isNewAnime(airedFrom: string | null): boolean {
  if (airedFrom === null) {
    return false;
  }

  const airedDate = new Date(airedFrom);
  const now = new Date();
  const diffMs = now.getTime() - airedDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return diffHours <= 24;
}

export async function getHomePageAnimeList(): Promise<ScraperResult<HomeAnimeItem[]>> {
  try {
    const timer = logger.createTimer();

    const cachedData = await getCachedHomePage();

    if (cachedData.length > 0) {
      logger.perf('Home page cache HIT', timer.elapsed());

      const homeItems: HomeAnimeItem[] = cachedData.map((cache) => ({
        id: cache.mal_id,
        name: cache.name,
        cover: cache.cover,
        is_new: isNewAnime(cache.aired_from)
      }));

      return {
        success: true,
        data: homeItems
      };
    }

    logger.info('Home page cache MISS - Scraping sources');

    const [samehadakuResult, animasuResult] = await Promise.all([
      scrapeHomePage(),
      scrapeAnimasuHomePage()
    ]);

    const samehadakuItems = samehadakuResult.success && samehadakuResult.data !== undefined
      ? samehadakuResult.data
      : [];

    const animasuItems = animasuResult.success && animasuResult.data !== undefined
      ? animasuResult.data
      : [];

    if (samehadakuItems.length === 0 && animasuItems.length === 0) {
      return {
        success: false,
        error: 'Failed to scrape any anime from both sources'
      };
    }

    logger.info(`Scraped ${samehadakuItems.length} from Samehadaku, ${animasuItems.length} from Animasu`);

    const mergedItems = mergeAnimeItems(samehadakuItems, animasuItems);
    logger.info(`Merged to ${mergedItems.size} unique anime`);

    const cacheItems = await normalizeToMAL(mergedItems);
    logger.info(`Normalized ${cacheItems.length} anime to MAL`);

    if (cacheItems.length > 0) {
      await saveHomePageCache(cacheItems);
      logger.info('Saved to cache');
    }

    const homeItems: HomeAnimeItem[] = cacheItems.map((cache) => ({
      id: cache.mal_id,
      name: cache.name,
      cover: cache.cover,
      is_new: isNewAnime(cache.aired_from)
    }));

    logger.perf('Home page aggregation completed', timer.elapsed());

    return {
      success: true,
      data: homeItems
    };
  } catch (error) {
    logger.error('Home page aggregation failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
