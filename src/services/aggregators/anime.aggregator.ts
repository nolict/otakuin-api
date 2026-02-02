import { compareTwoStrings } from 'string-similarity';

import { logger } from '../../utils/logger.js';
import { fetchAnimeByMalId } from '../clients/jikan.client.js';
import { calculateMatchV2 } from '../matchers/anime.matcher.js';
import { findAnimeCacheByMalId, upsertAnimeCache } from '../repositories/anime-cache.repository.js';
import { findSlugMappingByMalId, upsertSlugMapping } from '../repositories/slug-mapping.repository.js';
import { scrapeAnimasuDetail } from '../scrapers/animasu.scraper.js';
import { scrapeSamehadakuDetail } from '../scrapers/samehadaku-detail.scraper.js';
import { scrapeHomePage } from '../scrapers/samehadaku-home.scraper.js';

import type {
  AnimeDetailScraped,
  ScraperResult,
  UnifiedAnimeDetail,
  UnifiedEpisode
} from '../../types/anime.js';
import type { AnimeCacheMetadata } from '../../types/database.js';
import type { JikanAnimeData } from '../../types/jikan.js';

function extractSequenceNumber(title: string): number | null {
  const partMatch = title.match(/\bpart\s+(\d+)/i);
  if (partMatch !== null) {
    return parseInt(partMatch[1], 10);
  }

  const ordinalMatch = title.match(/\b(\d+)(?:st|nd|rd|th)\s+season/i);
  if (ordinalMatch !== null) {
    return parseInt(ordinalMatch[1], 10);
  }

  const seasonMatch = title.match(/\bseason\s+(\d+)/i);
  if (seasonMatch !== null) {
    return parseInt(seasonMatch[1], 10);
  }

  const courMatch = title.match(/\bcour\s+(\d+)/i);
  if (courMatch !== null) {
    return parseInt(courMatch[1], 10);
  }

  const romanMatch = title.match(/\b(I{1,3}|IV|V|VI{0,3}|IX|X)$/i);
  if (romanMatch !== null) {
    const romanMap: Record<string, number> = {
      I: 1, II: 2, III: 3, IV: 4, V: 5,
      VI: 6, VII: 7, VIII: 8, IX: 9, X: 10
    };
    return romanMap[romanMatch[1].toUpperCase()] ?? null;
  }

  return null;
}

function getBaseTitleWithoutSequence(title: string): string {
  return title
    .replace(/\s+part\s+\d+/gi, '')
    .replace(/\s+\d+(?:st|nd|rd|th)\s+season/gi, '')
    .replace(/\s+season\s+\d+/gi, '')
    .replace(/\s+cour\s+\d+/gi, '')
    .replace(/\s+[IVX]+$/g, '')
    .replace(/\s+\d+$/g, '')
    .trim();
}

/**
 * Converts string to slug format
 */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function generateSlugVariations(title: string, englishTitle: string | null): string[] {
  const variations: string[] = [];

  variations.push(toSlug(title));

  if (englishTitle !== null && englishTitle.length > 0) {
    variations.push(toSlug(englishTitle));
  }

  const sequenceNum = extractSequenceNumber(title);
  const englishSequenceNum = englishTitle !== null ? extractSequenceNumber(englishTitle) : null;
  const finalSequenceNum = sequenceNum ?? englishSequenceNum;

  const baseTitle = getBaseTitleWithoutSequence(title);
  const baseTitleSlug = toSlug(baseTitle);
  const englishBaseTitle = englishTitle !== null ? getBaseTitleWithoutSequence(englishTitle) : null;
  const englishBaseTitleSlug = englishBaseTitle !== null ? toSlug(englishBaseTitle) : null;

  if (finalSequenceNum !== null && finalSequenceNum > 1) {
    variations.push(`${baseTitleSlug}-part-${finalSequenceNum}`);
    variations.push(`${baseTitleSlug}-cour-${finalSequenceNum}`);
    variations.push(`${baseTitleSlug}-season-${finalSequenceNum}`);
    variations.push(`${baseTitleSlug}-s${finalSequenceNum}`);
    variations.push(`${baseTitleSlug}-${finalSequenceNum}`);

    if (englishBaseTitleSlug !== null) {
      variations.push(`${englishBaseTitleSlug}-part-${finalSequenceNum}`);
      variations.push(`${englishBaseTitleSlug}-cour-${finalSequenceNum}`);
      variations.push(`${englishBaseTitleSlug}-season-${finalSequenceNum}`);
      variations.push(`${englishBaseTitleSlug}-s${finalSequenceNum}`);
      variations.push(`${englishBaseTitleSlug}-${finalSequenceNum}`);
    }

    variations.push(baseTitleSlug);
    if (englishBaseTitleSlug !== null) {
      variations.push(englishBaseTitleSlug);
    }
  }

  return [...new Set(variations)].filter((v) => v.length > 0);
}

