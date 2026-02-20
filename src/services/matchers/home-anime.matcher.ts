import { compareTwoStrings } from 'string-similarity';
import { TfIdf } from 'natural';

import type { AnimeItem } from '../../types/anime';
import type { JikanAnimeData } from '../../types/jikan';

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAllTitles(jikanData: JikanAnimeData): string[] {
  const titles: string[] = [jikanData.title];

  if (jikanData.title_english !== null) {
    titles.push(jikanData.title_english);
  }

  if (jikanData.title_japanese !== null) {
    titles.push(jikanData.title_japanese);
  }

  if (jikanData.title_synonyms.length > 0) {
    titles.push(...jikanData.title_synonyms);
  }

  jikanData.titles.forEach((titleObj) => {
    if (!titles.includes(titleObj.title)) {
      titles.push(titleObj.title);
    }
  });

  return titles;
}

function getStudioNames(jikanData: JikanAnimeData): string[] {
  const studios: string[] = [];
  
  if (jikanData.studios !== undefined) {
    studios.push(...jikanData.studios.map((s) => s.name.toLowerCase()));
  }
  
  if (jikanData.producers !== undefined) {
    studios.push(...jikanData.producers.map((p) => p.name.toLowerCase()));
  }
  
  return studios;
}

function getGenreNames(jikanData: JikanAnimeData): string[] {
  const genres: string[] = [];
  
  if (jikanData.genres !== undefined) {
    genres.push(...jikanData.genres.map((g) => g.name.toLowerCase()));
  }
  
  if (jikanData.themes !== undefined) {
    genres.push(...jikanData.themes.map((t) => t.name.toLowerCase()));
  }
  
  if (jikanData.demographics !== undefined) {
    genres.push(...jikanData.demographics.map((d) => d.name.toLowerCase()));
  }
  
  return genres;
}

function calculateJaccardSimilarity(set1: string[], set2: string[]): number {
  if (set1.length === 0 || set2.length === 0) {
    return 0;
  }
  
  const intersection = set1.filter((item) => set2.includes(item));
  const union = [...new Set([...set1, ...set2])];
  
  return intersection.length / union.length;
}

function calculateSynopsisSimilarity(synopsis1: string | null, synopsis2: string | null): number {
  if (synopsis1 === null || synopsis2 === null) {
    return 0;
  }
  
  const tfidf = new TfIdf();
  tfidf.addDocument(synopsis1.toLowerCase());
  tfidf.addDocument(synopsis2.toLowerCase());
  
  const terms1 = synopsis1.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const terms2 = synopsis2.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  
  if (terms1.length === 0 || terms2.length === 0) {
    return 0;
  }
  
  let similarity = 0;
  const uniqueTerms = [...new Set([...terms1, ...terms2])];
  
  for (const term of uniqueTerms.slice(0, 50)) {
    const score1 = tfidf.tfidf(term, 0);
    const score2 = tfidf.tfidf(term, 1);
    
    if (score1 > 0 && score2 > 0) {
      similarity += Math.min(score1, score2);
    }
  }
  
  return Math.min(similarity / 10, 1);
}

function calculatePartialTitleScore(scrapedTitle: string, jikanTitle: string): number {
  // First try exact/near-exact match
  const exactScore = compareTwoStrings(scrapedTitle, jikanTitle);
  if (exactScore >= 0.85) {
    return exactScore;
  }
  
  // Handle short titles (like "Shibouyugi" vs "Shibou Yuugi de Meshi wo Kuu")
  // Check if scraped title is a substring or prefix
  if (scrapedTitle.length >= 4) {
    if (jikanTitle.includes(scrapedTitle)) {
      return 0.9; // High score for substring match
    }
    if (jikanTitle.startsWith(scrapedTitle)) {
      return 0.95; // Very high score for prefix match
    }
  }
  
  const scrapedWords = scrapedTitle.split(' ').filter((w) => w.length > 2);
  const jikanWords = jikanTitle.split(' ').filter((w) => w.length > 2);
  
  if (scrapedWords.length === 0 || jikanWords.length === 0) {
    return exactScore;
  }
  
  let totalScore = 0;
  let matchedWords = 0;
  
  for (const scrapedWord of scrapedWords) {
    let bestWordScore = 0;
    
    for (const jikanWord of jikanWords) {
      const wordSimilarity = compareTwoStrings(scrapedWord, jikanWord);
      if (wordSimilarity > bestWordScore) {
        bestWordScore = wordSimilarity;
      }
    }
    
    if (bestWordScore >= 0.7) {
      totalScore += bestWordScore;
      matchedWords++;
    }
  }
  
  if (matchedWords === 0) {
    return exactScore;
  }
  
  return totalScore / scrapedWords.length;
}

