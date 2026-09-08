const BACKEND_URL = import.meta.env.VITE_TELEGRAM_BACKEND_URL as string | undefined;
const BACKEND_KEY = import.meta.env.VITE_TELEGRAM_BACKEND_KEY as string | undefined;

export const backendConfigured = Boolean(BACKEND_URL);

/**
 * Calls the userbot/storage backend. Every endpoint is a POST with a JSON
 * body and an API key header, so a single helper covers them all.
 */
export async function callBackend<T = Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!BACKEND_URL) {
    throw new Error('Backend URL is not configured (VITE_TELEGRAM_BACKEND_URL).');
  }
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': BACKEND_KEY || '',
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Request to backend failed.');
  }
  return data as T;
}

export interface ResolvedGroupInfo {
  title: string;
  username: string | null;
  is_forum: boolean;
  participants_count?: number;
  topics?: { topic_id: string; title: string }[];
}

/** Looks a Telegram chat up by ID so the UI can confirm it before using it. */
export async function resolveGroup(chatId: string): Promise<ResolvedGroupInfo> {
  const result = await callBackend<{
    title: string;
    username?: string | null;
    is_forum?: boolean;
    participants_count?: number;
    topics?: { topic_id: string; title: string }[];
  }>('/api/telegram/groups/resolve', { chat_id: chatId });
  return {
    title: result.title,
    username: result.username ?? null,
    is_forum: !!result.is_forum,
    participants_count: result.participants_count,
    topics: result.topics,
  };
}

/** Asks the backend to start working a forward job that was just created. */
export function startForwardJob(jobId: string) {
  return callBackend(`/api/telegram/forward/${jobId}/start`);
}

export interface R2TestResult {
  bucket?: string;
  object_count?: number;
  total_bytes?: number;
}

/** Verifies the stored R2 credentials really can reach the bucket. */
export function testR2Connection() {
  return callBackend<R2TestResult>('/api/r2/test');
}

export interface R2UploadResult {
  key: string;
  /** Null when no public URL is configured on the bucket -- the file is in R2, but not reachable. */
  url: string | null;
  size: number | null;
}

/**
 * Sends a video straight from the browser to the backend, which streams it on
 * into R2 and answers with the public URL. XHR rather than fetch(), because
 * only XHR reports upload progress, and a video is big enough to need a bar.
 */
export function uploadToR2(
  file: File,
  options: {
    folder?: string;
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<R2UploadResult> {
  return new Promise((resolve, reject) => {
    if (!BACKEND_URL) {
      reject(new Error('Backend URL is not configured (VITE_TELEGRAM_BACKEND_URL).'));
      return;
    }
    const query = new URLSearchParams({ name: file.name, folder: options.folder || 'uploads' });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BACKEND_URL}/api/r2/upload?${query}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-api-key', BACKEND_KEY || '');

    xhr.upload.onprogress = (e) => options.onProgress?.(e.loaded, e.total || file.size);
    xhr.onerror = () => reject(new Error('The upload could not reach the backend.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.onload = () => {
      let data: Partial<R2UploadResult> & { error?: string; success?: boolean } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status < 200 || xhr.status >= 300 || data.success === false) {
        reject(new Error(data.error || `Upload failed (HTTP ${xhr.status}).`));
        return;
      }
      resolve({ key: data.key || '', url: data.url ?? null, size: data.size ?? file.size });
    };

    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export interface R2Object {
  key: string;
  size: number;
  last_modified: string | null;
  url: string | null;
}

/** Lists what is really in the bucket under a prefix, newest first. */
export function listR2Objects(prefix = '', limit = 100) {
  return callBackend<{ bucket: string; objects: R2Object[]; total: number }>('/api/r2/objects', {
    prefix,
    limit,
  });
}

/** Removes one object from the bucket. */
export function deleteR2Object(key: string) {
  return callBackend('/api/r2/delete', { key });
}

/**
 * Asks the service to fetch every URL in a list and stream it into R2. It
 * answers as soon as the work is queued -- the page follows the rows, which
 * carry the key and the public URL once each one lands.
 */
export function saveUrlListToR2(listId: string) {
  return callBackend<{ queued: number }>(`/api/urls/lists/${listId}/save`);
}

/** The same, for the items that were ticked rather than a whole list. */
export function saveUrlItemsToR2(itemIds: string[]) {
  return callBackend<{ queued: number }>('/api/urls/items/save', { item_ids: itemIds });
}

export interface BackendHealth {
  telegram: boolean;
  r2: boolean;
  takeout: boolean;
}

/**
 * Liveness probe. Unlike every other call this is a GET and needs no API key,
 * so the UI can poll it to show whether the userbot service is up.
 */
export async function checkHealth(): Promise<BackendHealth> {
  if (!BACKEND_URL) throw new Error('Backend URL is not configured.');
  const res = await fetch(`${BACKEND_URL}/health`);
  if (!res.ok) throw new Error('The userbot service did not respond.');
  const data = await res.json();
  return {
    telegram: Boolean(data.telegram),
    r2: Boolean(data.r2),
    takeout: Boolean(data.takeout),
  };
}

/** Lists the groups the userbot is a member of, so a chat ID need not be typed. */
export function listDialogs() {
  return callBackend<{ dialogs: DialogInfo[] }>('/api/telegram/dialogs');
}

export interface DialogInfo {
  chat_id: string;
  title: string;
  username: string | null;
  is_forum: boolean;
  participants_count: number | null;
}

/** Joins a public group or an invite link, then returns the group it resolved to. */
export function joinChat(invite: string) {
  return callBackend<ResolvedGroupInfo & { chat_id: string }>('/api/telegram/join', { invite });
}

/** Sends a short message to the userbot's own Saved Messages. */
export function notifySelf(text: string) {
  return callBackend('/api/telegram/notify', { text });
}

/** Asks the service to create the destination topics and queue every job. */
export function prepareMirror(mirrorId: string) {
  return callBackend(`/api/telegram/mirror/${mirrorId}/prepare`);
}

/** Stops a mirror and every job it spawned. */
export function cancelMirror(mirrorId: string) {
  return callBackend(`/api/telegram/mirror/${mirrorId}/cancel`);
}

export interface TakeoutResult {
  success: boolean;
  already_active?: boolean;
  was_active?: boolean;
  takeout_id?: string;
}

/**
 * Starts Telegram's Takeout mode: an official bulk-export session that
 * relaxes flood limits, at the cost of needing a one-time confirmation from
 * another signed-in device (or a wait Telegram itself imposes) the first
 * time it's used. See Settings › Telegram for the full explanation shown to
 * the operator before they turn this on.
 */
export function startTakeout() {
  return callBackend<TakeoutResult>('/api/telegram/takeout/start');
}

/** Ends the active takeout session; downloads and forwards go back to normal. */
export function stopTakeout(success = true) {
  return callBackend<TakeoutResult>('/api/telegram/takeout/stop', { success });
}
