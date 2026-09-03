import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Hash,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Users,
  MessagesSquare,
  Search,
  Link2,
  List,
} from 'lucide-react';

import {
  backendConfigured,
  joinChat,
  listDialogs,
  resolveGroup,
  type DialogInfo,
  type ResolvedGroupInfo,
} from '@/lib/backend';

export interface NewGroupInput {
  chat_id: string;
  title: string;
  username: string;
  is_forum: boolean;
}

type Source = 'mine' | 'id' | 'invite';

export function AddGroupModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (data: NewGroupInput) => void;
}) {
  const [source, setSource] = useState<Source>(backendConfigured ? 'mine' : 'id');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-dark-700 bg-dark-900 p-6 shadow-2xl shadow-black/40 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-bold text-white">Add Telegram Group</h3>
        <p className="mb-4 text-xs text-dark-500">
          Pick one of your groups, or paste a chat ID or invite link
        </p>

        <div className="mb-4 flex gap-1 rounded-xl border border-dark-800 bg-dark-800/40 p-1">
          <SourceTab active={source === 'mine'} onClick={() => setSource('mine')} icon={<List className="h-3.5 w-3.5" />} label="My groups" />
          <SourceTab active={source === 'id'} onClick={() => setSource('id')} icon={<Hash className="h-3.5 w-3.5" />} label="Chat ID" />
          <SourceTab active={source === 'invite'} onClick={() => setSource('invite')} icon={<Link2 className="h-3.5 w-3.5" />} label="Invite link" />
        </div>

        {source === 'mine' && <MyGroups onAdd={onAdd} onFallback={() => setSource('id')} />}
        {source === 'id' && <ByChatId onAdd={onAdd} onClose={onClose} />}
        {source === 'invite' && <ByInvite onAdd={onAdd} />}
      </div>
    </div>
  );
}

function SourceTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
        active ? 'bg-primary-500/15 text-primary-400' : 'text-dark-400 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** Lists the groups the userbot is already in — no chat ID to copy. */
