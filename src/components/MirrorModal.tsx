import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Hash,
  Layers,
  Loader2,
  Repeat,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import {
  backendConfigured,
  prepareMirror,
  resolveGroup,
  type ResolvedGroupInfo,
} from '@/lib/backend';
import type { CopyMode, Episode, Group, Topic } from '@/lib/types';
import { formatBytes } from '@/lib/utils';

const COPY_MODES: { key: CopyMode; label: string; hint: string }[] = [
  {
    key: 'auto',
    label: 'Automatic',
    hint: 'Forward when Telegram allows it, download and re-upload when it does not. Best default.',
  },
  {
    key: 'forward',
    label: 'Forward only',
    hint: 'Fastest — nothing passes through your connection. Fails on groups with content protection.',
  },
  {
    key: 'reupload',
    label: 'Re-upload every video',
    hint: 'Downloads each video and sends it as a new file. Works everywhere, but slow and uses your bandwidth.',
  },
];

/**
 * Copies a whole group into a new one: matching topics, every video, in
 * episode order.
 */
export function MirrorModal({
  group,
  topics,
  episodes,
  onClose,
  onDone,
}: {
  group: Group;
  topics: Topic[];
  episodes: Episode[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [chatId, setChatId] = useState('');
  const [createTopics, setCreateTopics] = useState(true);
  const [copyMode, setCopyMode] = useState<CopyMode>('auto');
  const [autoFollow, setAutoFollow] = useState(true);

  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'verified' | 'failed'>('idle');
  const [verifyError, setVerifyError] = useState('');
  const [resolved, setResolved] = useState<ResolvedGroupInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

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
        if (myRequestId !== requestIdRef.current) return;
        setResolved(info);
        setVerifyState('verified');
      } catch (err) {
        if (myRequestId !== requestIdRef.current) return;
        setVerifyError(err instanceof Error ? err.message : 'Could not reach this group.');
        setVerifyState('failed');
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [chatId]);

  // What the mirror will actually copy, counted the same way the worker will.
  const topicsWithVideos = topics.filter((t) => episodes.some((e) => e.topic_id === t.id));
  const untopicked = episodes.filter((e) => e.topic_id === null);
  const totalTopics = topicsWithVideos.length + (untopicked.length > 0 ? 1 : 0);
  const totalBytes = episodes.reduce((sum, e) => sum + (e.file_size || 0), 0);

  const canCreateTopics = createTopics && (resolved?.is_forum ?? false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatId.trim();
    if (!trimmed || submitting || episodes.length === 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const { data, error } = await supabase
        .from('group_mirrors')
        .insert({
          source_group_id: group.id,
          target_chat_id: trimmed,
          target_title: resolved?.title ?? null,
          create_topics: createTopics,
          copy_mode: copyMode,
          auto_follow: autoFollow,
          status: 'draft',
        })
        .select()
        .single();

      if (error || !data) throw new Error(error?.message || 'Could not create the mirror.');

      let message = `Mirror of "${group.title}" saved — ${episodes.length} videos across ${totalTopics} topics.`;
      if (backendConfigured) {
        try {
          await prepareMirror((data as { id: string }).id);
          message = `Mirroring "${group.title}" into ${resolved?.title || trimmed}. Topics are being created now.`;
        } catch {
          message += ' The userbot could not be reached, so it stays queued.';
        }
      } else {
        message += ' No backend is configured, so it stays queued.';
      }
      onDone(message);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not start the mirror.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-dark-700 bg-dark-900 p-6 shadow-2xl shadow-black/40 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-3">
          <div className="glow flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-accent-500">
            <Copy className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold leading-tight text-white">Mirror this group</h3>
            <p className="text-xs text-dark-500">
              Copy every topic and video into a new group — a branch of this one
            </p>
          </div>
        </div>

        {/* What will be copied */}
        <div className="mt-4 rounded-xl border border-dark-800 bg-dark-800/40 p-3">
          <p className="truncate text-sm font-medium text-white">{group.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-dark-400">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3 text-accent-400" /> {totalTopics} topics
            </span>
            <span>{episodes.length} videos</span>
            <span>{formatBytes(totalBytes)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-dark-400">
              New group ID *
            </label>
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

            {verifyState === 'failed' && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-error-400">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {verifyError}
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
                      {typeof resolved.participants_count === 'number' && (
                        <span className="flex items-center gap-1">
                          <Users className="h-2.5 w-2.5" /> {resolved.participants_count.toLocaleString()}
                        </span>
                      )}
                      {resolved.is_forum ? (
                        <span className="rounded bg-primary-500/10 px-1.5 py-0.5 font-medium text-primary-400">
                          FORUM
                        </span>
                      ) : (
                        <span className="text-warning-400">not a forum — topics cannot be created</span>
                      )}
                    </div>
                  </div>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success-400" />
                </div>
              </div>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3">
            <Toggle on={createTopics} onToggle={() => setCreateTopics(!createTopics)} />
            <span>
              <span className="flex items-center gap-1.5 text-sm text-dark-300">
                <Layers className="h-3.5 w-3.5 text-accent-400" /> Recreate the topics
              </span>
              <span className="mt-0.5 block text-[11px] text-dark-500">
                {canCreateTopics
                  ? `${totalTopics} topics will be created in the new group, and each video goes into its own.`
                  : resolved && !resolved.is_forum
                  ? 'The destination is not a forum, so everything lands in the main chat. Turn forum mode on there first if you want topics.'
                  : 'Each source topic gets a matching topic in the destination.'}
              </span>
            </span>
          </label>

          <div>
            <p className="mb-1.5 text-xs font-medium text-dark-400">How to copy</p>
            <div className="space-y-1.5">
              {COPY_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setCopyMode(mode.key)}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    copyMode === mode.key
                      ? 'border-primary-500/50 bg-primary-500/10'
                      : 'border-dark-700/60 bg-dark-800/40 hover:border-dark-600'
                  }`}
                >
                  <span
                    className={`text-xs font-medium ${
                      copyMode === mode.key ? 'text-primary-400' : 'text-dark-300'
                    }`}
                  >
                    {mode.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-relaxed text-dark-500">
                    {mode.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3">
            <Toggle on={autoFollow} onToggle={() => setAutoFollow(!autoFollow)} />
            <span>
              <span className="flex items-center gap-1.5 text-sm text-dark-300">
                <Repeat className="h-3.5 w-3.5 text-primary-400" /> Keep the branch in sync
              </span>
              <span className="mt-0.5 block text-[11px] text-dark-500">
                New videos found in the old group are copied across as they are scanned.
              </span>
            </span>
          </label>

          {submitError && (
            <p className="flex items-start gap-1.5 text-xs text-error-400">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {submitError}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-dark-800 px-4 py-2.5 text-sm font-medium text-dark-300 transition-colors hover:bg-dark-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!chatId.trim() || submitting || episodes.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Mirror {episodes.length} videos
            </button>
          </div>

          <p className="text-[10px] leading-relaxed text-dark-500">
            Telegram rate-limits bulk copying, so a large group takes hours. Progress appears per
            topic under Automation › Forward jobs, and the run can be closed and left to the service.
          </p>
        </form>
      </div>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${
        on ? 'bg-primary-500' : 'bg-dark-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
