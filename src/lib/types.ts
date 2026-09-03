export interface TelegramSettings {
  id: string;
  api_id: string | null;
  api_hash: string | null;
  phone: string | null;
  session_string: string | null;
  connected: boolean;
  last_connected_at: string | null;
  account_first_name: string | null;
  account_last_name: string | null;
  account_username: string | null;
  account_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface R2Settings {
  id: string;
  account_id: string | null;
  access_key_id: string | null;
  secret_access_key: string | null;
  bucket_name: string | null;
  endpoint_url: string | null;
  public_url: string | null;
  region: string;
  connected: boolean;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  chat_id: string;
  title: string;
  username: string | null;
  is_forum: boolean;
  active: boolean;
  total_episodes: number;
  downloaded_episodes: number;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  group_id: string;
  topic_id: string | null;
  title: string;
  active: boolean;
  total_episodes: number;
  downloaded_episodes: number;
  created_at: string;
  updated_at: string;
}

export interface Episode {
  id: string;
  group_id: string;
  topic_id: string | null;
  message_id: string | null;
  ep_number: number | null;
  title: string | null;
  file_name: string | null;
  file_size: number;
  duration: number;
  thumbnail_url: string | null;
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'failed' | 'skipped';
  r2_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface Download {
  id: string;
  episode_id: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'paused' | 'cancelled';
  progress: number;
  speed_mbps: number;
  downloaded_bytes: number;
  total_bytes: number;
  r2_key: string | null;
  r2_url: string | null;
  error: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UrlList {
  id: string;
  title: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface UrlListItem {
  id: string;
  url_list_id: string;
  url: string;
  label: string | null;
  episode_number: number | null;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  created_at: string;
}

export interface AutoDownloadRule {
  id: string;
  group_id: string;
  topic_id: string | null;
  auto_ep_start: number | null;
  auto_ep_end: number | null;
  quality_filter: string | null;
  min_file_size_mb: number;
  forward_to_chat_id: string | null;
  forward_to_topic_id: string | null;
  forward_enabled: boolean;
  active: boolean;
  last_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DownloadSettings {
  id: string;
  concurrent_downloads: number;
  speed_limit_mbps: number;
  auto_start: boolean;
  quality_pref: string;
  notify_on_complete: boolean;
  retry_on_fail: boolean;
  max_retries: number;
  r2_folder_pattern: string;
  auto_r2_upload: boolean;
  created_at: string;
  updated_at: string;
}

export interface ForwardTarget {
  id: string;
  chat_id: string;
  title: string;
  username: string | null;
  is_forum: boolean;
  verified: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForwardJob {
  id: string;
  source_group_id: string | null;
  source_topic_id: string | null;
  target_chat_id: string;
  target_title: string | null;
  target_topic_id: string | null;
  mode: 'selected' | 'topic';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_count: number;
  forwarded_count: number;
  failed_count: number;
  auto_follow: boolean;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForwardJobItem {
  id: string;
  job_id: string;
  episode_id: string | null;
  status: 'pending' | 'forwarded' | 'failed' | 'skipped';
  forwarded_message_id: string | null;
  error: string | null;
  forwarded_at: string | null;
  created_at: string;
}

export type PageKey =
  | 'dashboard'
  | 'groups'
  | 'downloads'
  | 'autodownload'
  | 'forwards'
  | 'urllists'
  | 'r2'
  | 'telegram'
  | 'settings';
