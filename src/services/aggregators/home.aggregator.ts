import { logger } from '../../utils/logger';
import { searchAnimeByTitle } from '../clients/jikan.client';
import { findBestMatchFromJikanResults } from '../matchers/home-anime.matcher';
import { getEpisodeCountBySlug, getSlugsByMalId } from '../repositories/anime-episodes.repository';
import { createHomePageCacheItem, getCachedHomePage, saveHomePageCache } from '../repositories/home-page-cache.repository';
import { upsertSlugMapping } from '../repositories/slug-mapping.repository';
import { scrapeAnimasuHomePage } from '../scrapers/animasu-home.scraper';
import { scrapeAnimasuDetail } from '../scrapers/animasu.scraper';
import { scrapeSamehadakuDetail } from '../scrapers/samehadaku-detail.scraper';
import { scrapeHomePage } from '../scrapers/samehadaku-home.scraper';

import type { AnimeItem, HomeAnimeItem, ScraperResult } from '../../types/anime';
import type { HomePageCacheInsert } from '../../types/database';

interface MergedAnimeItem {
  animename: string;
  coverurl: string;
  lastEpisode: number | null;
  slugSamehadaku: string | null;
  slugAnimasu: string | null;
}

function mergeAnimeItems(
  samehadakuItems: AnimeItem[],
  animasuItems: AnimeItem[]
): Map<string, MergedAnimeItem> {
  const mergedMap = new Map<string, MergedAnimeItem>();

  for (const item of samehadakuItems) {
    const key = item.animename.toLowerCase().trim();
    mergedMap.set(key, {
      animename: item.animename,
      coverurl: item.coverurl,
      lastEpisode: item.lastEpisode ?? null,
      slugSamehadaku: item.slug,
      slugAnimasu: null
    });
  }

  for (const item of animasuItems) {
    const key = item.animename.toLowerCase().trim();
    const existing = mergedMap.get(key);

    if (existing !== undefined) {
      existing.slugAnimasu = item.slug;
      const shouldUpdate = item.lastEpisode !== undefined &&
                           (existing.lastEpisode === null || item.lastEpisode > existing.lastEpisode);
      if (shouldUpdate) {
        existing.lastEpisode = item.lastEpisode;
      }
    } else {
      mergedMap.set(key, {
        animename: item.animename,
        coverurl: item.coverurl,
        lastEpisode: item.lastEpisode ?? null,
        slugSamehadaku: null,
        slugAnimasu: item.slug
      });
    }
  }

  return mergedMap;
}

