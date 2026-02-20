import { compareTwoStrings } from 'string-similarity';

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
    const jikanTitles = getAllTitles(jikanData);

    for (const jikanTitle of jikanTitles) {
      const normalizedJikanTitle = normalizeTitle(jikanTitle);
      const similarity = compareTwoStrings(scrapedTitle, normalizedJikanTitle);

      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = jikanData;
      }
    }
  }

  if (bestScore >= 0.6) {
    return bestMatch;
  }

  return null;
}

export function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalized1 = normalizeTitle(title1);
  const normalized2 = normalizeTitle(title2);
  return compareTwoStrings(normalized1, normalized2);
}
