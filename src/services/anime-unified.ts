import { fetchAnimeByMalId } from './jikan-api';
import { scrapeHomePage } from './samehadaku-scraper';
import { scrapeSamehadakuDetail } from './samehadaku-detail-scraper';
import { scrapeAnimasuDetail } from './animasu-detail-scraper';
import { calculateMatchV2 } from './anime-matcher-v2';

import type { JikanAnimeData } from '../types/jikan';
import type { ScraperResult, UnifiedAnimeDetail, UnifiedEpisode } from '../types/anime';

async function findSamehadakuSlug(jikanData: JikanAnimeData): Promise<string | null> {
  // Try to scrape home page to get list of anime
  const homeResult = await scrapeHomePage();
  
  if (!homeResult.success || homeResult.data === undefined) {
    return null;
  }
  
  const matches: MatchScore[] = [];
  
  // Try to scrape each anime and calculate match score
  for (const anime of homeResult.data.slice(0, 20)) {
    const detailResult = await scrapeSamehadakuDetail(anime.slug);
    
    if (detailResult.success && detailResult.data !== undefined) {
      const matchScore = calculateMatchScore(
        jikanData,
        detailResult.data.metadata,
        anime.slug
      );
      
      matches.push(matchScore);
    }
  }
  
  const bestMatch = findBestMatch(matches);
  return bestMatch !== null ? bestMatch.slug : null;
}

async function searchAnimasuByTitle(title: string): Promise<string | null> {
  // For now, we'll use a simple slug generation from title
  // In production, you should implement proper search functionality
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  
  return slug;
}

function generateSlugVariations(title: string, englishTitle: string | null): string[] {
  const variations: string[] = [];
  
  // Base slug from main title
  const baseSlug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  
  variations.push(baseSlug);
  
  // English title variation
  if (englishTitle !== null && englishTitle.length > 0) {
    const englishSlug = englishTitle
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    variations.push(englishSlug);
  }
  
  // Season variations - handle 2nd, 3rd, 4th, etc.
  const seasonRegex = /\s+(2nd|3rd|4th|5th|season\s+\d+)\s+season$/i;
  
  if (seasonRegex.test(title)) {
    const baseTitle = title.replace(seasonRegex, '').trim();
    const seasonMatch = title.match(/(\d+)/);
    const seasonNum = seasonMatch !== null ? seasonMatch[1] : '2';
    
    const baseTitleSlug = baseTitle
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    
    // Add multiple season format variations
    variations.push(`${baseTitleSlug}-season-${seasonNum}`);
    variations.push(`${baseTitleSlug}-s${seasonNum}`);
    variations.push(`${baseTitleSlug}-${seasonNum}`);
  }
  
  if (englishTitle !== null && seasonRegex.test(englishTitle)) {
    const baseTitle = englishTitle.replace(seasonRegex, '').trim();
    const seasonMatch = englishTitle.match(/(\d+)/);
    const seasonNum = seasonMatch !== null ? seasonMatch[1] : '2';
    
    const baseTitleSlug = baseTitle
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    
    variations.push(`${baseTitleSlug}-season-${seasonNum}`);
    variations.push(`${baseTitleSlug}-s${seasonNum}`);
    variations.push(`${baseTitleSlug}-${seasonNum}`);
  }
  
  // Remove duplicates
  return [...new Set(variations)];
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
      
      // Store all matches with confidence >= 75%
      if (matchResult.isMatch && matchResult.confidence >= 75) {
        matches.push({
          slug,
          data: result.data,
          confidence: matchResult.confidence
        });
        
        // If we found a very confident match (>= 95%), stop searching
        if (matchResult.confidence >= 95) {
          break;
        }
      }
    }
  }
  
  // Return the match with highest confidence
  if (matches.length > 0) {
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  }
  
  return null;
}

export async function getUnifiedAnimeDetail(malId: number): Promise<ScraperResult<UnifiedAnimeDetail>> {
  try {
    // 1. Fetch data from Jikan API
    const jikanResult = await fetchAnimeByMalId(malId);
    
    if (!jikanResult.success || jikanResult.data === undefined) {
      return {
        success: false,
        error: jikanResult.error ?? 'Failed to fetch anime from Jikan'
      };
    }
    
    const jikanData = jikanResult.data;
    
    // Generate slug variations
    const slugVariations = generateSlugVariations(jikanData.title, jikanData.title_english);
    
    // 2. Find matching slug in Samehadaku
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
    
    // 3. Find matching slug in Animasu
    let animasuSlug: string | null = null;
    
    const animasuMatch = await tryFindSlug(slugVariations, scrapeAnimasuDetail, jikanData);
    
    if (animasuMatch !== null) {
      animasuSlug = animasuMatch.slug;
      
      // Merge episodes
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
    
    // Sort episodes by number
    samehadakuEpisodes.sort((a, b) => a.number - b.number);
    
    // 4. Build unified response
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