async function normalizeToMAL(
  mergedItems: Map<string, MergedAnimeItem>
): Promise<HomePageCacheInsert[]> {
  const malMap = new Map<number, HomePageCacheInsert>();

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
      continue;
    }

    const bestMatch = findBestMatchFromJikanResults(
      {
        slug: item.slugSamehadaku ?? item.slugAnimasu ?? '',
        animename: item.animename,
        coverurl: item.coverurl,
        lastEpisode: item.lastEpisode ?? undefined
      },
      searchResult.data
    );

    if (bestMatch === null) {
      logger.warn(`No MAL match found for: ${item.animename}`);
      continue;
    }

    const existing = malMap.get(bestMatch.mal_id);

    if (existing !== undefined) {
      logger.debug(`Merging duplicate MAL ID ${bestMatch.mal_id}: ${item.animename}`);

      if (item.slugSamehadaku !== null && existing.slug_samehadaku === null) {
        existing.slug_samehadaku = item.slugSamehadaku;
      }
      if (item.slugAnimasu !== null && existing.slug_animasu === null) {
        existing.slug_animasu = item.slugAnimasu;
      }

      if (item.lastEpisode !== null) {
        if (existing.last_episode === null || item.lastEpisode > existing.last_episode) {
          existing.last_episode = item.lastEpisode;
        }
      }

      continue;
    }

    const coverUrl = bestMatch.images.jpg.large_image_url ??
                     bestMatch.images.jpg.image_url ??
                     item.coverurl;

    let finalEpisodeCount = item.lastEpisode;
    let finalSlugSamehadaku = item.slugSamehadaku;
    let finalSlugAnimasu = item.slugAnimasu;

    const dbSlugs = await getSlugsByMalId(bestMatch.mal_id);
    if (dbSlugs !== null) {
      if (finalSlugSamehadaku === null && dbSlugs.slugSamehadaku !== null) {
        finalSlugSamehadaku = dbSlugs.slugSamehadaku;
        logger.debug(`Got samehadaku slug from DB: ${dbSlugs.slugSamehadaku}`);
      }
      if (finalSlugAnimasu === null && dbSlugs.slugAnimasu !== null) {
        finalSlugAnimasu = dbSlugs.slugAnimasu;
        logger.debug(`Got animasu slug from DB: ${dbSlugs.slugAnimasu}`);
      }
    }

    if (finalEpisodeCount === null && (finalSlugSamehadaku !== null || finalSlugAnimasu !== null)) {
      const detailScrapeResults = await Promise.all([
        finalSlugSamehadaku !== null ? scrapeSamehadakuDetail(finalSlugSamehadaku) : null,
        finalSlugAnimasu !== null ? scrapeAnimasuDetail(finalSlugAnimasu) : null
      ]);

      const samehadakuDetail = detailScrapeResults[0];
      const animasuDetail = detailScrapeResults[1];

      if (samehadakuDetail !== null && samehadakuDetail.success && samehadakuDetail.data !== undefined) {
        const episodeCount = samehadakuDetail.data.episodes.length;
        if (episodeCount > 0) {
          finalEpisodeCount = episodeCount;
          logger.debug(`Got ${episodeCount} episodes from Samehadaku detail for ${item.animename}`);
        }
      }

      if (animasuDetail !== null && animasuDetail.success && animasuDetail.data !== undefined) {
        const episodeCount = animasuDetail.data.episodes.length;
        if (finalEpisodeCount === null || episodeCount > finalEpisodeCount) {
          finalEpisodeCount = episodeCount;
          logger.debug(`Got ${episodeCount} episodes from Animasu detail for ${item.animename}`);
        }
      }

      if (dbSlugs === null) {
        await upsertSlugMapping({
          mal_id: bestMatch.mal_id,
          samehadaku_slug: finalSlugSamehadaku,
          animasu_slug: finalSlugAnimasu,
          confidence_samehadaku: finalSlugSamehadaku !== null ? 100 : null,
          confidence_animasu: finalSlugAnimasu !== null ? 100 : null
        });
        logger.debug(`Saved slug mapping for MAL ID ${bestMatch.mal_id}`);
      }
    }

    if (finalEpisodeCount === null) {
      const dbEpisodeCount = await getEpisodeCountBySlug(finalSlugSamehadaku, finalSlugAnimasu);
      if (dbEpisodeCount !== null) {
        finalEpisodeCount = dbEpisodeCount;
        logger.debug(`Got episode count from DB cache: ${dbEpisodeCount} for ${item.animename}`);
      }
    }

    const cacheItem = createHomePageCacheItem(
      bestMatch.mal_id,
      bestMatch.title,
      coverUrl,
      finalEpisodeCount,
      finalSlugSamehadaku,
      finalSlugAnimasu,
      bestMatch.aired.from
    );

    malMap.set(bestMatch.mal_id, cacheItem);
    logger.debug(`Matched: ${item.animename} → MAL ID ${bestMatch.mal_id}`);
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
        last_episode: cache.last_episode,
        slug_samehadaku: cache.slug_samehadaku,
        slug_animasu: cache.slug_animasu,
        is_new: isNewAnime(cache.aired_from),
        aired_from: cache.aired_from
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
      last_episode: cache.last_episode,
      slug_samehadaku: cache.slug_samehadaku,
      slug_animasu: cache.slug_animasu,
      is_new: isNewAnime(cache.aired_from),
      aired_from: cache.aired_from
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