export function findBestMatchFromJikanResults(
  scrapedItem: AnimeItem,
  jikanResults: JikanAnimeData[]
): JikanAnimeData | null {
  if (jikanResults.length === 0) {
    return null;
  }

  const scrapedTitle = normalizeTitle(scrapedItem.animename);
  let bestMatch: JikanAnimeData | null = null;
  let bestScore = 0;

  for (const jikanData of jikanResults) {
    let totalScore = 0;
    
    // 1. Title Similarity (30 points max)
    const jikanTitles = getAllTitles(jikanData);
    let bestTitleScore = 0;
    
    for (const jikanTitle of jikanTitles) {
      const normalizedJikanTitle = normalizeTitle(jikanTitle);
      const titleScore = calculatePartialTitleScore(scrapedTitle, normalizedJikanTitle);
      
      if (titleScore > bestTitleScore) {
        bestTitleScore = titleScore;
      }
    }
    
    totalScore += bestTitleScore * 60;
    
    // 2. Studio/Producer Match (15 points max)
    const studios = getStudioNames(jikanData);
    const scrapedTitleLower = scrapedItem.animename.toLowerCase();
    
    let studioScore = 0;
    for (const studio of studios) {
      if (scrapedTitleLower.includes(studio) && studio.length > 3) {
        studioScore = 15;
        break;
      }
    }
    
    if (studioScore === 0 && studios.length > 0) {
      studioScore = 3;
    }
    
    totalScore += studioScore;
    
    // 3. Genre Overlap (15 points max)
    const jikanGenres = getGenreNames(jikanData);
    
    const scrapedGenreHints: string[] = [];
    if (scrapedTitleLower.includes('isekai')) scrapedGenreHints.push('isekai');
    if (scrapedTitleLower.includes('fantasy')) scrapedGenreHints.push('fantasy');
    if (scrapedTitleLower.includes('romance')) scrapedGenreHints.push('romance');
    if (scrapedTitleLower.includes('action')) scrapedGenreHints.push('action');
    if (scrapedTitleLower.includes('comedy')) scrapedGenreHints.push('comedy');
    if (scrapedTitleLower.includes('school')) scrapedGenreHints.push('school');
    
    const genreOverlap = calculateJaccardSimilarity(scrapedGenreHints, jikanGenres);
    totalScore += genreOverlap * 15;
    
    // 4. Synopsis Similarity (15 points max) - Skip for performance
    // Only calculate if title score is low
    if (bestTitleScore < 0.7 && jikanData.synopsis !== null) {
      const synopsisScore = calculateSynopsisSimilarity(scrapedItem.animename, jikanData.synopsis);
      totalScore += synopsisScore * 15;
    }
    
    // 5. Year Proximity (10 points max)
    const currentYear = new Date().getFullYear();
    const jikanYear = jikanData.year ?? currentYear;
    const yearDiff = Math.abs(currentYear - jikanYear);
    
    if (yearDiff === 0) {
      totalScore += 10;
    } else if (yearDiff <= 1) {
      totalScore += 7;
    } else if (yearDiff <= 2) {
      totalScore += 4;
    }
    
    // 6. Type Match (5 points max)
    const jikanType = (jikanData.type ?? '').toLowerCase();
    if (jikanType === 'tv' || jikanType.includes('tv')) {
      totalScore += 5;
    } else if (jikanType === 'movie' && scrapedTitleLower.includes('movie')) {
      totalScore += 5;
    }
    
    // 7. Episode Count Validation (5 points max)
    if (jikanData.episodes !== null && jikanData.episodes > 0) {
      totalScore += 5;
    }

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestMatch = jikanData;
    }
  }

  // Lower threshold to 40 points (40% confidence) for better recall
  if (bestScore >= 40) {
    return bestMatch;
  }

  return null;
}

export function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalized1 = normalizeTitle(title1);
  const normalized2 = normalizeTitle(title2);
  return compareTwoStrings(normalized1, normalized2);
}
