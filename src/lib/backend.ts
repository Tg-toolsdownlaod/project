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
