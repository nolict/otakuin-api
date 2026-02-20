import { Elysia } from 'elysia';

import { extractBerkasDriveVideoUrl, isBerkasDriveUrl } from '../services/extractors/berkasdrive-video.extractor';
import { extractFiledonVideoUrl, isFiledonUrl } from '../services/extractors/filedon-video.extractor';
import { extractMegaVideoUrl, isMegaUrl, streamMegaVideo } from '../services/extractors/mega-video.extractor';
import { extractMp4uploadVideoUrl, isMp4uploadUrl } from '../services/extractors/mp4upload-video.extractor';
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

      if (isWibufileUrl(source.url)) {
        videoUrl = await extractWibufileVideo(source);
      } else if (isFiledonUrl(source.url)) {
        videoUrl = await extractFiledonVideoUrl(source.url);
      } else if (isBerkasDriveUrl(source.url)) {
        videoUrl = await extractBerkasDriveVideoUrl(source.url);
      } else if (isMp4uploadUrl(source.url)) {
        videoUrl = await extractMp4uploadVideoUrl(source.url);
      } else if (isMegaUrl(source.url)) {
        videoUrl = await extractMegaVideoUrl(source.url);
      }

      if (videoUrl === null || videoUrl === '') {
        logger.warn('Failed to extract video URL, falling back to embed URL');
        videoUrl = source.url;
      }
    }

    try {
      logger.debug('Streaming video', { url: videoUrl.substring(0, 100) });

      if (videoUrl.includes('mega.nz/file/')) {
        logger.debug('Mega.nz video detected, using MegaJS streaming');

        const rangeHeader = request.headers.get('range');
        let start: number | undefined;
        let end: number | undefined;

        if (rangeHeader !== null) {
          const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (rangeMatch !== null) {
            start = parseInt(rangeMatch[1], 10);
            if (rangeMatch[2] !== '') {
              end = parseInt(rangeMatch[2], 10);
            }
          }
        }

        const megaResult = await streamMegaVideo(videoUrl, start, end);

        if (megaResult === null) {
          set.status = 500;
          return { error: 'Failed to stream Mega.nz video' };
        }

        const { stream: megaStream, fileSize } = megaResult;

        const responseStatus = rangeHeader !== null ? 206 : 200;
        const actualStart = start ?? 0;
        const actualEnd = end ?? fileSize - 1;
        const contentLength = actualEnd - actualStart + 1;

        set.status = responseStatus;
        set.headers['Content-Type'] = 'video/mp4';
        set.headers['Accept-Ranges'] = 'bytes';
        set.headers['Access-Control-Allow-Origin'] = '*';
        set.headers['Cache-Control'] = 'public, max-age=3600';
        set.headers['Content-Disposition'] = 'inline';
        set.headers['Content-Length'] = contentLength.toString();

        if (responseStatus === 206) {
          set.headers['Content-Range'] = `bytes ${actualStart}-${actualEnd}/${fileSize}`;
        }

        logger.debug('Mega.nz streaming with range', {
          rangeHeader,
          status: responseStatus,
          start: actualStart,
          end: actualEnd,
          contentLength,
          fileSize
        });

        return new Response(megaStream, {
          status: responseStatus,
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Disposition': 'inline',
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength.toString(),
            'Content-Range': responseStatus === 206 ? `bytes ${actualStart}-${actualEnd}/${fileSize}` : undefined,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      const rangeHeader = request.headers.get('range');

      const headers: Record<string, string> = {
        Accept: '*/*'
      };

      if (rangeHeader !== null) {
        headers.Range = rangeHeader;
      }

      if (videoUrl.includes('mp4upload.com')) {
        headers.Referer = 'https://www.mp4upload.com/';
      }

      const fetchOptions: RequestInit = {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(30000)
      };

      if (videoUrl.includes('mp4upload.com')) {
        // @ts-expect-error - Bun-specific option to ignore SSL certificate errors
        fetchOptions.tls = { rejectUnauthorized: false };
      }

      const response = await fetch(videoUrl, fetchOptions);

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
