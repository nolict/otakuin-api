import { Elysia } from 'elysia';

import { logger } from '../utils/logger';

/**
 * Video proxy endpoint for streaming IP-locked URLs
 *
 * Problem: Blogger video URLs contain ip={server_ip} parameter
 * Google Video validates that request IP matches URL parameter
 * Client direct access fails because client IP ≠ server IP
 *
 * Solution: Server proxies the video stream
 * - Server fetches video with its own IP (matches URL parameter)
 * - Server streams video chunks directly to client (no buffering)
 * - Supports Range requests for seeking/skipping
 *
 * Performance: ~1-5MB memory per stream, handles 100+ concurrent users
 */
export const videoProxyRoute = new Elysia({ prefix: '/api' })
  .get('/video-proxy', async ({ query, set, request }) => {
    const videoUrl = query.url;

    if (videoUrl === undefined || videoUrl === '') {
      set.status = 400;
      return { error: 'Missing url parameter' };
    }

    // Security: Only allow trusted video domains
    const allowedDomains = [
      'googlevideo.com',
      'dramiyos-cdn.com',
      'technologyportal.site',
      'callistanise.com',
      'vidhidepro.com',
      'vidhidefast.com',
      'tiktokcdn.com', // HLS segments from VidHidePro
      'wibufile.com', // Wibufile direct video URLs
      'cloudflarestorage.com', // Filedon R2 storage
      'berkasdrive.com', // BerkasDrive CDN
      'miterequest.my.id' // BerkasDrive alternative server
    ];

    const isAllowed = allowedDomains.some(domain => videoUrl.includes(domain));

    if (!isAllowed) {
      set.status = 403;
      return { error: 'Invalid video URL domain' };
    }

    try {
      logger.debug('Proxying video stream', { url: videoUrl.substring(0, 100) });

      // Forward Range header for seeking support
      const rangeHeader = request.headers.get('range');

      // Critical: Google Video rejects known User-Agent headers
      // Solution: Don't send User-Agent at all (raw request works!)
      // HLS streams: Need Referer header for some CDNs
      const headers: Record<string, string> = {
        Accept: '*/*'
      };

      if (rangeHeader !== null) {
        headers.Range = rangeHeader;
      }

      // Add Referer for VidHidePro/Callistanise domains
      if (videoUrl.includes('dramiyos-cdn.com') || videoUrl.includes('technologyportal.site') || videoUrl.includes('callistanise.com')) {
        headers.Referer = 'https://callistanise.com/';
      }

      // Fetch video from source (follow redirects automatically)
      const response = await fetch(videoUrl, {
        headers,
        redirect: 'follow', // Follow 301/302 redirects
        signal: AbortSignal.timeout(30000) // 30-second timeout
      });

      if (!response.ok) {
        logger.warn('Video fetch failed', { status: response.status, url: videoUrl.substring(0, 100) });
        set.status = response.status;
        return { error: `Video source returned ${response.status}` };
      }

      // Handle partial content (Range requests)
      if (response.status === 206) {
        set.status = 206;
      }

      // Set response headers for video streaming
      // Auto-detect content type (MP4, HLS m3u8, etc.)
      const contentType = response.headers.get('Content-Type') ??
        (videoUrl.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4');
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

      logger.debug('Video stream started', {
        content_type: contentType,
        content_length: contentLength ?? 'chunked',
        status: response.status
      });

      // Special handling for HLS playlists - convert relative URLs to absolute
      if (contentType.includes('mpegurl') || videoUrl.includes('.m3u8')) {
        const text = await response.text();
        const baseUrl = new URL(videoUrl);
        const basePath = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);

        // Replace relative URLs in playlist with absolute URLs
        const modifiedPlaylist = text.split('\n').map(line => {
          // Skip comments and empty lines
          if (line.startsWith('#') || line.trim() === '') {
            return line;
          }

          // If line is a relative URL (not starting with http), make it absolute
          if (!line.startsWith('http') && !line.startsWith('#')) {
            return basePath + line.trim();
          }

          return line;
        }).join('\n');

        logger.debug('HLS playlist modified', { original_lines: text.split('\n').length, base_path: basePath });

        return new Response(modifiedPlaylist, {
          status: response.status,
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      // Return raw Response object to preserve binary stream
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': 'inline', // Force streaming instead of download
          'Accept-Ranges': acceptRanges,
          'Content-Length': contentLength ?? '',
          'Content-Range': contentRange ?? '',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Video proxy error', { error: errorMessage });

      set.status = 500;
      return { error: 'Failed to proxy video stream' };
    }
  });
