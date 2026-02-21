export interface VideoQueueItem {
  id?: number;
  mal_id: number;
  episode: number;
  anime_title: string;
  code: string;
  provider: string;
  url_video: string;
  resolution: string;
  server: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority?: number;
  error_message?: string | null;
  retry_count?: number;
  max_retries?: number;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface VideoStorageItem {
  id?: number;
  mal_id: number;
  episode: number;
  anime_title: string;
  code: string;
  resolution: string;
  server: number;
  file_name: string;
  file_size_bytes?: number | null;
  release_tag: string;
  github_urls: GitHubStorageUrl[];
  github_asset_ids?: GitHubAssetId[];
  created_at?: string;
  updated_at?: string;
}

export interface GitHubStorageUrl {
  account: string;
  username: string;
  repo_name: string;
  url: string;
}

export interface GitHubAssetId {
  account: string;
  asset_id: number;
  repo: string;
}

export interface GitHubStorageAccount {
  id?: number;
  account_name: string;
  github_username: string;
  github_token: string;
  is_active: boolean;
  total_repos?: number;
  total_episodes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GitHubStorageRepo {
  id?: number;
  repo_name: string;
  github_account_id: number;
  repo_url: string;
  episode_count: number;
  is_full: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}