function findBestSlugMatch(
  slugVariations: string[],
  availableSlugs: string[]
): Array<{ slug: string; similarity: number }> {
  const matches: Array<{ slug: string; similarity: number }> = [];

  for (const availableSlug of availableSlugs) {
    let bestSimilarity = 0;

    for (const variation of slugVariations) {
      const similarity = compareTwoStrings(variation, availableSlug);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
      }
    }

    if (bestSimilarity >= 0.70) {
      matches.push({
        slug: availableSlug,
        similarity: bestSimilarity
      });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);

  return matches;
}

async function tryFindSlug(
  slugVariations: string[],
  scrapeFunction: (slug: string) => Promise<ScraperResult<AnimeDetailScraped>>,
  jikanData: JikanAnimeData
): Promise<{ slug: string; data: AnimeDetailScraped; confidence: number } | null> {
  for (const slug of slugVariations) {
    const result = await scrapeFunction(slug);

    if (result.success && result.data !== undefined) {
      const matchResult = calculateMatchV2(
        jikanData,
        result.data.metadata,
        slug
      );

      if (matchResult.isMatch && matchResult.confidence >= 75) {
        return {
          slug,
          data: result.data,
          confidence: matchResult.confidence
        };
      }
    }
  }

  logger.debug('No exact match found, trying fuzzy slug matching');

  const homeResult = await scrapeHomePage();

  if (homeResult.success && homeResult.data !== undefined) {
    const availableSlugs = homeResult.data.map((anime) => anime.slug);
    const fuzzyMatches = findBestSlugMatch(slugVariations, availableSlugs);

    logger.debug('Fuzzy slug matches found', { count: fuzzyMatches.length });

    const fuzzyTestPromises = fuzzyMatches.slice(0, 5).map(async (fuzzyMatch) => {
      const similarityPercent = (fuzzyMatch.similarity * 100).toFixed(1);
      logger.debug('Testing fuzzy match', { slug: fuzzyMatch.slug, similarity: similarityPercent });

      const result = await scrapeFunction(fuzzyMatch.slug);

      if (result.success && result.data !== undefined) {
        const matchResult = calculateMatchV2(
          jikanData,
          result.data.metadata,
          fuzzyMatch.slug
        );

        if (matchResult.isMatch && matchResult.confidence >= 80) {
          logger.info(`Match confirmed: ${fuzzyMatch.slug}`);
          logger.debug('Fuzzy match details', { slug: fuzzyMatch.slug, confidence: matchResult.confidence });
          return {
            slug: fuzzyMatch.slug,
            data: result.data,
            confidence: matchResult.confidence
          };
        }
      }

      return null;
    });

    const fuzzyResults = await Promise.all(fuzzyTestPromises);
    const validMatches = fuzzyResults.filter(
      (r): r is { slug: string; data: AnimeDetailScraped; confidence: number } => r !== null
    );

    if (validMatches.length > 0) {
      validMatches.sort((a, b) => b.confidence - a.confidence);
      return validMatches[0];
    }
  }

  return null;
}

function convertToUnifiedAnimeDetail(metadata: AnimeCacheMetadata): UnifiedAnimeDetail {
  return {
    id: metadata.mal_id,
    name: metadata.title,
    slug_samehadaku: metadata.samehadaku_slug,
    slug_animasu: metadata.animasu_slug,
    coverurl: metadata.image_url ?? '',
    type: metadata.type ?? 'Unknown',
    status: metadata.status ?? 'Unknown',
    season: metadata.season,
    year: metadata.year,
    studio: metadata.studios.length > 0 ? metadata.studios[0] : null,
    score: metadata.score,
    synopsis: metadata.synopsis,
    genres: metadata.genres,
    episodes: metadata.episode_list.map((ep) => ({
      number: ep.episode,
      title: ep.title ?? `Episode ${ep.episode}`,
      url_samehadaku: ep.sources.find((s) => s.source === 'samehadaku')?.url ?? null,
      url_animasu: ep.sources.find((s) => s.source === 'animasu')?.url ?? null,
      releaseDate: null
    }))
  };
}

