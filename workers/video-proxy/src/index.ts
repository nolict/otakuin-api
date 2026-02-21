interface Env {
  GITHUB_STORAGE_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const videoUrl = url.searchParams.get('url');

    if (videoUrl === null || videoUrl === '') {
      return new Response('Missing url parameter', { status: 400 });
    }

    try {
      const headers: Record<string, string> = {
        Accept: '*/*'
      };

      // For GitHub API URLs with asset_id (api.github.com/repos/{owner}/{repo}/releases/assets/{id})
      if (videoUrl.includes('api.github.com/repos') && videoUrl.includes('/releases/assets/')) {
        if (env.GITHUB_STORAGE_TOKEN) {
          headers.Authorization = `token ${env.GITHUB_STORAGE_TOKEN}`;
          headers.Accept = 'application/octet-stream';
          headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
        }
      } else if (videoUrl.includes('github.com') && env.GITHUB_STORAGE_TOKEN) {
        headers.Authorization = `token ${env.GITHUB_STORAGE_TOKEN}`;
      }

      if (videoUrl.includes('mp4upload.com')) {
        headers.Referer = 'https://www.mp4upload.com/';
        headers.Origin = 'https://www.mp4upload.com';
      } else if (videoUrl.includes('vidhidepro.com') || videoUrl.includes('vidhidefast.com')) {
        headers.Referer = 'https://callistanise.com/';
        headers.Origin = 'https://callistanise.com';
      }

      if (request.headers.has('range')) {
        headers.Range = request.headers.get('range') ?? '';
      }

      const response = await fetch(videoUrl, {
        headers,
        redirect: 'follow',
        cf: {
          cacheTtl: 3600,
          cacheEverything: true
        }
      });

      if (!response.ok) {
        return new Response(`Upstream error: ${response.status} ${response.statusText}`, {
          status: response.status
        });
      }

      const actualUrl = response.url || videoUrl;
      const baseUrl = new URL(actualUrl);

      let contentType = response.headers.get('Content-Type') ?? 'video/mp4';
      if (contentType === 'application/octet-stream' || contentType.includes('octet-stream')) {
        if (actualUrl.includes('.m3u8')) {
          contentType = 'application/vnd.apple.mpegurl';
        } else {
          contentType = 'video/mp4';
        }
      }

      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Content-Disposition': 'inline'
      };

      if (response.headers.has('Content-Length')) {
        responseHeaders['Content-Length'] = response.headers.get('Content-Length') ?? '';
      }

      if (response.headers.has('Content-Range')) {
        responseHeaders['Content-Range'] = response.headers.get('Content-Range') ?? '';
      } else if (response.headers.has('Accept-Ranges')) {
        responseHeaders['Accept-Ranges'] = response.headers.get('Accept-Ranges') ?? 'bytes';
      } else {
        responseHeaders['Accept-Ranges'] = 'bytes';
      }

      if (contentType.includes('mpegurl') || contentType.includes('m3u8')) {
        const text = await response.text();
        const basePath = actualUrl.substring(0, actualUrl.lastIndexOf('/') + 1);

        const processedPlaylist = text.split('\n').map(line => {
          if (line.trim().length === 0 || line.startsWith('#')) {
            return line;
          }

          if (line.startsWith('http://') || line.startsWith('https://')) {
            return `${baseUrl.origin}${url.pathname}?url=${encodeURIComponent(line)}`;
          }

          const absoluteUrl = basePath + line.trim();
          return `${baseUrl.origin}${url.pathname}?url=${encodeURIComponent(absoluteUrl)}`;
        }).join('\n');

        return new Response(processedPlaylist, {
          status: response.status,
          headers: responseHeaders
        });
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, {
        status: 500
      });
    }
  }
};
