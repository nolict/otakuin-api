import { createTimer, logger } from '../../utils/logger';
import { extractBloggerVideoUrl, isBloggerUrl } from '../extractors/blogger-video.extractor';
import { extractVidHideProVideoUrl } from '../extractors/vidhidepro-video.extractor';
import { getSlugMapping } from '../repositories/slug-mapping.repository';
import { getStreamingCache, saveStreamingCache } from '../repositories/streaming-cache.repository';
import { scrapeAnimasuStreaming } from '../scrapers/animasu-streaming.scraper';
import { scrapeSamehadakuStreaming } from '../scrapers/samehadaku-streaming.scraper';

import type { StreamingLink, StreamingResponse } from '../../types/streaming';

const ANIMASU_BASE_URL = 'https://v0.animasu.app/nonton-';
const SAMEHADAKU_BASE_URL = 'https://v1.samehadaku.how/';

export async function getStreamingLinks(malId: number, episode: number): Promise<StreamingResponse> {
  const timer = createTimer();
  logger.info(`Fetching streaming links for MAL ID: ${malId}, Episode: ${episode}`);

  const cachedData = await getStreamingCache(malId, episode);
  if (cachedData !== null) {
    logger.info(`Streaming cache HIT for MAL ${malId} Episode ${episode}`);
    logger.perf(`Request completed in ${timer.elapsed()}`, { cached: true });
    return {
      mal_id: malId,
      episode,
      sources: cachedData.sources
    };
  }

  logger.debug('Streaming cache MISS - Scraping from sources');

  const slugMapping = await getSlugMapping(malId);
  if (slugMapping === null) {
    logger.warn(`No slug mapping found for MAL ID: ${malId}`);
    return {
      mal_id: malId,
      episode,
      sources: []
    };
  }

  const allSources: StreamingLink[] = [];
  const scrapePromises: Promise<void>[] = [];

  if (slugMapping.samehadaku_slug !== null && slugMapping.samehadaku_slug !== '') {
    const samehadakuUrl = buildSamehadakuEpisodeUrl(slugMapping.samehadaku_slug, episode);
    logger.debug('Scraping Samehadaku episode', { url: samehadakuUrl });

    scrapePromises.push(
      scrapeSamehadakuStreaming(samehadakuUrl).then(result => {
        if (result.success && result.sources.length > 0) {
          allSources.push(...result.sources);
          logger.debug('Samehadaku scrape success', { source_count: result.sources.length });
        } else {
          logger.debug('Samehadaku streaming not available (dynamic JS player requires browser automation)');
        }
      })
    );
  }

  if (slugMapping.animasu_slug !== null && slugMapping.animasu_slug !== '') {
    const animasuUrl = buildAnimasuEpisodeUrl(slugMapping.animasu_slug, episode);
    logger.debug('Scraping Animasu episode', { url: animasuUrl });

    scrapePromises.push(
      scrapeAnimasuStreaming(animasuUrl).then(result => {
        if (result.success) {
          allSources.push(...result.sources);
          logger.debug('Animasu scrape success', { source_count: result.sources.length });
        } else {
          logger.warn(`Animasu scrape failed: ${result.error ?? 'Unknown error'}`);
        }
      })
    );
  }

  await Promise.all(scrapePromises);

  await enrichWithVideoUrls(allSources);

  if (allSources.length > 0) {
    await saveStreamingCache({
      mal_id: malId,
      episode,
      sources: allSources,
      expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString()
    });
    logger.debug('Streaming cache saved', { source_count: allSources.length });
  }

  logger.perf(`Request completed in ${timer.elapsed()}`, {
    mal_id: malId,
    episode,
    source_count: allSources.length
  });

  return {
    mal_id: malId,
    episode,
    sources: allSources
  };
}

function buildSamehadakuEpisodeUrl(slug: string, episode: number): string {
  return `${SAMEHADAKU_BASE_URL}${slug}-episode-${episode}/`;
}

function buildAnimasuEpisodeUrl(slug: string, episode: number): string {
  const formattedSlug = slug.replace(/-/g, '-');
  return `${ANIMASU_BASE_URL}${formattedSlug}-episode-${episode}/`;
}

function isVidHideProUrl(url: string): boolean {
  return url.includes('vidhidepro.com') || url.includes('callistanise.com');
}

async function enrichWithVideoUrls(sources: StreamingLink[]): Promise<void> {
  const extractionPromises = sources.map(async (source) => {
    if (isBloggerUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractBloggerVideoUrl(source.url);
      source.url_video = videoUrl;
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    } else if (isVidHideProUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractVidHideProVideoUrl(source.url);
      source.url_video = videoUrl;
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    }
  });

  await Promise.all(extractionPromises);
}
