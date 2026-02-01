import type { JikanAnimeData } from '../types/jikan';
import type { AnimeMetadata, MatchScore } from '../types/anime';

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeType(type: string): string {
  const normalized = type.toLowerCase().trim();
  
  if (normalized.includes('tv') || normalized.includes('serial')) {
    return 'tv';
  }
  if (normalized.includes('movie') || normalized.includes('film')) {
    return 'movie';
  }
  if (normalized.includes('ova')) {
    return 'ova';
  }
  if (normalized.includes('ona')) {
    return 'ona';
  }
  if (normalized.includes('special')) {
    return 'special';
  }
  
  return normalized;
}

function normalizeSeason(season?: string): string | null {
  if (season === undefined || season === null) {
    return null;
  }
  
  const normalized = season.toLowerCase().trim();
  
  if (normalized.includes('spring')) {
    return 'spring';
  }
  if (normalized.includes('summer')) {
    return 'summer';
  }
  if (normalized.includes('fall') || normalized.includes('autumn')) {
    return 'fall';
  }
  if (normalized.includes('winter')) {
    return 'winter';
  }
  
  return null;
}

function calculateTitleSimilarity(title1: string, title2: string): number {
  const norm1 = normalizeString(title1);
  const norm2 = normalizeString(title2);
  
  if (norm1 === norm2) {
    return 100;
  }
  
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 80;
  }
  
  // Calculate word overlap
  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  
  const commonWords = words1.filter((word) => words2.includes(word));
  const totalWords = Math.max(words1.length, words2.length);
  
  if (totalWords === 0) {
    return 0;
  }
  
  return (commonWords.length / totalWords) * 60;
}

export function calculateMatchScore(
  jikanData: JikanAnimeData,
  scrapedMetadata: AnimeMetadata,
  slug: string
): MatchScore {
  let score = 0;
  const reasons: string[] = [];
  
  // 1. Title matching (most important) - up to 40 points
  const titleScores: number[] = [];
  
  // Check main title
  if (jikanData.title.length > 0 && scrapedMetadata.title.length > 0) {
    const mainTitleScore = calculateTitleSimilarity(jikanData.title, scrapedMetadata.title);
    titleScores.push(mainTitleScore);
  }
  
  // Check English title
  if (
    jikanData.title_english !== null &&
    jikanData.title_english.length > 0 &&
    scrapedMetadata.alternativeTitles.english !== undefined &&
    scrapedMetadata.alternativeTitles.english.length > 0
  ) {
    const englishScore = calculateTitleSimilarity(
      jikanData.title_english,
      scrapedMetadata.alternativeTitles.english
    );
    titleScores.push(englishScore);
  }
  
  // Check Japanese title
  if (
    jikanData.title_japanese !== null &&
    jikanData.title_japanese.length > 0 &&
    scrapedMetadata.alternativeTitles.japanese !== undefined &&
    scrapedMetadata.alternativeTitles.japanese.length > 0
  ) {
    const japaneseScore = calculateTitleSimilarity(
      jikanData.title_japanese,
      scrapedMetadata.alternativeTitles.japanese
    );
    titleScores.push(japaneseScore);
  }
  
  // Check synonyms
  if (
    jikanData.title_synonyms.length > 0 &&
    scrapedMetadata.alternativeTitles.synonyms !== undefined &&
    scrapedMetadata.alternativeTitles.synonyms.length > 0
  ) {
    jikanData.title_synonyms.forEach((synonym) => {
      scrapedMetadata.alternativeTitles.synonyms?.forEach((scrapedSynonym) => {
        const synonymScore = calculateTitleSimilarity(synonym, scrapedSynonym);
        titleScores.push(synonymScore);
      });
    });
  }
  
  const maxTitleScore = titleScores.length > 0 ? Math.max(...titleScores) : 0;
  const titlePoints = (maxTitleScore / 100) * 40;
  score += titlePoints;
  
  if (maxTitleScore > 80) {
    reasons.push(`Strong title match (${maxTitleScore.toFixed(0)}%)`);
  } else if (maxTitleScore > 50) {
    reasons.push(`Moderate title match (${maxTitleScore.toFixed(0)}%)`);
  }
  
  // 2. Type matching - up to 20 points
  if (jikanData.type !== null && scrapedMetadata.type.length > 0) {
    const jikanType = normalizeType(jikanData.type);
    const scrapedType = normalizeType(scrapedMetadata.type);
    
    if (jikanType === scrapedType) {
      score += 20;
      reasons.push(`Type match: ${scrapedMetadata.type}`);
    }
  }
  
  // 3. Year matching - up to 15 points
  if (jikanData.year !== null && scrapedMetadata.year !== undefined) {
    if (jikanData.year === scrapedMetadata.year) {
      score += 15;
      reasons.push(`Year match: ${jikanData.year}`);
    } else if (Math.abs(jikanData.year - scrapedMetadata.year) === 1) {
      score += 7;
      reasons.push(`Close year: ${scrapedMetadata.year} (MAL: ${jikanData.year})`);
    }
  }
  
  // 4. Season matching - up to 10 points
  if (jikanData.season !== null && scrapedMetadata.season !== undefined) {
    const jikanSeason = normalizeSeason(jikanData.season);
    const scrapedSeason = normalizeSeason(scrapedMetadata.season);
    
    if (jikanSeason !== null && scrapedSeason !== null && jikanSeason === scrapedSeason) {
      score += 10;
      reasons.push(`Season match: ${scrapedMetadata.season}`);
    }
  }
  
  // 5. Studio matching - up to 10 points
  if (jikanData.studios.length > 0 && scrapedMetadata.studio !== undefined && scrapedMetadata.studio.length > 0) {
    const studioMatch = jikanData.studios.some((studio) => {
      const normalizedJikan = normalizeString(studio.name);
      const normalizedScraped = normalizeString(scrapedMetadata.studio ?? '');
      return normalizedJikan === normalizedScraped || normalizedJikan.includes(normalizedScraped);
    });
    
    if (studioMatch) {
      score += 10;
      reasons.push(`Studio match: ${scrapedMetadata.studio}`);
    }
  }
  
  // 6. Source matching - up to 5 points
  if (
    jikanData.source !== null &&
    jikanData.source.length > 0 &&
    scrapedMetadata.source !== undefined &&
    scrapedMetadata.source.length > 0
  ) {
    const normalizedJikan = normalizeString(jikanData.source);
    const normalizedScraped = normalizeString(scrapedMetadata.source);
    
    if (normalizedJikan === normalizedScraped) {
      score += 5;
      reasons.push(`Source match: ${scrapedMetadata.source}`);
    }
  }
  
  return {
    slug,
    score,
    reasons
  };
}

export function findBestMatch(matches: MatchScore[]): MatchScore | null {
  if (matches.length === 0) {
    return null;
  }
  
  // Sort by score descending
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  
  // Return best match only if score is reasonably high (at least 50)
  const best = sorted[0];
  
  if (best !== undefined && best.score >= 50) {
    return best;
  }
  
  return null;
}
