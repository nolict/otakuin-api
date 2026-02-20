import { logger } from '../../utils/logger';
import { getSupabaseClient } from '../clients/supabase.client';

import type { HomePageCache, HomePageCacheInsert } from '../../types/database';

const CACHE_TTL_HOURS = 6;

export async function getCachedHomePage(): Promise<HomePageCache[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('home_page_cache')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('mal_id', { ascending: true });

  if (error !== null) {
    logger.error('Failed to get home page cache', error);
    return [];
  }

  if (data === null || data.length === 0) {
    return [];
  }

  return data as HomePageCache[];
}

export async function saveHomePageCache(items: HomePageCacheInsert[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('home_page_cache')
    .upsert(items, {
      onConflict: 'mal_id',
      ignoreDuplicates: false
    });

  if (error !== null) {
    logger.error('Failed to save home page cache', error);
  }
}

export async function clearHomePageCache(): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('home_page_cache')
    .delete()
    .lt('expires_at', new Date().toISOString());

  if (error !== null) {
    logger.error('Failed to clear expired home page cache', error);
  }
}

export function createHomePageCacheItem(
  malId: number,
  name: string,
  cover: string,
  lastEpisode: number | null,
  slugSamehadaku: string | null,
  slugAnimasu: string | null,
  airedFrom: string | null
): HomePageCacheInsert {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);

  return {
    mal_id: malId,
    name,
    cover,
    last_episode: lastEpisode,
    slug_samehadaku: slugSamehadaku,
    slug_animasu: slugAnimasu,
    aired_from: airedFrom,
    expires_at: expiresAt.toISOString()
  };
}
