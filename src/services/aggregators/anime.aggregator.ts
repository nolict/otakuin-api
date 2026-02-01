import { compareTwoStrings } from 'string-similarity';

import { fetchAnimeByMalId } from '../clients/jikan.client';
import { calculateMatchV2 } from '../matchers/anime.matcher';
import { scrapeAnimasuDetail } from '../scrapers/animasu.scraper';
import { scrapeSamehadakuDetail } from '../scrapers/samehadaku-detail.scraper';
import { scrapeHomePage } from '../scrapers/samehadaku-home.scraper';

import type {
  AnimeDetailScraped,
  ScraperResult,
  UnifiedAnimeDetail,
  UnifiedEpisode
} from '../../types/anime';
import type { JikanAnimeData } from '../../types/jikan';

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
  const matches: Array<{ slug: string; data: AnimeDetailScraped; confidence: number }> = [];

  for (const slug of slugVariations) {
    const result = await scrapeFunction(slug);

    if (result.success && result.data !== undefined) {
      const matchResult = calculateMatchV2(
        jikanData,
        result.data.metadata,
        slug
      );

      if (matchResult.isMatch && matchResult.confidence >= 75) {
        matches.push({
          slug,
          data: result.data,
          confidence: matchResult.confidence
        });

        if (matchResult.confidence >= 95) {
          break;
        }
      }
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  }

  console.log('🔍 No exact match found, trying fuzzy slug matching...');

  const homeResult = await scrapeHomePage();

  if (homeResult.success && homeResult.data !== undefined) {
    const availableSlugs = homeResult.data.map((anime) => anime.slug);
    const fuzzyMatches = findBestSlugMatch(slugVariations, availableSlugs);

    console.log(`📊 Found ${fuzzyMatches.length} fuzzy slug matches`);

    for (const fuzzyMatch of fuzzyMatches.slice(0, 5)) {
      console.log(`   Testing: ${fuzzyMatch.slug} (similarity: ${(fuzzyMatch.similarity * 100).toFixed(1)}%)`);

      const result = await scrapeFunction(fuzzyMatch.slug);

      if (result.success && result.data !== undefined) {
        const matchResult = calculateMatchV2(
          jikanData,
          result.data.metadata,
          fuzzyMatch.slug
        );

        if (matchResult.isMatch && matchResult.confidence >= 80) {
          console.log(`   ✅ Match confirmed: ${fuzzyMatch.slug} (confidence: ${matchResult.confidence}%)`);
          matches.push({
            slug: fuzzyMatch.slug,
            data: result.data,
            confidence: matchResult.confidence
          });

          if (matchResult.confidence >= 95) {
            break;
          }
        }
      }
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  }

  return null;
}

export async function getUnifiedAnimeDetail(malId: number): Promise<ScraperResult<UnifiedAnimeDetail>> {
  try {
    const jikanResult = await fetchAnimeByMalId(malId);

    if (!jikanResult.success || jikanResult.data === undefined) {
      return {
        success: false,
        error: jikanResult.error ?? 'Failed to fetch anime from Jikan'
      };
    }

    const jikanData = jikanResult.data;

    const slugVariations = generateSlugVariations(jikanData.title, jikanData.title_english);

    let samehadakuSlug: string | null = null;
    let samehadakuEpisodes: UnifiedEpisode[] = [];

    const samehadakuMatch = await tryFindSlug(slugVariations, scrapeSamehadakuDetail, jikanData);

    if (samehadakuMatch !== null) {
      samehadakuSlug = samehadakuMatch.slug;
      samehadakuEpisodes = samehadakuMatch.data.episodes.map((ep) => ({
        number: ep.number,
        title: ep.title,
        url_samehadaku: ep.url,
        url_animasu: null,
        releaseDate: ep.releaseDate ?? null
      }));
    }

    let animasuSlug: string | null = null;

    const animasuMatch = await tryFindSlug(slugVariations, scrapeAnimasuDetail, jikanData);

    if (animasuMatch !== null) {
      animasuSlug = animasuMatch.slug;

      animasuMatch.data.episodes.forEach((ep) => {
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
