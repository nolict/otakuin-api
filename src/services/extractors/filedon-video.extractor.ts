import { fetchHTML } from '../../utils/dom-parser';
import { logger } from '../../utils/logger';
import { getCachedVideoUrl, saveVideoUrlCache } from '../repositories/video-url-cache.repository';

interface FiledonPageData {
  component: string;
  props: {
    url?: string;
    files?: {
      name: string;
      path: string;
      mime_type: string;
      size: number;
    };
  };
}

export async function extractFiledonVideoUrl(embedUrl: string): Promise<string | null> {
  const timer = logger.createTimer();

  try {
    // Check cache first
    const cachedUrl = await getCachedVideoUrl(embedUrl, 'filedon');
    if (cachedUrl !== null) {
      logger.perf('Filedon cache HIT', timer.split());
      return cachedUrl;
    }

    logger.debug('Extracting Filedon video URL', { url: embedUrl });

    const html = await fetchHTML(embedUrl);

    const dataPageMatch = html.match(/data-page="([^"]+)"/);

    if (dataPageMatch === null) {
      logger.warn('data-page attribute not found in Filedon embed page');
      return null;
    }

    const htmlEncodedJson = dataPageMatch[1];
    const decodedJson = htmlEncodedJson
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'");

    const pageData = JSON.parse(decodedJson) as FiledonPageData;

    const videoUrl = pageData.props.url;

    if (videoUrl === undefined || videoUrl === '') {
      logger.warn('Video URL not found in Filedon page data');
      return null;
    }

    const duration = timer.split();
    logger.perf(duration, {
      has_video: true,
      url_length: videoUrl.length,
      file_name: pageData.props.files?.name ?? 'unknown'
    });

    // Save to cache
    await saveVideoUrlCache(embedUrl, 'filedon', videoUrl);

    return videoUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to extract Filedon video URL', { error: errorMessage });
    return null;
  }
}

export function isFiledonUrl(url: string): boolean {
  return url.includes('filedon.co/embed/');
}
