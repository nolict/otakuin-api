import { Elysia } from 'elysia';

import { extractBerkasDriveVideoUrl, isBerkasDriveUrl } from '../services/extractors/berkasdrive-video.extractor';
import { extractBloggerVideoUrl, isBloggerUrl } from '../services/extractors/blogger-video.extractor';
import { extractFiledonVideoUrl, isFiledonUrl } from '../services/extractors/filedon-video.extractor';
import { extractVidHideProVideoUrl } from '../services/extractors/vidhidepro-video.extractor';
import { extractWibufileVideo, isWibufileUrl } from '../services/extractors/wibufile-video.extractor';
import { getVideoSourceByCode } from '../services/repositories/video-code-cache.repository';
import { logger } from '../utils/logger';

/**
 * Direct video streaming endpoint using short codes
 *
 * Usage: GET /api/video/:code
 * Example: GET /api/video/bexi68
 *
 * Returns: Direct video stream or proxied stream
 */

export const videoRoute = new Elysia({ prefix: '/api' })
  .get('/video/:code', async ({ params, set, request }) => {
    const { code } = params;

    logger.info(`Video stream requested with code: ${code}`);

    const source = await getVideoSourceByCode(code);

    if (source === null) {
      set.status = 404;
      return { error: 'Video code not found or expired' };
    }

    logger.debug('Video source found', {
      provider: source.provider,
      resolution: source.resolution,
      has_url_video: source.url_video !== null
    });

    let videoUrl = source.url_video;

    if (videoUrl === null || videoUrl === '') {
      logger.debug('url_video not available, attempting extraction');

      if (isBloggerUrl(source.url)) {
        videoUrl = await extractBloggerVideoUrl(source.url);
      } else if (isVidHideProUrl(source.url)) {
        videoUrl = await extractVidHideProVideoUrl(source.url);
      } else if (isWibufileUrl(source.url)) {
        videoUrl = await extractWibufileVideo(source);
      } else if (isFiledonUrl(source.url)) {
        videoUrl = await extractFiledonVideoUrl(source.url);
      } else if (isBerkasDriveUrl(source.url)) {
        videoUrl = await extractBerkasDriveVideoUrl(source.url);
      }

      if (videoUrl === null || videoUrl === '') {
        logger.warn('Failed to extract video URL, falling back to embed URL');
        videoUrl = source.url;
      }
    }

    try {
      logger.debug('Streaming video', { url: videoUrl.substring(0, 100) });

      const rangeHeader = request.headers.get('range');

      const headers: Record<string, string> = {
        Accept: '*/*'
      };

      if (rangeHeader !== null) {
        headers.Range = rangeHeader;
      }

      if (videoUrl.includes('dramiyos-cdn.com') || videoUrl.includes('technologyportal.site') || videoUrl.includes('callistanise.com')) {
        headers.Referer = 'https://callistanise.com/';
      }

      const response = await fetch(videoUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        logger.warn('Video fetch failed', { status: response.status });
        set.status = response.status;
        return { error: `Video source returned ${response.status}` };
      }

      if (response.status === 206) {
        set.status = 206;
      }

      let contentType = response.headers.get('Content-Type') ??
        (videoUrl.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4');

      // Fix Content-Type for video files (some providers send application/octet-stream)
      if (contentType === 'application/octet-stream' || contentType.includes('octet-stream')) {
        if (videoUrl.includes('.m3u8')) {
          contentType = 'application/vnd.apple.mpegurl';
        } else {
          contentType = 'video/mp4';
        }
      }

      const contentLength = response.headers.get('Content-Length');
      const acceptRanges = response.headers.get('Accept-Ranges') ?? 'bytes';
      const contentRange = response.headers.get('Content-Range');

      set.headers['Content-Type'] = contentType;
      set.headers['Accept-Ranges'] = acceptRanges;
      set.headers['Access-Control-Allow-Origin'] = '*';
      set.headers['Cache-Control'] = 'public, max-age=3600';
      // Override Content-Disposition to force inline (streaming) instead of attachment (download)
      set.headers['Content-Disposition'] = 'inline';

      if (contentLength !== null) {
        set.headers['Content-Length'] = contentLength;
      }

      if (contentRange !== null) {
        set.headers['Content-Range'] = contentRange;
      }

      if (contentType.includes('mpegurl') || videoUrl.includes('.m3u8')) {
        const text = await response.text();
        const baseUrl = new URL(videoUrl);
        const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);

        const modifiedPlaylist = text.split('\n').map(line => {
          if (line.startsWith('#') || line.trim() === '') {
            return line;
          }

          if (!line.startsWith('http') && !line.startsWith('#')) {
            return basePath + line.trim();
          }

          return line;
        }).join('\n');

        return new Response(modifiedPlaylist, {
          status: response.status,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': 'inline',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': 'inline',
          'Accept-Ranges': acceptRanges,
          'Content-Length': contentLength ?? '',
          'Content-Range': contentRange ?? '',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Video stream error', { error: errorMessage });

      set.status = 500;
      return { error: 'Failed to stream video' };
    }
  });

function isVidHideProUrl(url: string): boolean {
  return url.includes('vidhidepro.com') || url.includes('callistanise.com');
}