export async function getUnifiedAnimeDetail(malId: number): Promise<ScraperResult<UnifiedAnimeDetail>> {
  const requestTimer = logger.timer();

  try {
    logger.info(`Fetching anime with MAL ID: ${malId}`);

    const cachedMetadata = await findAnimeCacheByMalId(malId);

    if (cachedMetadata !== null) {
      requestTimer.end('Cache HIT', { mal_id: malId });
      logger.info('Returned cached metadata');
      return {
        success: true,
        data: convertToUnifiedAnimeDetail(cachedMetadata)
      };
    }

    logger.debug('Cache MISS - Fetching from sources');

    const jikanResult = await fetchAnimeByMalId(malId);

    if (!jikanResult.success || jikanResult.data === undefined) {
      return {
        success: false,
        error: jikanResult.error ?? 'Failed to fetch anime from Jikan'
      };
    }

    const jikanData = jikanResult.data;

    const existingMapping = await findSlugMappingByMalId(malId);

    let samehadakuSlug: string | null = existingMapping?.samehadaku_slug ?? null;
    let animasuSlug: string | null = existingMapping?.animasu_slug ?? null;
    let confidenceSamehadaku: number | null = existingMapping?.confidence_samehadaku ?? null;
    let confidenceAnimasu: number | null = existingMapping?.confidence_animasu ?? null;

    if (existingMapping !== null) {
      logger.info('Slug mapping found in database');
      logger.debug('Slug mapping details', {
        samehadaku_slug: samehadakuSlug,
        samehadaku_confidence: confidenceSamehadaku,
        animasu_slug: animasuSlug,
        animasu_confidence: confidenceAnimasu
      });
    } else {
      logger.info('Slug mapping not found - Starting discovery');
      const discoveryTimer = logger.timer();

      const slugVariations = generateSlugVariations(jikanData.title, jikanData.title_english);
      logger.debug('Generated slug variations', { count: slugVariations.length, variations: slugVariations });

      const [samehadakuMatch, animasuMatch] = await Promise.all([
        tryFindSlug(slugVariations, scrapeSamehadakuDetail, jikanData),
        tryFindSlug(slugVariations, scrapeAnimasuDetail, jikanData)
      ]);

      discoveryTimer.end('Slug discovery', {
        samehadaku_found: samehadakuMatch !== null,
        animasu_found: animasuMatch !== null
      });

      if (samehadakuMatch !== null) {
        samehadakuSlug = samehadakuMatch.slug;
        confidenceSamehadaku = samehadakuMatch.confidence;
        logger.info(`Samehadaku slug found: ${samehadakuSlug}`);
        logger.debug('Samehadaku match details', { slug: samehadakuSlug, confidence: confidenceSamehadaku });
      } else {
        logger.warn('Samehadaku slug not found');
      }

      if (animasuMatch !== null) {
        animasuSlug = animasuMatch.slug;
        confidenceAnimasu = animasuMatch.confidence;
        logger.info(`Animasu slug found: ${animasuSlug}`);
        logger.debug('Animasu match details', { slug: animasuSlug, confidence: confidenceAnimasu });
      } else {
        logger.warn('Animasu slug not found');
      }

      await upsertSlugMapping({
        mal_id: malId,
        samehadaku_slug: samehadakuSlug,
        animasu_slug: animasuSlug,
        confidence_samehadaku: confidenceSamehadaku,
        confidence_animasu: confidenceAnimasu
      });

      logger.debug('Slug mapping saved to database');
    }

    logger.info('Scraping episodes from sources');
    const scrapeTimer = logger.timer();

    const scrapePromises: Array<Promise<ScraperResult<AnimeDetailScraped>>> = [];

    if (samehadakuSlug !== null) {
      scrapePromises.push(scrapeSamehadakuDetail(samehadakuSlug));
    } else {
      scrapePromises.push(Promise.resolve({ success: false as const }));
    }

    if (animasuSlug !== null) {
      scrapePromises.push(scrapeAnimasuDetail(animasuSlug));
    } else {
      scrapePromises.push(Promise.resolve({ success: false as const }));
    }

    const [samehadakuResult, animasuResult] = await Promise.all(scrapePromises);

    scrapeTimer.end('Episode scraping', {
      samehadaku_success: samehadakuResult.success,
      animasu_success: animasuResult.success
    });

    let samehadakuEpisodes: UnifiedEpisode[] = [];

    if (samehadakuResult.success && samehadakuResult.data !== undefined) {
      samehadakuEpisodes = samehadakuResult.data.episodes.map((ep) => ({
        number: ep.number,
        title: ep.title,
        url_samehadaku: ep.url,
        url_animasu: null,
        releaseDate: ep.releaseDate ?? null
      }));
    }

    if (animasuResult.success && animasuResult.data !== undefined) {
      animasuResult.data.episodes.forEach((ep) => {
        const existingEp = samehadakuEpisodes.find((e) => e.number === ep.number);

        if (existingEp !== undefined) {
          existingEp.url_animasu = ep.url;
        } else {
          samehadakuEpisodes.push({
            number: ep.number,
            title: ep.title,
            url_samehadaku: null,
            url_animasu: ep.url,
            releaseDate: ep.releaseDate ?? null
          });
        }
      });
    }

    samehadakuEpisodes.sort((a, b) => a.number - b.number);

    const cacheMetadata: AnimeCacheMetadata = {
      mal_id: jikanData.mal_id,
      title: jikanData.title,
      title_english: jikanData.title_english,
      title_japanese: jikanData.title_japanese,
      synopsis: jikanData.synopsis,
      image_url: jikanData.images.jpg.large_image_url,
      type: jikanData.type,
      episodes: jikanData.episodes,
      status: jikanData.status,
      year: jikanData.year,
      season: jikanData.season,
      studios: jikanData.studios.map((s) => s.name),
      genres: jikanData.genres.map((g) => g.name),
      themes: jikanData.themes.map((t) => t.name),
      demographics: jikanData.demographics.map((d) => d.name),
      score: jikanData.score,
      scored_by: jikanData.scored_by,
      rank: jikanData.rank,
      popularity: jikanData.popularity,
      members: jikanData.members,
      favorites: jikanData.favorites,
      rating: jikanData.rating,
      source: jikanData.source,
      duration: jikanData.duration,
      broadcast_day: jikanData.broadcast.day,
      broadcast_time: jikanData.broadcast.time,
      samehadaku_slug: samehadakuSlug,
      animasu_slug: animasuSlug,
      episode_list: samehadakuEpisodes.map((ep) => ({
        episode: ep.number,
        title: ep.title,
        sources: [
          ep.url_samehadaku !== null ? { source: 'samehadaku', url: ep.url_samehadaku } : null,
          ep.url_animasu !== null ? { source: 'animasu', url: ep.url_animasu } : null
        ].filter((s): s is { source: string; url: string } => s !== null)
      }))
    };

    await upsertAnimeCache(cacheMetadata);

    logger.debug('Metadata cached for 20 minutes');

    const totalEpisodes = samehadakuEpisodes.length;
    requestTimer.end('Request completed', {
      mal_id: malId,
      total_episodes: totalEpisodes,
      samehadaku_slug: samehadakuSlug,
      animasu_slug: animasuSlug
    });

    const unified: UnifiedAnimeDetail = {
      id: jikanData.mal_id,
      name: jikanData.title,
      slug_samehadaku: samehadakuSlug,
      slug_animasu: animasuSlug,
      coverurl: jikanData.images.jpg.large_image_url,
      type: jikanData.type ?? 'Unknown',
      status: jikanData.status,
      season: jikanData.season ?? null,
      year: jikanData.year ?? null,
      studio: jikanData.studios.length > 0 ? jikanData.studios[0].name : null,
      score: jikanData.score ?? null,
      synopsis: jikanData.synopsis ?? null,
      genres: jikanData.genres.map((g) => g.name),
      episodes: samehadakuEpisodes
    };

    return {
      success: true,
      data: unified
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
