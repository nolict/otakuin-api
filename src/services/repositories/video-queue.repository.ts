import { logger } from '../../utils/logger';
import { getSupabaseClient } from '../clients/supabase.client';

import type { QueueStats, VideoQueueItem } from '../../types/video-storage';

export async function addToQueue(
  item: Omit<VideoQueueItem, 'id' | 'created_at' | 'updated_at'>
): Promise<VideoQueueItem | null> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('video_queue')
      .insert({
        mal_id: item.mal_id,
        episode: item.episode,
        anime_title: item.anime_title,
        code: item.code,
        provider: item.provider,
        url_video: item.url_video,
        resolution: item.resolution,
        server: item.server,
        status: item.status ?? 'pending',
        priority: item.priority ?? 0,
        retry_count: 0,
        max_retries: 3
      })
      .select()
      .single();

    if (error !== null) {
      if (error.code === '23505') {
        logger.debug(`Queue item already exists: MAL ${item.mal_id} EP ${item.episode} ${item.resolution} Server ${item.server}`);
        return null;
      }
      logger.error(`Failed to add to queue: ${error.message}`);
      return null;
    }

    const queueItem = data as VideoQueueItem;
    logger.info(
      `Added to queue: MAL ${item.mal_id} EP ${item.episode} ${item.resolution} Server ${item.server}`
    );
    return queueItem;
  } catch (err) {
    logger.error(`Error adding to queue: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function checkVideoInQueue(malId: number, episode: number, resolution: string, server: number): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('video_queue')
      .select('id')
      .eq('mal_id', malId)
      .eq('episode', episode)
      .eq('resolution', resolution)
      .eq('server', server)
      .single();

    if (error !== null) {
      if (error.code === 'PGRST116') {
        return false;
      }
      logger.error(`Error checking queue: ${error.message}`);
      return false;
    }

    return data !== null;
  } catch (err) {
    logger.error(`Error checking queue: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function getPendingQueueItems(limit: number = 10): Promise<VideoQueueItem[]> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('video_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error !== null) {
      logger.error(`Failed to get pending queue items: ${error.message}`);
      return [];
    }

    return (data ?? []) as VideoQueueItem[];
  } catch (err) {
    logger.error(`Error getting pending queue items: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export async function updateQueueStatus(
  id: number,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  errorMessage?: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'processing') {
      updateData.started_at = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage !== undefined) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('video_queue')
      .update(updateData)
      .eq('id', id);

    if (error !== null) {
      logger.error(`Failed to update queue status: ${error.message}`);
      return false;
    }

    logger.debug(`Updated queue item ${id} to status: ${status}`);
    return true;
  } catch (err) {
    logger.error(`Error updating queue status: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function incrementRetryCount(id: number): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .rpc('increment_retry_count', { queue_id: id });

    if (error !== null) {
      const { data: current } = await supabase
        .from('video_queue')
        .select('retry_count')
        .eq('id', id)
        .single();

      if (current !== null) {
        const newCount = ((current as { retry_count: number }).retry_count ?? 0) + 1;
        const { error: updateError } = await supabase
          .from('video_queue')
          .update({ retry_count: newCount })
          .eq('id', id);

        if (updateError !== null) {
          logger.error(`Failed to increment retry count: ${updateError.message}`);
          return false;
        }
      }
    }

    return true;
  } catch (err) {
    logger.error(`Error incrementing retry count: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function getQueueStats(): Promise<QueueStats> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('video_queue')
      .select('status');

    if (error !== null) {
      logger.error(`Failed to get queue stats: ${error.message}`);
      return { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    }

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: data?.length ?? 0
    };

    if (data !== null) {
      for (const item of data) {
        const status = (item as { status: string }).status;
        if (status === 'pending') {
          stats.pending++;
        }
        if (status === 'processing') {
          stats.processing++;
        }
        if (status === 'completed') {
          stats.completed++;
        }
        if (status === 'failed') {
          stats.failed++;
        }
      }
    }

    return stats;
  } catch (err) {
    logger.error(`Error getting queue stats: ${err instanceof Error ? err.message : String(err)}`);
    return { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
  }
}
