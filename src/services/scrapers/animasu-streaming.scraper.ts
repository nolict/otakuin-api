import { fetchHTML, parseDOM } from '../../utils/dom-parser';

import type { StreamingLink, StreamingScraperResult } from '../../types/streaming';

/**
 * Scrapes streaming links from Animasu episode page
 * Extracts video sources with resolution/server information from select.mirror options
 */
export async function scrapeAnimasuStreaming(episodeUrl: string): Promise<StreamingScraperResult> {
  try {
    const html = await fetchHTML(episodeUrl);
    const $ = parseDOM(html);
    const sources: StreamingLink[] = [];

    // Find all options in select.mirror dropdown
    $('select.mirror option').each((_, element) => {
      const $option = $(element);
      const encodedValue = $option.attr('value');
      const label = $option.text().trim();

      // Skip empty option (placeholder)
      if (encodedValue === undefined || encodedValue === '' || label === 'Pilih Server/Kualitas') {
        return;
      }

      try {
        // Decode base64 to get iframe HTML
        const decodedHtml = Buffer.from(encodedValue, 'base64').toString('utf-8');

        // Extract src URL from iframe
        const srcMatch = decodedHtml.match(/src="([^"]+)"/);
        if (srcMatch?.[1] !== undefined) {
          const videoUrl = srcMatch[1];

          // Parse resolution and server from label (e.g., "1080p [1]", "720p [2]")
          const resolutionMatch = label.match(/(\d+p)/);
          const serverMatch = label.match(/\[(\d+)\]/);

          sources.push({
            code: '',
            provider: 'animasu',
            url: videoUrl,
            url_video: null,
            resolution: resolutionMatch?.[1] ?? 'unknown',
            server: serverMatch?.[1] ?? undefined
          });
        }
      } catch (decodeError) {
        const errorMessage = decodeError instanceof Error ? decodeError.message : 'Unknown error';
        console.error(`Failed to decode option value: ${errorMessage}`);
      }
    });

    if (sources.length === 0) {
      return {
        success: false,
        sources: [],
        error: 'No streaming sources found'
      };
    }

    return {
      success: true,
      sources
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      sources: [],
      error: `Failed to scrape Animasu streaming: ${errorMessage}`
    };
  }
}
