import { supabase } from '../clients/supabase.client.js';

import type { StreamingLink } from '../../types/streaming.js';

export interface StreamingCacheData {
  mal_id: number;
  episode: number;
  sources: StreamingLink[];
  expires_at: string;
}

export interface StreamingCacheInsert {
  mal_id: number;
  episode: number;
  sources: StreamingLink[];
  expires_at: string;
}

interface StreamingCacheRow {
  id: number;
  mal_id: number;
  episode: number;
  sources: unknown;
  expires_at: string;
  created_at: string;
}

const CACHE_TTL_MINUTES = 20;

export async function getStreamingCache(malId: number, episode: number): Promise<StreamingCacheData | null> {
  const result = await supabase
    .from('streaming_cache')
    .select('*')
    .eq('mal_id', malId)
    .eq('episode', episode)
    .gte('expires_at', new Date().toISOString())
    .single();

  if (result.error !== null || result.data === null) {
    return null;
  }

  const row = result.data as StreamingCacheRow;

  return {
    mal_id: row.mal_id,
    episode: row.episode,
    sources: row.sources as StreamingLink[],
    expires_at: row.expires_at
  };
}

export async function saveStreamingCache(cacheData: StreamingCacheInsert): Promise<boolean> {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + CACHE_TTL_MINUTES);

  const { error } = await supabase
    .from('streaming_cache')
    .upsert({
      mal_id: cacheData.mal_id,
      episode: cacheData.episode,
      sources: cacheData.sources,
      expires_at: expiresAt.toISOString()
    }, {
      onConflict: 'mal_id,episode'
    });

  return error === null;
}

export async function deleteExpiredStreamingCache(): Promise<number> {
  const result = await supabase.rpc('cleanup_expired_cache');

  if (result.error !== null) {
    return 0;
  }

  return (result.data as number | null) ?? 0;
}
