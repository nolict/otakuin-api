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
import { getStoredVideosByEpisode } from '../repositories/video-storage.repository';
import { scrapeAnimasuStreaming } from '../scrapers/animasu-streaming.scraper';
import { scrapeSamehadakuStreaming } from '../scrapers/samehadaku-streaming.scraper';

import type { SavedVideo, StreamingLink, StreamingResponse } from '../../types/streaming';

const ANIMASU_BASE_URL = `${process.env.ANIMASU_BASE_URL ?? 'https://v0.animasu.app'}/nonton-`;
const SAMEHADAKU_BASE_URL = `${process.env.SAMEHADAKU_BASE_URL ?? 'https://v1.samehadaku.how'}/`;
const WORKER_VIDEO_PROXY_URL = process.env.WORKER_VIDEO_PROXY_URL ?? '';
const PRIMARY_STORAGE_ACCOUNT = process.env.PRIMARY_STORAGE_ACCOUNT ?? 'storage-account-1';

function wrapWithWorkerProxy(videoUrl: string | null): string | null {
  if (videoUrl === null || videoUrl === '') {
    return null;
  }

  if (WORKER_VIDEO_PROXY_URL === '') {
    logger.warn('WORKER_VIDEO_PROXY_URL not configured, returning original URL');
    return videoUrl;
  }

  // Skip if already wrapped
  if (videoUrl.startsWith(WORKER_VIDEO_PROXY_URL)) {
    return videoUrl;
  }

  return `${WORKER_VIDEO_PROXY_URL}/?url=${encodeURIComponent(videoUrl)}`;
}

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

    await enrichWithGitHubStorage(malId, episode, filteredSources);

    const normalizedSources = filteredSources.map(normalizeSourceFieldOrder);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const sortedSources = sortSources(normalizedSources);
    
    const savedVideos = await getSavedVideosSimplified(malId, episode);

    const response: StreamingResponse = {
      mal_id: malId,
      episode,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      anime_title: cachedData.anime_title,
      sources: sortedSources,
      saved_videos: savedVideos.length > 0 ? savedVideos : undefined
    };

    return response;
  }

  logger.debug('Streaming cache MISS - Scraping from sources');

  const slugMapping = await getSlugMapping(malId);
  if (slugMapping === null) {
    logger.warn(`No slug mapping found for MAL ID: ${malId}. Please fetch /api/anime/${malId} first to discover slugs.`);
    return {
      mal_id: malId,
      episode,
      anime_title: undefined,
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

  await enrichWithGitHubStorage(malId, episode, filteredSources);
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

  const animeTitle = await getAnimeTitle(malId);
  const savedVideos = await getSavedVideosSimplified(malId, episode);

  return {
    mal_id: malId,
    episode,
    anime_title: animeTitle,
    sources: sortedSources,
    saved_videos: savedVideos.length > 0 ? savedVideos : undefined
  };
}

async function getAnimeTitle(malId: number): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return undefined;
    }

    const jsonData = (await response.json()) as { data?: { title?: string } };
    return jsonData.data?.title;
  } catch (err) {
    logger.debug(`Failed to fetch anime title: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

function buildSamehadakuEpisodeUrl(slug: string, episode: number): string {
  return `${SAMEHADAKU_BASE_URL}${slug}-episode-${episode}/`;
}

function buildAnimasuEpisodeUrl(slug: string, episode: number): string {
  const formattedSlug = slug.replace(/-/g, '-');
  return `${ANIMASU_BASE_URL}${formattedSlug}-episode-${episode}/`;
}

async function enrichWithGitHubStorage(malId: number, episode: number, sources: StreamingLink[]): Promise<void> {
  const storedVideos = await getStoredVideosByEpisode(malId, episode);

  if (storedVideos.length === 0) {
    logger.debug('No GitHub storage found for this episode', { mal_id: malId, episode });
    return;
  }

  logger.info(`Found ${storedVideos.length} stored video(s) in GitHub storage`, { mal_id: malId, episode });

  for (const source of sources) {
    const serverNum = source.server !== undefined ? parseInt(source.server) : 1;
    const matchedStorage = storedVideos.find(
      v => v.resolution === source.resolution && v.server === serverNum
    );

    if (matchedStorage !== undefined) {
      const primaryAccount = matchedStorage.github_urls.find(u => u.account === PRIMARY_STORAGE_ACCOUNT);
      const fallbackUrl = matchedStorage.github_urls[0]?.url ?? null;
      const githubUrl = primaryAccount?.url ?? fallbackUrl;

      if (githubUrl !== null) {
        source.url_video = githubUrl;
        source.storage_type = 'github';

        logger.info('Updated source with GitHub storage URL', {
          resolution: source.resolution,
          server: serverNum,
          account: primaryAccount?.account ?? matchedStorage.github_urls[0]?.account,
          file_name: matchedStorage.file_name
        });
      }
    }
  }
}

async function enrichWithVideoUrls(sources: StreamingLink[]): Promise<void> {
  // Skip extraction for sources that already have GitHub storage
  const sourcesNeedingExtraction = sources.filter(s => s.storage_type !== 'github');

  if (sourcesNeedingExtraction.length === 0) {
    logger.debug('All sources using GitHub storage, skipping video URL extraction');
    return;
  }

  // Mega.nz has rate limits, so prioritize highest resolution first
  const megaSources = sourcesNeedingExtraction.filter(s => isMegaUrl(s.url));
  const nonMegaSources = sourcesNeedingExtraction.filter(s => !isMegaUrl(s.url));

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
      source.storage_type = 'cloudflare';
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    } else if (isFiledonUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractFiledonVideoUrl(source.url);
      source.url_video = videoUrl;
      source.storage_type = 'cloudflare';
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    } else if (isBerkasDriveUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractBerkasDriveVideoUrl(source.url);
      source.url_video = videoUrl;
      source.storage_type = 'cloudflare';
      const duration = timer.split();
      logger.perf(duration, { provider: source.provider, has_video: videoUrl !== null && videoUrl !== '' });
    } else if (isMp4uploadUrl(source.url)) {
      const timer = logger.createTimer();
      const videoUrl = await extractMp4uploadVideoUrl(source.url);
      source.url_video = videoUrl;
      source.storage_type = 'cloudflare';
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
    source.storage_type = 'cloudflare';
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

async function getSavedVideosSimplified(malId: number, episode: number): Promise<SavedVideo[]> {
  const storedVideos = await getStoredVideosByEpisode(malId, episode);
  
  if (storedVideos.length === 0) {
    return [];
  }

  return storedVideos.map(video => {
    const primaryAccount = video.github_urls.find(u => u.account === PRIMARY_STORAGE_ACCOUNT);
    const fallbackUrl = video.github_urls[0]?.url ?? '';
    const rawUrl = primaryAccount?.url ?? fallbackUrl;

    return {
      file_name: video.file_name,
      resolution: video.resolution,
      file_size: video.file_size_bytes,
      url: rawUrl
    };
  });
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
  const originalUrl = source.url ?? '';
  const resolvedUrl = source.url_video ?? null;
  
  let cloudflareUrl: string | null = null;
  if (resolvedUrl !== null && resolvedUrl !== '') {
    if (resolvedUrl.startsWith(WORKER_VIDEO_PROXY_URL)) {
      cloudflareUrl = resolvedUrl;
    } else {
      cloudflareUrl = wrapWithWorkerProxy(resolvedUrl);
    }
  }

  const normalized: StreamingLink = {
    code: source.code,
    provider: source.provider,
    resolution: source.resolution,
    url_video: originalUrl,
    url_resolve: resolvedUrl,
    url_cloudflare: cloudflareUrl
  };

  return normalized;
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
