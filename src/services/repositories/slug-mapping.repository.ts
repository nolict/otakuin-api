import { supabase } from '../clients/supabase.client.js';

import type { SlugMapping, SlugMappingInsert } from '../../types/database.js';

export async function findSlugMappingByMalId(malId: number): Promise<SlugMapping | null> {
  const result = await supabase
    .from('slug_mappings')
    .select('*')
    .eq('mal_id', malId)
    .single();

  if (result.error !== null) {
    if (result.error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch slug mapping: ${result.error.message}`);
  }

  return result.data as SlugMapping;
}

export async function upsertSlugMapping(mapping: SlugMappingInsert): Promise<SlugMapping> {
  const result = await supabase
    .from('slug_mappings')
    .upsert(
      {
        mal_id: mapping.mal_id,
        samehadaku_slug: mapping.samehadaku_slug,
        animasu_slug: mapping.animasu_slug,
        confidence_samehadaku: mapping.confidence_samehadaku,
        confidence_animasu: mapping.confidence_animasu,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'mal_id'
      }
    )
    .select()
    .single();

  if (result.error !== null) {
    throw new Error(`Failed to upsert slug mapping: ${result.error.message}`);
  }

  return result.data as SlugMapping;
}

export async function getSlugMapping(malId: number): Promise<SlugMapping | null> {
  return findSlugMappingByMalId(malId);
}

export async function deleteSlugMapping(malId: number): Promise<void> {
  const { error } = await supabase
    .from('slug_mappings')
    .delete()
    .eq('mal_id', malId);

  if (error !== null) {
    throw new Error(`Failed to delete slug mapping: ${error.message}`);
  }
}
