import { fetchHTML } from '../../utils/dom-parser';
import { logger } from '../../utils/logger';

interface BloggerVideoConfig {
  thumbnail: string;
  iframe_id: string;
  allow_resize: boolean;
  streams: Array<{
    play_url: string;
    format_id: number;
  }>;
}

export async function extractBloggerVideoUrl(bloggerUrl: string): Promise<string | null> {
  const timer = logger.createTimer();

  try {
    logger.debug('Extracting video from Blogger URL', { url: bloggerUrl });

    const html = await fetchHTML(bloggerUrl);

    const configMatch = html.match(/var VIDEO_CONFIG = (\{.*?\});?\s*<\/script>/s);
    if (configMatch === null) {
      logger.warn('VIDEO_CONFIG not found in Blogger response');
      return null;
    }

    const configJson = configMatch[1];
    const config = JSON.parse(configJson) as BloggerVideoConfig;

    if (config.streams === undefined || config.streams.length === 0) {
      logger.warn('No streams found in VIDEO_CONFIG');
      return null;
    }

    const videoUrl = config.streams[0].play_url;
    const duration = timer.split();

    logger.perf(duration, {
      has_video: videoUrl !== undefined && videoUrl !== '',
      url_length: videoUrl?.length ?? 0
    });

    return videoUrl;
  } catch (error) {
    logger.error('Failed to extract Blogger video URL', { error });
    return null;
  }
}

export function isBloggerUrl(url: string): boolean {
  return url.includes('blogger.com/video.g');
}
