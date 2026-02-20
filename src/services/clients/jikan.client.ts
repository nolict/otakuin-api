import type { ScraperResult } from '../../types/anime';
import type { JikanAnimeData, JikanResponse, JikanSearchResponse } from '../../types/jikan';

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAnimeByMalId(malId: number): Promise<ScraperResult<JikanAnimeData>> {
  try {
    const response = await fetch(`${JIKAN_BASE_URL}/anime/${malId}`);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: `Anime with MAL ID ${malId} not found`
        };
      }
      return {
        success: false,
        error: `Jikan API error: ${response.status} ${response.statusText}`
      };
    }

    const jsonData: unknown = await response.json();

    if (
      jsonData === null ||
      jsonData === undefined ||
      typeof jsonData !== 'object' ||
      !('data' in jsonData)
    ) {
      return {
        success: false,
        error: 'Invalid response format from Jikan API'
      };
    }

    const jikanResponse = jsonData as JikanResponse;

    return {
      success: true,
      data: jikanResponse.data
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function searchAnimeByTitle(title: string): Promise<ScraperResult<JikanAnimeData[]>> {
  try {
    await delay(350);

    const encodedTitle = encodeURIComponent(title);
    const response = await fetch(`${JIKAN_BASE_URL}/anime?q=${encodedTitle}&limit=25&sfw=false`);

    if (!response.ok) {
      return {
        success: false,
        error: `Jikan search API error: ${response.status} ${response.statusText}`
      };
    }

    const jsonData: unknown = await response.json();

    if (
      jsonData === null ||
      jsonData === undefined ||
      typeof jsonData !== 'object' ||
      !('data' in jsonData)
    ) {
      return {
        success: false,
        error: 'Invalid response format from Jikan search API'
      };
    }

    const jikanResponse = jsonData as JikanSearchResponse;

    return {
      success: true,
      data: jikanResponse.data ?? []
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
