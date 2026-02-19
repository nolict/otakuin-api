import { logger } from '../../utils/logger';
import { getCachedVideoUrl, saveVideoUrlCache } from '../repositories/video-url-cache.repository';

import type { StreamingLink } from '../../types/streaming';

interface WibufileApiResponse {
  status: string;
  sources: Array<{
    file: string;
    type: string;
    label: string;
  }>;
  title?: string;
}

export async function extractWibufileVideo(link: StreamingLink): Promise<string | null> {
  const timer = logger.createTimer();

  try {
    // Check if it's a direct video URL (no extraction needed)
    if (isWibufileDirectUrl(link.url)) {
      logger.debug('WibuFile direct video URL detected', { url: link.url });
      return link.url;
    }

    // Handle embed URLs that need API extraction
    if (!link.url.includes('api.wibufile.com/embed/')) {
      return null;
    }

    // Check cache first
    const cachedUrl = await getCachedVideoUrl(link.url, 'wibufile');
    if (cachedUrl !== null) {
      logger.perf('WibuFile cache HIT', timer.split());
      return cachedUrl;
    }

    logger.debug('Extracting Wibufile video URL from embed', { url: link.url });

    const response = await fetch(link.url, {
      headers: {
        Referer: 'https://samehadaku.how/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      logger.warn('Failed to fetch Wibufile embed page', {
        status: response.status,
        url: link.url
      });
      return null;
    }

    const html = await response.text();

    const apiUrlMatch = html.match(/url:\s*"(https?:)?\/\/api\.wibufile\.com\/api\/\?([^"]+)"/);

    if (apiUrlMatch === null) {
      logger.warn('Wibufile API URL not found in embed page');
      return null;
    }

    const apiParam = apiUrlMatch[2];
    const apiUrl = `https://api.wibufile.com/api/?${apiParam}`;

    logger.debug('Fetching Wibufile API', { apiUrl });

    const apiResponse = await fetch(apiUrl, {
      headers: {
        Referer: link.url,
        Accept: 'application/json'
      }
    });

    if (!apiResponse.ok) {
      logger.warn('Failed to fetch Wibufile API', { status: apiResponse.status });
      return null;
    }

    const data = await apiResponse.json() as WibufileApiResponse;

    if (data.status !== 'ok' || data.sources === undefined || data.sources.length === 0) {
      logger.warn('Wibufile API returned no sources');
      return null;
    }

    const videoUrl = data.sources[0].file;

    logger.perf('Wibufile video extracted', timer.end(), {
      videoUrl: `${videoUrl.substring(0, 50)  }...`,
      label: data.sources[0].label
    });

    // Save to cache
    await saveVideoUrlCache(link.url, 'wibufile', videoUrl);

    return videoUrl;

  } catch (error) {
    logger.error('Wibufile video extraction failed', {
      error: error instanceof Error ? error.message : String(error),
      url: link.url
    });
    return null;
  }
}

export function isWibufileDirectUrl(url: string): boolean {
  return url.includes('wibufile.com/video') && (url.endsWith('.mp4') || url.endsWith('.m3u8'));
}

export function isWibufileUrl(url: string): boolean {
  return url.includes('wibufile.com');
}