function MyGroups({ onAdd, onFallback }: { onAdd: (data: NewGroupInput) => void; onFallback: () => void }) {
  const [dialogs, setDialogs] = useState<DialogInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      if (!backendConfigured) {
        setError('No userbot service is configured, so your groups cannot be listed.');
        setLoading(false);
        return;
      }
      try {
        const result = await listDialogs();
        setDialogs(result.dialogs ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your groups.');
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dialogs;
    return dialogs.filter(
      (d) => d.title.toLowerCase().includes(q) || (d.username ?? '').toLowerCase().includes(q)
    );
  }, [dialogs, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dark-800 bg-dark-800/40 p-4 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-warning-400" />
        <p className="text-xs text-dark-400">{error}</p>
        <button
          onClick={onFallback}
          className="mt-3 rounded-lg bg-dark-800 px-3 py-1.5 text-[11px] font-medium text-dark-300 transition-colors hover:bg-dark-700 hover:text-white"
        >
          Enter a chat ID instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-dark-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${dialogs.length} groups...`}
          autoFocus
          className="flex-1 bg-transparent text-sm text-white placeholder-dark-600 outline-none"
        />
      </div>

      <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-dark-600">No group matches that search</p>
        ) : (
          filtered.map((dialog) => (
            <button
              key={dialog.chat_id}
              onClick={() =>
                onAdd({
                  chat_id: dialog.chat_id,
                  title: dialog.title,
                  username: dialog.username ?? '',
                  is_forum: dialog.is_forum,
                })
              }
              className="flex w-full items-center gap-3 rounded-lg bg-dark-800/40 p-2.5 text-left transition-colors hover:bg-primary-500/10"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500/30 to-accent-500/30">
                <span className="text-sm font-bold text-white">
                  {dialog.title.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{dialog.title}</p>
                <div className="flex items-center gap-2 text-[10px] text-dark-500">
                  {dialog.username && <span className="text-accent-400">@{dialog.username}</span>}
                  {typeof dialog.participants_count === 'number' && (
                    <span className="flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" /> {dialog.participants_count.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              {dialog.is_forum && (
                <span className="shrink-0 rounded bg-accent-500/10 px-1.5 py-0.5 text-[9px] font-medium text-accent-400">
                  FORUM
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Joins a public @name or a t.me/+hash link, then adds what it joined. */
function ByInvite({ onAdd }: { onAdd: (data: NewGroupInput) => void }) {
  const [invite, setInvite] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    const value = invite.trim();
    if (!value || joining) return;
    setJoining(true);
    setError('');
    try {
      const result = await joinChat(value);
      onAdd({
        chat_id: result.chat_id,
        title: result.title,
        username: result.username ?? '',
        is_forum: result.is_forum,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join this group.');
      setJoining(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-dark-400">
          Invite link or @username
        </label>
        <input
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          placeholder="https://t.me/+AbCdEf... or @groupname"
          autoFocus
          className="w-full rounded-lg border border-dark-700 bg-dark-800 px-3 py-2.5 font-mono text-sm text-white placeholder-dark-600 outline-none transition-colors focus:border-primary-500"
        />
        <p className="mt-1.5 text-[10px] text-dark-500">
          Your account joins the group first, then it is added here.
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-error-400">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      <button
        onClick={handleJoin}
        disabled={!invite.trim() || joining}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        Join & add
      </button>
    </div>
  );
}

/** The original flow: paste a chat ID and let the service confirm it. */
function ByChatId({ onAdd, onClose }: { onAdd: (data: NewGroupInput) => void; onClose: () => void }) {
  const [chatId, setChatId] = useState('');
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [isForum, setIsForum] = useState(false);

  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'verified' | 'failed'>('idle');
  const [verifyError, setVerifyError] = useState('');
  const [resolved, setResolved] = useState<ResolvedGroupInfo | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Auto-verify as soon as a plausible chat ID is typed, so the user
  // immediately sees the real group name and knows the ID is correct.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResolved(null);
    setVerifyError('');

    const trimmed = chatId.trim();
    if (!trimmed || !backendConfigured) {
      setVerifyState('idle');
      return;
    }

    setVerifyState('idle');
    debounceRef.current = setTimeout(async () => {
      const myRequestId = ++requestIdRef.current;
      setVerifyState('checking');
      try {
        const info = await resolveGroup(trimmed);
        if (myRequestId !== requestIdRef.current) return; // superseded by a newer request
        setResolved(info);
        setTitle(info.title || '');
        setUsername(info.username || '');
        setIsForum(info.is_forum);
        setVerifyState('verified');
      } catch (err) {
        if (myRequestId !== requestIdRef.current) return;
        setVerifyError(err instanceof Error ? err.message : 'Could not connect to this group.');
        setVerifyState('failed');
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [chatId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId || !title) return;
    onAdd({ chat_id: chatId, title, username, is_forum: isForum });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-dark-400">Chat ID *</label>
        <div className="relative">
          <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500" />
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-100xxxxxxxxxx"
            autoFocus
            className={`w-full rounded-lg border bg-dark-800 py-2.5 pl-10 pr-9 font-mono text-sm text-white placeholder-dark-600 outline-none transition-colors ${
              verifyState === 'verified'
                ? 'border-success-500/60 focus:border-success-500'
                : verifyState === 'failed'
                ? 'border-error-500/60 focus:border-error-500'
                : 'border-dark-700 focus:border-primary-500'
            }`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {verifyState === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-dark-500" />}
            {verifyState === 'verified' && <ShieldCheck className="h-4 w-4 text-success-400" />}
            {verifyState === 'failed' && <ShieldAlert className="h-4 w-4 text-error-400" />}
          </div>
        </div>

        {verifyState === 'checking' && (
          <p className="mt-1.5 text-xs text-dark-500">Connecting to Telegram to look up this group…</p>
        )}
        {verifyState === 'failed' && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-error-400">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{' '}
            {verifyError || "Couldn't find this group. Double-check the Chat ID."}
          </p>
        )}
        {verifyState === 'verified' && resolved && (
          <div className="mt-2.5 rounded-xl border border-success-500/30 bg-gradient-to-br from-success-500/10 to-dark-900 p-3 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500/30 to-accent-500/30">
                <span className="text-sm font-bold text-white">
                  {(resolved.title || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{resolved.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-dark-400">
                  {resolved.username && <span className="text-accent-400">@{resolved.username}</span>}
                  {typeof resolved.participants_count === 'number' && (
                    <span className="flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" /> {resolved.participants_count.toLocaleString()}
                    </span>
                  )}
                  {resolved.is_forum && (
                    <span className="rounded bg-primary-500/10 px-1.5 py-0.5 font-medium text-primary-400">
                      FORUM
                    </span>
                  )}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-success-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected
              </span>
            </div>

            {resolved.topics && resolved.topics.length > 0 && (
              <div className="mt-3 border-t border-dark-800/80 pt-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-dark-500">
                  <MessagesSquare className="h-3 w-3" /> {resolved.topics.length} topic
                  {resolved.topics.length === 1 ? '' : 's'} found
                </p>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {resolved.topics.slice(0, 12).map((t) => (
                    <span
                      key={t.topic_id}
                      className="max-w-[160px] truncate rounded-md border border-dark-700/60 bg-dark-800/70 px-2 py-1 text-[10px] text-dark-300"
                    >
                      {t.title}
                    </span>
                  ))}
                  {resolved.topics.length > 12 && (
                    <span className="px-2 py-1 text-[10px] text-dark-500">
                      +{resolved.topics.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-dark-400">
          Group Title {verifyState === 'verified' ? <span className="text-success-500">(auto-filled)</span> : '*'}
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Anime Series"
          className="w-full rounded-lg border border-dark-700 bg-dark-800 px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none transition-colors focus:border-primary-500"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <button
          type="button"
          onClick={() => setIsForum(!isForum)}
          className={`relative h-6 w-10 rounded-full transition-colors ${isForum ? 'bg-primary-500' : 'bg-dark-700'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              isForum ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className="text-sm text-dark-300">This is a forum (has topics/threads)</span>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg bg-dark-800 px-4 py-2.5 text-sm font-medium text-dark-300 transition-colors hover:bg-dark-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!chatId || !title}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Add & Scan
        </button>
      </div>
    </form>
  );
}
