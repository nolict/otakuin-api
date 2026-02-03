import { supabase } from '../clients/supabase.client';
import { logger } from '../../utils/logger';

import type { StreamingLink } from '../../types/streaming';

interface VideoCodeCacheRow {
  code: string;
  source_data: StreamingLink;
  expires_at: string;
}

export async function saveVideoCode(code: string, source: StreamingLink): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('video_code_cache')
      .insert({
        code,
        source_data: source,
        expires_at: expiresAt
      });

    if (error !== null) {
      logger.error('Failed to save video code', { code, error: error.message });
    } else {
      logger.debug('Video code saved', { code, expires_at: expiresAt });
    }
  } catch (error) {
    logger.error('Video code save error', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

export async function getVideoSourceByCode(code: string): Promise<StreamingLink | null> {
  try {
    const { data, error } = await supabase
      .from('video_code_cache')
      .select('source_data, expires_at')
      .eq('code', code)
      .single();

    if (error !== null) {
      logger.debug('Video code not found', { code });
      return null;
    }

    const row = data as VideoCodeCacheRow;

    if (new Date(row.expires_at) < new Date()) {
      logger.debug('Video code expired', { code });
      return null;
    }

    logger.debug('Video code found', { code });
    return row.source_data;

  } catch (error) {
    logger.error('Video code lookup error', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
}
