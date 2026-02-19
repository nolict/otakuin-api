import { fetchHTML } from '../../utils/dom-parser';
import { logger } from '../../utils/logger';
import { getCachedVideoUrl, saveVideoUrlCache } from '../repositories/video-url-cache.repository';

export async function extractBerkasDriveVideoUrl(embedUrl: string): Promise<string | null> {
  const timer = logger.createTimer();

  try {
    // Check cache first
    const cachedUrl = await getCachedVideoUrl(embedUrl, 'berkasdrive');
    if (cachedUrl !== null) {
      logger.perf('BerkasDrive cache HIT', timer.split());
      return cachedUrl;
    }

    logger.debug('Extracting BerkasDrive video URL', { url: embedUrl });

    const html = await fetchHTML(embedUrl);

    // Extract video source from <source src="..." type="video/mp4" /> tag
    const sourceMatch = html.match(/<source\s+src="([^"]+)"\s+type="video\/mp4"/);

    if (sourceMatch === null) {
      logger.warn('Video source not found in BerkasDrive page');
      return null;
    }

    const videoUrl = sourceMatch[1];

    const duration = timer.split();
    logger.perf(duration, {
      has_video: true,
      url_length: videoUrl.length,
      is_cdn: videoUrl.includes('cdn-cf.berkasdrive.com')
    });

    // Save to cache
    await saveVideoUrlCache(embedUrl, 'berkasdrive', videoUrl);

    return videoUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to extract BerkasDrive video URL', { error: errorMessage });
    return null;
  }
}

export function isBerkasDriveUrl(url: string): boolean {
  return url.includes('dl.berkasdrive.com/streaming');
}
