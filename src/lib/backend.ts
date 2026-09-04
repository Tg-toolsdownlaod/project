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
