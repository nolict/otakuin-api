import type { JikanAnimeData, JikanResponse } from '../types/jikan';
import type { ScraperResult } from '../types/anime';

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

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
