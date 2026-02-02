import { supabase } from '../clients/supabase.client.js';

import type { AnimeCache, AnimeCacheMetadata } from '../../types/database.js';

const CACHE_TTL_MINUTES = 20;

export async function findAnimeCacheByMalId(malId: number): Promise<AnimeCacheMetadata | null> {
  const result = await supabase
    .from('anime_cache')
    .select('*')
    .eq('mal_id', malId)
    .single();

  if (result.error !== null) {
    if (result.error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch anime cache: ${result.error.message}`);
  }

  const cacheRecord = result.data as AnimeCache;
  const now = new Date();
  const expiresAt = new Date(cacheRecord.expires_at);

  if (now > expiresAt) {
    await deleteAnimeCache(malId);
    return null;
  }

  return cacheRecord.metadata;
}

export async function upsertAnimeCache(metadata: AnimeCacheMetadata): Promise<AnimeCache> {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + CACHE_TTL_MINUTES);

  const result = await supabase
    .from('anime_cache')
    .upsert(
      {
        mal_id: metadata.mal_id,
        metadata,
        expires_at: expiresAt.toISOString()
      },
      {
        onConflict: 'mal_id'
      }
    )
    .select()
    .single();

  if (result.error !== null) {
    throw new Error(`Failed to upsert anime cache: ${result.error.message}`);
  }

  return result.data as AnimeCache;
}

export async function deleteAnimeCache(malId: number): Promise<void> {
  const { error } = await supabase
    .from('anime_cache')
    .delete()
    .eq('mal_id', malId);

  if (error !== null) {
    throw new Error(`Failed to delete anime cache: ${error.message}`);
  }
}

export async function cleanupExpiredCache(): Promise<number> {
  const result = await supabase.rpc('cleanup_expired_cache');

  if (result.error !== null) {
    throw new Error(`Failed to cleanup expired cache: ${result.error.message}`);
  }

  return (result.data as number | null) ?? 0;
}
