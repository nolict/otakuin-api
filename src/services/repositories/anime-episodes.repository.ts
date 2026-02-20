import { getSupabaseClient } from '../clients/supabase.client';

export async function getEpisodeCountBySlug(
  slugSamehadaku: string | null,
  slugAnimasu: string | null
): Promise<number | null> {
  if (slugSamehadaku === null && slugAnimasu === null) {
    return null;
  }

  const supabase = getSupabaseClient();

  let query = supabase
    .from('slug_mappings')
    .select('mal_id');

  if (slugSamehadaku !== null) {
    query = query.eq('samehadaku_slug', slugSamehadaku);
  } else if (slugAnimasu !== null) {
    query = query.eq('animasu_slug', slugAnimasu);
  }

  const { data: slugData, error: slugError } = await query
    .limit(1)
    .single();

  if (slugError !== null || slugData === null) {
    return null;
  }

  const { data: cacheData, error: cacheError } = await supabase
    .from('anime_cache')
    .select('metadata')
    .eq('mal_id', slugData.mal_id)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .single();

  if (cacheError !== null || cacheData === null) {
    return null;
  }

  const metadata = cacheData.metadata as {
    episode_list?: Array<{ episode: number }>;
  };

  if (metadata.episode_list === undefined || metadata.episode_list.length === 0) {
    return null;
  }

  return metadata.episode_list.length;
}

export async function getSlugsByMalId(malId: number): Promise<{
  slugSamehadaku: string | null;
  slugAnimasu: string | null;
} | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('slug_mappings')
    .select('samehadaku_slug, animasu_slug')
    .eq('mal_id', malId)
    .limit(1)
    .single();

  if (error !== null || data === null) {
    return null;
  }

  return {
    slugSamehadaku: data.samehadaku_slug as string | null,
    slugAnimasu: data.animasu_slug as string | null
  };
}

export async function batchGetSlugsByMalIds(malIds: number[]): Promise<Map<number, {
  slugSamehadaku: string | null;
  slugAnimasu: string | null;
}>> {
  if (malIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('slug_mappings')
    .select('mal_id, samehadaku_slug, animasu_slug')
    .in('mal_id', malIds);

  if (error !== null || data === null) {
    return new Map();
  }

  const resultMap = new Map<number, {
    slugSamehadaku: string | null;
    slugAnimasu: string | null;
  }>();

  for (const row of data) {
    resultMap.set(row.mal_id as number, {
      slugSamehadaku: row.samehadaku_slug as string | null,
      slugAnimasu: row.animasu_slug as string | null
    });
  }

  return resultMap;
}
