import { logger } from '../../utils/logger';
import { getSupabaseClient } from '../clients/supabase.client';

import type { GitHubStorageUrl, VideoStorageItem } from '../../types/video-storage';

export async function saveVideoStorage(item: Omit<VideoStorageItem, 'id' | 'created_at' | 'updated_at'>): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('video_storage')
      .insert({
        mal_id: item.mal_id,
        episode: item.episode,
        anime_title: item.anime_title,
        code: item.code,
        resolution: item.resolution,
        server: item.server,
        file_name: item.file_name,
        file_size_bytes: item.file_size_bytes,
        release_tag: item.release_tag,
        github_urls: JSON.stringify(item.github_urls)
      });

    if (error !== null) {
      logger.error(`Failed to save video storage: ${error.message}`);
      return false;
    }

    logger.info(`Saved video storage: ${item.file_name} (MAL ${item.mal_id} EP ${item.episode})`);
    return true;
  } catch (err) {
    logger.error(`Error saving video storage: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function getStoredVideo(
  malId: number,
  episode: number,
  resolution: string,
  server: number
): Promise<VideoStorageItem | null> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('video_storage')
      .select('*')
      .eq('mal_id', malId)
      .eq('episode', episode)
      .eq('resolution', resolution)
      .eq('server', server)
      .single();

    if (error !== null) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error(`Failed to get stored video: ${error.message}`);
      return null;
    }

    return data as VideoStorageItem;
  } catch (err) {
    logger.error(`Error getting stored video: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function getStoredVideosByEpisode(malId: number, episode: number): Promise<VideoStorageItem[]> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('video_storage')
      .select('*')
      .eq('mal_id', malId)
      .eq('episode', episode)
      .order('server', { ascending: true });

    if (error !== null) {
      logger.error(`Failed to get stored videos: ${error.message}`);
      return [];
    }

    return (data ?? []) as VideoStorageItem[];
  } catch (err) {
    logger.error(`Error getting stored videos: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export async function checkVideoExists(
  malId: number,
  episode: number,
  resolution: string,
  server: number
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('video_storage')
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
      logger.error(`Error checking video exists: ${error.message}`);
      return false;
    }

    return data !== null;
  } catch (err) {
    logger.error(`Error checking video exists: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function getGitHubDownloadUrls(
  malId: number,
  episode: number,
  resolution: string,
  server: number
): Promise<GitHubStorageUrl[]> {
  const video = await getStoredVideo(malId, episode, resolution, server);

  if (video === null) {
    return [];
  }

  return video.github_urls;
}
