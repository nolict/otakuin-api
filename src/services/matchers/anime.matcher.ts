import { distance } from 'fastest-levenshtein';
import { compareTwoStrings } from 'string-similarity';

import type { AnimeMetadata } from '../../types/anime.js';
import type { JikanAnimeData } from '../../types/jikan.js';

export interface MatchResult {
  slug: string;
  isMatch: boolean;
  confidence: number;
  details: {
    layer1_quickFilters: {
      passed: boolean;
      typeMatch: boolean;
      yearMatch: boolean;
      seasonMatch: boolean;
    };
    layer2_titleSimilarity: {
      bestMatch: string;
      levenshteinDistance: number;
      diceCoefficient: number;
      normalizedScore: number;
    };
    layer3_metadataScore: {
      totalScore: number;
      breakdown: Record<string, number>;
    };
    layer4_finalConfidence: number;
  };
  warnings: string[];
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeSuffixes(title: string): string {
  return title
    .replace(/\s+(season|s)\s*\d+$/i, '')
    .replace(/\s+(part|cour)\s*\d+$/i, '')
    .replace(/\s+\d+(st|nd|rd|th)\s+season$/i, '')
    .replace(/\s+(tv|ova|ona|special)$/i, '')
    .replace(/\s+sub\s+indo$/i, '')
    .trim();
}

function extractSeasonNumber(title: string): number | null {
  const patterns = [
    /season\s*(\d+)/i,
    /s(\d+)$/i,
    /(\d+)(st|nd|rd|th)\s+season/i,
    /\s+(\d+)$/
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1] !== undefined) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

function isSpecialContent(title: string, type: string): boolean {
  const specialKeywords = [
    'ova', 'oad', 'special', 'movie', 'film',
    'episode of', 'recap', 'summary',
    'lost girls', 'lost memories', 'picture drama'
  ];

  const normalizedTitle = title.toLowerCase();
  const normalizedType = type.toLowerCase();

  const hasSpecialKeyword = specialKeywords.some((keyword) => normalizedTitle.includes(keyword));

  const isSpecialType = normalizedType !== 'tv' &&
                        !normalizedType.includes('tv') &&
                        !normalizedType.includes('serial');

  return hasSpecialKeyword || isSpecialType;
}

function checkQuickFilters(
  jikanData: JikanAnimeData,
  scrapedMetadata: AnimeMetadata
): { passed: boolean; typeMatch: boolean; yearMatch: boolean; seasonMatch: boolean } {
  const jikanType = (jikanData.type ?? '').toLowerCase();
  const scrapedType = scrapedMetadata.type.toLowerCase();

  let typeMatch = false;
  if (jikanType === 'tv' && (scrapedType.includes('tv') || scrapedType.includes('serial'))) {
    typeMatch = true;
  } else if (jikanType === 'movie' && scrapedType.includes('movie')) {
    typeMatch = true;
  } else if (jikanType === 'ova' && scrapedType.includes('ova')) {
    typeMatch = true;
  } else if (jikanType === 'ona' && scrapedType.includes('ona')) {
    typeMatch = true;
  } else if (jikanType === 'special' && scrapedType.includes('special')) {
    typeMatch = true;
  }

  let yearMatch = false;
  if (jikanData.year !== null && scrapedMetadata.year !== undefined) {
    const yearDiff = Math.abs(jikanData.year - scrapedMetadata.year);
    yearMatch = yearDiff <= 1;
  } else {
    yearMatch = true;
  }

  let seasonMatch = true;
  if (jikanData.season !== null && scrapedMetadata.season !== undefined) {
    const jikanSeason = jikanData.season.toLowerCase();
    const scrapedSeason = scrapedMetadata.season.toLowerCase();
    seasonMatch = jikanSeason === scrapedSeason;
  }

  const passed = typeMatch && yearMatch;

  return { passed, typeMatch, yearMatch, seasonMatch };
}

// Layer 2: Title Similarity (Advanced)
function calculateTitleSimilarity(
  jikanData: JikanAnimeData,
  scrapedMetadata: AnimeMetadata
): { bestMatch: string; levenshteinDistance: number; diceCoefficient: number; normalizedScore: number } {
  const jikanTitles: string[] = [];
  const scrapedTitles: string[] = [];

  // Collect all Jikan titles
  if (jikanData.title.length > 0) {
    jikanTitles.push(normalizeTitle(jikanData.title));
    jikanTitles.push(normalizeTitle(removeSuffixes(jikanData.title)));
  }
  if (jikanData.title_english !== null && jikanData.title_english.length > 0) {
    jikanTitles.push(normalizeTitle(jikanData.title_english));
    jikanTitles.push(normalizeTitle(removeSuffixes(jikanData.title_english)));
  }
  if (jikanData.title_japanese !== null && jikanData.title_japanese.length > 0) {
    jikanTitles.push(normalizeTitle(jikanData.title_japanese));
  }
  jikanData.title_synonyms.forEach((syn) => {
    jikanTitles.push(normalizeTitle(syn));
    jikanTitles.push(normalizeTitle(removeSuffixes(syn)));
  });

  // Collect all scraped titles
  scrapedTitles.push(normalizeTitle(scrapedMetadata.title));
  scrapedTitles.push(normalizeTitle(removeSuffixes(scrapedMetadata.title)));
  if (scrapedMetadata.alternativeTitles.english !== undefined) {
    scrapedTitles.push(normalizeTitle(scrapedMetadata.alternativeTitles.english));
    scrapedTitles.push(normalizeTitle(removeSuffixes(scrapedMetadata.alternativeTitles.english)));
  }
  if (scrapedMetadata.alternativeTitles.japanese !== undefined) {
    scrapedTitles.push(normalizeTitle(scrapedMetadata.alternativeTitles.japanese));
  }
  if (scrapedMetadata.alternativeTitles.synonyms !== undefined) {
    scrapedMetadata.alternativeTitles.synonyms.forEach((syn) => {
      scrapedTitles.push(normalizeTitle(syn));
      scrapedTitles.push(normalizeTitle(removeSuffixes(syn)));
    });
  }

  // Find best match
  let bestLevenshtein = Infinity;
  let bestDice = 0;
  let bestMatchPair = '';

  jikanTitles.forEach((jTitle) => {
    scrapedTitles.forEach((sTitle) => {
      const lev = distance(jTitle, sTitle);
      const dice = compareTwoStrings(jTitle, sTitle);

      // Prefer high dice coefficient (more accurate for phrases)
      if (dice > bestDice || (dice === bestDice && lev < bestLevenshtein)) {
        bestDice = dice;
        bestLevenshtein = lev;
        bestMatchPair = `"${jTitle}" vs "${sTitle}"`;
      }
    });
  });

  // Normalize score (0-100)
  // Dice coefficient is already 0-1, so multiply by 100
  const normalizedScore = bestDice * 100;

  return {
    bestMatch: bestMatchPair,
    levenshteinDistance: bestLevenshtein,
    diceCoefficient: bestDice,
    normalizedScore
  };
}

// Layer 3: Metadata Score (Enhanced from original)
function calculateMetadataScore(
  jikanData: JikanAnimeData,
  scrapedMetadata: AnimeMetadata
): { totalScore: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let totalScore = 0;

  // Studio matching (15 points)
  if (jikanData.studios.length > 0 && scrapedMetadata.studio !== undefined && scrapedMetadata.studio.length > 0) {
    const studioMatch = jikanData.studios.some((studio) => {
      const normalizedJikan = normalizeTitle(studio.name);
      const normalizedScraped = normalizeTitle(scrapedMetadata.studio ?? '');
      return normalizedJikan === normalizedScraped ||
             normalizedJikan.includes(normalizedScraped) ||
             normalizedScraped.includes(normalizedJikan);
    });

    if (studioMatch) {
      breakdown.studio = 15;
      totalScore += 15;
    }
  }

  // Source matching (10 points)
  if (
    jikanData.source !== null &&
    jikanData.source.length > 0 &&
    scrapedMetadata.source !== undefined &&
    scrapedMetadata.source.length > 0
  ) {
    const normalizedJikan = normalizeTitle(jikanData.source);
    const normalizedScraped = normalizeTitle(scrapedMetadata.source);

    if (normalizedJikan === normalizedScraped) {
      breakdown.source = 10;
      totalScore += 10;
    }
  }

  return { totalScore, breakdown };
}

// Layer 4: Season Number Validation
function validateSeasonNumber(
  jikanData: JikanAnimeData,
  scrapedMetadata: AnimeMetadata
): { valid: boolean; warning?: string } {
  const jikanSeasonNum = extractSeasonNumber(jikanData.title);
  const scrapedSeasonNum = extractSeasonNumber(scrapedMetadata.title);

  // If both have season numbers, they must match
  if (jikanSeasonNum !== null && scrapedSeasonNum !== null) {
    if (jikanSeasonNum !== scrapedSeasonNum) {
      return {
        valid: false,
        warning: `Season mismatch: Jikan has S${jikanSeasonNum}, Site has S${scrapedSeasonNum}`
      };
    }
  }

  // Check for special content mismatches
  const jikanIsSpecial = isSpecialContent(jikanData.title, jikanData.type ?? '');
  const scrapedIsSpecial = isSpecialContent(scrapedMetadata.title, scrapedMetadata.type);

  if (jikanIsSpecial !== scrapedIsSpecial) {
    return {
      valid: false,
      warning: 'Special content type mismatch (OVA/Movie vs TV Series)'
    };
  }

  return { valid: true };
}

export function calculateMatchV2(
  jikanData: JikanAnimeData,
  scrapedMetadata: AnimeMetadata,
  slug: string
): MatchResult {
  const warnings: string[] = [];

  // Layer 1: Quick Filters
  const layer1 = checkQuickFilters(jikanData, scrapedMetadata);

  if (!layer1.typeMatch) {
    warnings.push(`Type mismatch: ${jikanData.type} vs ${scrapedMetadata.type}`);
  }
  if (!layer1.yearMatch) {
    warnings.push(`Year mismatch: ${jikanData.year} vs ${scrapedMetadata.year}`);
  }
  if (!layer1.seasonMatch) {
    warnings.push(`Season mismatch: ${jikanData.season} vs ${scrapedMetadata.season}`);
  }

  // Layer 2: Title Similarity (50 points max)
  const layer2 = calculateTitleSimilarity(jikanData, scrapedMetadata);
  const titleScore = layer2.normalizedScore * 0.5; // Scale to 50 points

  // Layer 3: Metadata Score (25 points max)
  const layer3 = calculateMetadataScore(jikanData, scrapedMetadata);
  const metadataScore = layer3.totalScore;

  // Layer 4: Season Validation
  const seasonValidation = validateSeasonNumber(jikanData, scrapedMetadata);
  if (!seasonValidation.valid && seasonValidation.warning !== undefined) {
    warnings.push(seasonValidation.warning);
  }

  // Calculate final confidence (0-100)
  let confidence = 0;

  if (layer1.passed) {
    confidence += 25; // Base score for passing quick filters
    confidence += titleScore; // Up to 50 points
    confidence += metadataScore; // Up to 25 points

    // Bonus for exact matches
    if (layer2.diceCoefficient >= 0.95) {
      confidence += 10;
    }

    // Penalty for season validation failure
    if (!seasonValidation.valid) {
      confidence -= 30;
    }

    // Cap at 100
    confidence = Math.min(confidence, 100);
  }

  // Decision: Accept if confidence >= 75%
  const isMatch = layer1.passed && confidence >= 75 && seasonValidation.valid;

  return {
    slug,
    isMatch,
    confidence,
    details: {
      layer1_quickFilters: layer1,
      layer2_titleSimilarity: layer2,
      layer3_metadataScore: layer3,
      layer4_finalConfidence: confidence
    },
    warnings
  };
}
