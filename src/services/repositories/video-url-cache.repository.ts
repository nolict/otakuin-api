import { logger } from '../../utils/logger';
import { supabase } from '../clients/supabase.client';

interface VideoUrlCacheRow {
  embed_url: string;
  provider: string;
  video_url: string;
  expires_at: string;
}

export async function getCachedVideoUrl(embedUrl: string, provider: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('video_url_cache')
      .select('video_url, expires_at')
      .eq('embed_url', embedUrl)
      .eq('provider', provider)
      .single();

    if (error !== null) {
      logger.debug('Video URL cache MISS', { provider, embed_url: embedUrl });
      return null;
    }

    const row = data as VideoUrlCacheRow;

    if (new Date(row.expires_at) < new Date()) {
      logger.debug('Video URL cache EXPIRED', { provider, embed_url: embedUrl });
      return null;
    }

    logger.debug('Video URL cache HIT', { provider, embed_url: embedUrl });
    return row.video_url;

  } catch (error) {
    logger.error('Video URL cache lookup error', {
      provider,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function saveVideoUrlCache(
  embedUrl: string,
  provider: string,
  videoUrl: string
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('video_url_cache')
      .upsert({
        embed_url: embedUrl,
        provider,
        video_url: videoUrl,
        expires_at: expiresAt
      }, {
        onConflict: 'embed_url,provider'
      });

    if (error !== null) {
      logger.error('Failed to save video URL cache', {
        provider,
        embed_url: embedUrl,
        error: error.message
      });
    } else {
      logger.debug('Video URL cached', { provider, embed_url: embedUrl, expires_at: expiresAt });
    }
  } catch (error) {
    logger.error('Video URL cache save error', {
      provider,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
