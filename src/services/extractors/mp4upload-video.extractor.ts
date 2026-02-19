import { fetchHTML } from '../../utils/dom-parser';
import { logger } from '../../utils/logger';
import { getCachedVideoUrl, saveVideoUrlCache } from '../repositories/video-url-cache.repository';

export function isMp4uploadUrl(url: string): boolean {
  return url.includes('mp4upload.com/embed-');
}

export async function extractMp4uploadVideoUrl(embedUrl: string): Promise<string | null> {
  const cachedUrl = await getCachedVideoUrl(embedUrl, 'mp4upload');
  if (cachedUrl !== null) {
    logger.debug('MP4Upload video URL found in cache', { embedUrl });
    return cachedUrl;
  }

  const timer = logger.createTimer();

  try {
    const html = await fetchHTML(embedUrl, 30000);

    const srcRegex = /src:\s*"([^"]+\.mp4[^"]*)"/;
    const match = html.match(srcRegex);

    if (match?.[1] === undefined) {
      logger.warn('MP4Upload video URL not found in player.src()', { embedUrl });
      return null;
    }

    const videoUrl = match[1];
    logger.perf('MP4Upload video extracted', timer.end(), { embedUrl, videoUrl });

    await saveVideoUrlCache(embedUrl, 'mp4upload', videoUrl);

    return videoUrl;
  } catch (error) {
    logger.error('Failed to extract MP4Upload video URL', { embedUrl, error });
    return null;
  }
}
