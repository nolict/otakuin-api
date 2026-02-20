import { generateVideoCode } from '../../utils/code-generator';
import { createTimer, logger } from '../../utils/logger';
import { extractBerkasDriveVideoUrl, isBerkasDriveUrl } from '../extractors/berkasdrive-video.extractor';
import { extractFiledonVideoUrl, isFiledonUrl } from '../extractors/filedon-video.extractor';
import { extractMegaVideoUrl, isMegaUrl } from '../extractors/mega-video.extractor';
import { extractMp4uploadVideoUrl, isMp4uploadUrl } from '../extractors/mp4upload-video.extractor';
import { extractWibufileVideo, isWibufileUrl } from '../extractors/wibufile-video.extractor';
import { getSlugMapping } from '../repositories/slug-mapping.repository';
import { getStreamingCache, saveStreamingCache } from '../repositories/streaming-cache.repository';
import { saveVideoCode } from '../repositories/video-code-cache.repository';
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

    // Filter out removed providers (Blogger, VidHidePro)
    const filteredSources = cachedData.sources.filter(source => {
      const isRemovedProvider = source.url.includes('blogger.com') ||
                                source.url.includes('vidhidepro.com') ||
                                source.url.includes('vidhidefast.com') ||
                                source.url.includes('callistanise.com');
      return !isRemovedProvider;
    });

    const normalizedSources = filteredSources.map(normalizeSourceFieldOrder);
    const sortedSources = sortSources(normalizedSources);
    return {
      mal_id: malId,
      episode,
      sources: sortedSources
    };
  }

  logger.debug('Streaming cache MISS - Scraping from sources');

  const slugMapping = await getSlugMapping(malId);
  if (slugMapping === null) {
    logger.warn(`No slug mapping found for MAL ID: ${malId}. Please fetch /api/anime/${malId} first to discover slugs.`);
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

  // Filter out removed providers (Blogger, VidHidePro) from fresh scrapes
  const filteredSources = allSources.filter(source => {
    const isRemovedProvider = source.url.includes('blogger.com') ||
                              source.url.includes('vidhidepro.com') ||
                              source.url.includes('vidhidefast.com') ||
                              source.url.includes('callistanise.com');

    if (isRemovedProvider) {
      logger.debug('Filtered out removed provider', { url: source.url, provider: source.provider });
    }

    return !isRemovedProvider;
  });

  await enrichWithVideoUrls(filteredSources);

  await generateAndSaveVideoCodes(filteredSources);

  if (filteredSources.length > 0) {
    await saveStreamingCache({
      mal_id: malId,
      episode,
      sources: filteredSources,
      expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString()
    });
    logger.debug('Streaming cache saved', { source_count: filteredSources.length });
  }

  logger.perf(`Request completed in ${timer.elapsed()}`, {
    mal_id: malId,
    episode,
    source_count: filteredSources.length
  });

  const normalizedSources = filteredSources.map(normalizeSourceFieldOrder);
  const sortedSources = sortSources(normalizedSources);

  return {
    mal_id: malId,
    episode,
    sources: sortedSources
  };
}

function buildSamehadakuEpisodeUrl(slug: string, episode: number): string {
  return `${SAMEHADAKU_BASE_URL}${slug}-episode-${episode}/`;
}

function buildAnimasuEpisodeUrl(slug: string, episode: number): string {
  const formattedSlug = slug.replace(/-/g, '-');
  return `${ANIMASU_BASE_URL}${formattedSlug}-episode-${episode}/`;
}

async function enrichWithVideoUrls(sources: StreamingLink[]): Promise<void> {
  // Mega.nz has rate limits, so prioritize highest resolution first
  const megaSources = sources.filter(s => isMegaUrl(s.url));
  const nonMegaSources = sources.filter(s => !isMegaUrl(s.url));

  // Sort Mega sources by resolution priority (1080p > 720p > 480p > 360p)
  const resolutionPriority: Record<string, number> = {
    '1080p': 1,
    '720p': 2,
    '480p': 3,
    '360p': 4
  };

  megaSources.sort((a, b) => {
    const priorityA = resolutionPriority[a.resolution] ?? 999;
    const priorityB = resolutionPriority[b.resolution] ?? 999;
    return priorityA - priorityB;
  });

  // Extract non-Mega sources in parallel (no rate limit)
  const nonMegaPromises = nonMegaSources.map(async (source) => {
    if (isWibufileUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractWibufileVideo(source);
      source.url_video = videoUrl;
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    } else if (isFiledonUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractFiledonVideoUrl(source.url);
      source.url_video = videoUrl;
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    } else if (isBerkasDriveUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractBerkasDriveVideoUrl(source.url);
      source.url_video = videoUrl;
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    } else if (isMp4uploadUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractMp4uploadVideoUrl(source.url);
      source.url_video = videoUrl;
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    }
  });

  // Extract Mega sources sequentially by priority (highest resolution first)
  // This ensures we extract the best quality before hitting rate limits
  for (const source of megaSources) {
    const timer = logger.createTimer();
    const videoUrl = await extractMegaVideoUrl(source.url);
    source.url_video = videoUrl;
    const duration = timer.split();
    logger.perf(duration, {
      provider: source.provider,
      resolution: source.resolution,
      has_video: videoUrl !== null && videoUrl !== ''
    });

    // If extraction succeeded, we got the highest priority - can continue
    // If failed (rate limit), lower priority Mega sources will also likely fail
    if (videoUrl !== null) {
      logger.debug('Mega.nz extraction successful', { resolution: source.resolution });
    } else {
      logger.debug('Mega.nz extraction failed, skipping lower priority Mega sources');
      // Mark remaining Mega sources as failed to avoid unnecessary requests
      break;
    }
  }

  await Promise.all(nonMegaPromises);
}

async function generateAndSaveVideoCodes(sources: StreamingLink[]): Promise<void> {
  const codePromises = sources.map(async (source) => {
    const code = generateVideoCode();
    source.code = code;
    await saveVideoCode(code, source);
    logger.debug('Video code generated', { code, provider: source.provider, resolution: source.resolution });
  });

  await Promise.all(codePromises);
}

function normalizeSourceFieldOrder(source: StreamingLink): StreamingLink {
  return {
    code: source.code,
    provider: source.provider,
    url: source.url,
    url_video: source.url_video,
    resolution: source.resolution,
    server: source.server
  };
}

function sortSources(sources: StreamingLink[]): StreamingLink[] {
  const resolutionOrder: Record<string, number> = {
    '1080p': 1,
    '720p': 2,
    '480p': 3,
    '360p': 4,
    unknown: 5
  };

  return sources.sort((a, b) => {
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }

    const resA = resolutionOrder[a.resolution] ?? 999;
    const resB = resolutionOrder[b.resolution] ?? 999;

    if (resA !== resB) {
      return resA - resB;
    }

    const serverA = a.server !== undefined ? parseInt(a.server) : 999;
    const serverB = b.server !== undefined ? parseInt(b.server) : 999;
    return serverA - serverB;
  });
}
