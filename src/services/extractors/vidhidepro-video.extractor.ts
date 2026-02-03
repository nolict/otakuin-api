import { fetchHTML } from '../../utils/dom-parser';
import { logger } from '../../utils/logger';

interface VidHideProVideoUrls {
  hls2?: string;
  hls3?: string;
  hls4?: string;
}

export async function extractVidHideProVideoUrl(embedUrl: string): Promise<string | null> {
  const timer = logger.createTimer();

  try {
    logger.debug('Extracting VidHidePro video URL', { embedUrl });

    const html = await fetchHTML(embedUrl);

    const videoUrls = decodeVidHideProUrls(html, embedUrl);

    if (videoUrls === null) {
      logger.warn('Failed to decode VidHidePro packed JavaScript');
      return null;
    }

    const finalUrl = selectBestUrl(videoUrls, embedUrl);

    if (finalUrl !== null && finalUrl !== '') {
      logger.perf('VidHidePro extraction completed', timer.split());
      logger.debug('Extracted video URL', { url: finalUrl });
    }

    return finalUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('VidHidePro extraction failed', { error: errorMessage });
    return null;
  }
}

function decodeVidHideProUrls(html: string, _embedUrl: string): VidHideProVideoUrls | null {
  // Simplified regex to capture eval-packed JavaScript
  const evalMatch = html.match(
    /eval\(function\(p,a,c,k,e,d\)\{[^}]+\}\('(.+?)',(\d+),(\d+),'(.+?)'\.split\('\|'\)\)\)/s
  );

  if (evalMatch === null) {
    logger.debug('No eval-packed code found in HTML');
    return null;
  }

  const [, packed, baseStr, countStr, keywords] = evalMatch;
  const base = parseInt(baseStr);
  const count = parseInt(countStr);
  const keywordArray = keywords.split('|');

  const decoded = unpackJavaScript(packed, base, count, keywordArray);

  const linksMatch = decoded.match(/var\s+\w+\s*=\s*(\{[^}]*"hls[^}]*\})/);

  if (linksMatch === null) {
    logger.debug('No links object found in decoded code');
    return null;
  }

  try {
    // JSON is already valid with double quotes
    const linksJson = linksMatch[1];

    const links = JSON.parse(linksJson) as VidHideProVideoUrls;

    logger.debug('Decoded links', { links });

    return links;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to parse links JSON', { error: errorMsg, json: linksMatch[1].substring(0, 200) });
    return null;
  }
}

function unpackJavaScript(packed: string, base: number, count: number, keywords: string[]): string {
  let result = packed;

  for (let i = count - 1; i >= 0; i--) {
    if (keywords[i] !== undefined && keywords[i] !== '') {
      const pattern = new RegExp(`\\b${i.toString(base)}\\b`, 'g');
      result = result.replace(pattern, keywords[i]);
    }
  }

  return result;
}

function selectBestUrl(videoUrls: VidHideProVideoUrls, embedUrl: string): string | null {
  if (videoUrls.hls4 !== undefined && videoUrls.hls4 !== '') {
    const baseUrl = new URL(embedUrl).origin;
    return videoUrls.hls4.startsWith('/')
      ? `${baseUrl}${videoUrls.hls4}`
      : videoUrls.hls4;
  }

  if (videoUrls.hls3 !== undefined && videoUrls.hls3 !== '') {
    return videoUrls.hls3;
  }

  if (videoUrls.hls2 !== undefined && videoUrls.hls2 !== '') {
    return videoUrls.hls2;
  }

  return null;
}
