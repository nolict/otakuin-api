import { fetchHTML, parseDOM } from '../../utils/dom-parser';

import type { StreamingLink, StreamingScraperResult } from '../../types/streaming';

/**
 * Scrapes streaming links from Samehadaku episode page
 */
export async function scrapeSamehadakuStreaming(episodeUrl: string): Promise<StreamingScraperResult> {
  try {
    const html = await fetchHTML(episodeUrl);
    const $ = parseDOM(html);
    const sources: StreamingLink[] = [];

    // Strategy 0: Extract dynamic player options (AJAX-loaded)
    const playerOptions: Array<{ post: string; nume: string; type: string; resolution: string }> = [];

    $('.east_player_option').each((_, element) => {
      const $option = $(element);
      const dataPost = $option.attr('data-post');
      const dataNume = $option.attr('data-nume');
      const dataType = $option.attr('data-type');
      const label = $option.find('span').text().trim();

      if (dataPost !== undefined && dataNume !== undefined && dataType !== undefined) {
        const resolutionMatch = label.match(/(\d+p)/i);
        playerOptions.push({
          post: dataPost,
          nume: dataNume,
          type: dataType,
          resolution: resolutionMatch?.[1]?.toLowerCase() ?? 'unknown'
        });
      }
    });

    // Fetch actual video URLs from AJAX endpoint using FormData (WordPress requirement)
    if (playerOptions.length > 0) {
      const baseUrl = new URL(episodeUrl);
      const ajaxPromises = playerOptions.map(async (option) => {
        try {
          // WordPress AJAX requires FormData POST, not query params
          const formData = new FormData();
          formData.append('action', 'player_ajax');
          formData.append('post', option.post);
          formData.append('nume', option.nume);
          formData.append('type', option.type);

          const ajaxUrl = `${baseUrl.origin}/wp-admin/admin-ajax.php`;
          const ajaxResponse = await fetch(ajaxUrl, {
            method: 'POST',
            body: formData
          });

          const ajaxHtml = await ajaxResponse.text();

          // Parse AJAX response to extract iframe src or video URL
          const $ajax = parseDOM(ajaxHtml);
          const iframeSrc = $ajax('iframe').attr('src');

          if (iframeSrc !== undefined && iframeSrc !== '') {
            return {
              provider: 'samehadaku' as const,
              url: iframeSrc,
              url_video: null,
              resolution: option.resolution,
              server: option.nume
            };
          }

          // Try to find video source directly
          const videoSrc = $ajax('video source').attr('src') ?? $ajax('video').attr('src');
          if (videoSrc !== undefined && videoSrc !== '') {
            return {
              provider: 'samehadaku' as const,
              url: videoSrc,
              url_video: null,
              resolution: option.resolution,
              server: option.nume
            };
          }

          return null;
        } catch {
          return null;
        }
      });

      const ajaxResults = await Promise.all(ajaxPromises);
      const validSources = ajaxResults.filter((s): s is NonNullable<typeof s> => s !== null) as StreamingLink[];
      sources.push(...validSources);
    }

    // Strategy 1: Look for download links section
    // Extract resolution from surrounding text (e.g., "360p", "480p")
    $('.download-eps li, .downloads li, .download li').each((_, element) => {
      const $li = $(element);
      const liText = $li.text();
      const resolutionMatch = liText.match(/\b(\d+p)\b/i);

      if (resolutionMatch !== null) {
        const resolution = resolutionMatch[1].toLowerCase();

        // Find first link that's NOT a file hosting site (prefer direct links)
        $li.find('a').each((_, linkElement) => {
          const $link = $(linkElement);
          const href = $link.attr('href');
          const linkText = $link.text().trim();

          if (href !== undefined && href !== '') {
            // Skip file hosting sites (these are download, not streaming)
            const isFileHost = href.includes('gofile.io') ||
                              href.includes('krakenfiles') ||
                              href.includes('mediafire') ||
                              href.includes('acefile') ||
                              href.includes('pixeldrain') ||
                              href.includes('filedon');

            // Only add if it looks like a streaming link
            if (!isFileHost && (href.includes('embed') || href.includes('player') || href.includes('stream'))) {
              sources.push({
                provider: 'samehadaku',
                url: href,
                url_video: null,
                resolution,
                server: linkText
              });
            }
          }
        });
      }
    });

    // Strategy 2: Look for select/option dropdown for mirrors/quality
    $('select.mirror option, select[name="mirror"] option, select option').each((_, element) => {
      const $option = $(element);
      const value = $option.attr('value');
      const text = $option.text().trim();

      if (value === undefined || value === '' || text === 'Pilih Server' || text === 'Pilih Kualitas') {
        return;
      }

      // Check if value is base64 encoded
      if (value.length > 50 && /^[A-Za-z0-9+/=]+$/.test(value)) {
        try {
          const decodedHtml = Buffer.from(value, 'base64').toString('utf-8');
          const srcMatch = decodedHtml.match(/src="([^"]+)"/);

          if (srcMatch?.[1] !== undefined) {
            const resolutionMatch = text.match(/(\d+p)/i);
            const serverMatch = text.match(/\[(\d+)\]|\((\d+)\)/);

            sources.push({
              provider: 'samehadaku',
              url: srcMatch[1],
              url_video: null,
              resolution: resolutionMatch?.[1]?.toLowerCase() ?? 'unknown',
              server: serverMatch?.[1] ?? serverMatch?.[2] ?? undefined
            });
          }
        } catch {
          // If not base64, treat as direct URL
          if (value.startsWith('http')) {
            const resolutionMatch = text.match(/(\d+p)/i);
            sources.push({
              provider: 'samehadaku',
              url: value,
              url_video: null,
              resolution: resolutionMatch?.[1]?.toLowerCase() ?? 'unknown'
            });
          }
        }
      } else if (value.startsWith('http')) {
        const resolutionMatch = text.match(/(\d+p)/i);
        sources.push({
          provider: 'samehadaku',
          url: value,
          url_video: null,
          resolution: resolutionMatch?.[1]?.toLowerCase() ?? 'unknown'
        });
      }
    });

    // Strategy 3: Look for iframe sources directly
    $('iframe[src*="embed"], iframe[src*="player"]').each((_, element) => {
      const $iframe = $(element);
      const src = $iframe.attr('src');

      if (src !== undefined && src !== '') {
        sources.push({
          provider: 'samehadaku',
          url: src,
          url_video: null,
          resolution: 'unknown'
        });
      }
    });

    // Strategy 4: Look for ALL iframes as last resort
    if (sources.length === 0) {
      $('iframe').each((_, element) => {
        const $iframe = $(element);
        const src = $iframe.attr('src');

        if (src !== undefined && src !== '' && !src.includes('facebook') && !src.includes('disqus')) {
          sources.push({
            provider: 'samehadaku',
            url: src,
            url_video: null,
            resolution: 'unknown'
          });
        }
      });
    }

    // Strategy 5: Look for video tags
    if (sources.length === 0) {
      $('video source, video').each((_, element) => {
        const $video = $(element);
        const src = $video.attr('src');

        if (src !== undefined && src !== '') {
          sources.push({
            provider: 'samehadaku',
            url: src,
            url_video: null,
            resolution: 'unknown'
          });
        }
      });
    }

    // Strategy 6: Look for data-src or data-url attributes (lazy loading)
    if (sources.length === 0) {
      $('[data-src], [data-url]').each((_, element) => {
        const $elem = $(element);
        const dataSrc = $elem.attr('data-src') ?? $elem.attr('data-url');

        if (dataSrc !== undefined && dataSrc !== '' && (dataSrc.includes('embed') || dataSrc.includes('player') || dataSrc.includes('video'))) {
          sources.push({
            provider: 'samehadaku',
            url: dataSrc,
            url_video: null,
            resolution: 'unknown'
          });
        }
      });
    }

    // Remove duplicates based on URL
    const uniqueSources = sources.filter((source, index, self) =>
      index === self.findIndex(s => s.url === source.url)
    );

    if (uniqueSources.length === 0) {
      return {
        success: false,
        sources: [],
        error: 'No streaming sources found (possible Cloudflare protection)'
      };
    }

    return {
      success: true,
      sources: uniqueSources
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      sources: [],
      error: `Failed to scrape Samehadaku streaming: ${errorMessage}`
    };
  }
}
