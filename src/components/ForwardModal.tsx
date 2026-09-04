import { useEffect, useRef, useState } from 'react';
import {
  Send,
  Hash,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Users,
  Repeat,
  Film,
  Cloud,
  CloudOff,
  History,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { backendConfigured, resolveGroup, startForwardJob, type ResolvedGroupInfo } from '@/lib/backend';
import type { Episode, ForwardTarget, Group, Topic } from '@/lib/types';
import { formatBytes } from '@/lib/utils';

interface ForwardModalProps {
  group: Group;
  topic: Topic | null;
  episodes: Episode[];
  /** 'topic' forwards everything in the topic (and keeps following it), 'selected' forwards the given picks. */
  mode: 'selected' | 'topic';
  onClose: () => void;
  onDone: (message: string) => void;
}

export function ForwardModal({ group, topic, episodes, mode, onClose, onDone }: ForwardModalProps) {
  const [chatId, setChatId] = useState('');
  const [targetTopicId, setTargetTopicId] = useState('');
  const [autoFollow, setAutoFollow] = useState(mode === 'topic');
  const [targets, setTargets] = useState<ForwardTarget[]>([]);
  const [r2Connected, setR2Connected] = useState<boolean | null>(null);

  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'verified' | 'failed'>('idle');
  const [verifyError, setVerifyError] = useState('');
  const [resolved, setResolved] = useState<ResolvedGroupInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      const [tRes, r2Res] = await Promise.all([
        supabase.from('forward_targets').select('*').order('last_used_at', { ascending: false, nullsFirst: false }).limit(8),
        supabase.from('r2_settings').select('connected').maybeSingle(),
      ]);
      setTargets((tRes.data as ForwardTarget[]) || []);
      setR2Connected(r2Res.data ? Boolean((r2Res.data as { connected: boolean }).connected) : false);
    })();
  }, []);

  // Look the destination group up as soon as an ID is typed, so the operator
  // sees the real group name before anything is forwarded into it.
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
        setVerifyError(err instanceof Error ? err.message : 'Could not connect to this group.');
        setVerifyState('failed');
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [chatId]);

  const totalBytes = episodes.reduce((sum, e) => sum + (e.file_size || 0), 0);
  const inR2Count = episodes.filter((e) => e.r2_key).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatId.trim();
    if (!trimmed || episodes.length === 0 || submitting) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      // Remember the destination so it can be reused with one click next time.
      await supabase.from('forward_targets').upsert(
        {
          chat_id: trimmed,
          title: resolved?.title || trimmed,
          username: resolved?.username ?? null,
          is_forum: resolved?.is_forum ?? false,
          verified: verifyState === 'verified',
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'chat_id' }
      );

      const { data: job, error: jobError } = await supabase
        .from('forward_jobs')
        .insert({
          source_group_id: group.id,
          source_topic_id: topic?.id ?? null,
          target_chat_id: trimmed,
          target_title: resolved?.title ?? null,
          target_topic_id: targetTopicId.trim() || null,
          mode,
          status: 'queued',
          total_count: episodes.length,
          auto_follow: autoFollow,
        })
        .select()
        .single();

      if (jobError || !job) throw new Error(jobError?.message || 'Could not create the forward job.');

      const jobId = (job as { id: string }).id;
      const { error: itemsError } = await supabase.from('forward_job_items').insert(
        episodes.map((ep) => ({ job_id: jobId, episode_id: ep.id, status: 'pending' }))
      );
      if (itemsError) throw new Error(itemsError.message);

      let message = `Queued ${episodes.length} video${episodes.length === 1 ? '' : 's'} to forward into ${resolved?.title || trimmed}.`;
      if (backendConfigured) {
        try {
          await startForwardJob(jobId);
          message = `Forwarding ${episodes.length} video${episodes.length === 1 ? '' : 's'} into ${resolved?.title || trimmed}.`;
        } catch {
          // The job row is saved either way — the worker will pick it up.
          message += ' The userbot could not be reached, so it stays queued.';
        }
      } else {
        message += ' No backend is configured, so it stays queued.';
      }
      onDone(message);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not queue the forward job.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-dark-700 bg-dark-900 p-6 animate-slide-up shadow-2xl shadow-black/40 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-500 to-primary-500 flex items-center justify-center shrink-0 glow-accent">
            <Send className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">Forward to another group</h3>
            <p className="text-xs text-dark-500">Just paste the destination group ID — nothing is re-downloaded</p>
          </div>
        </div>

        {/* What is being forwarded */}
        <div className="mt-4 rounded-xl border border-dark-800 bg-dark-800/40 p-3">
          <div className="flex items-center gap-2 text-xs text-dark-300">
            <Film className="w-3.5 h-3.5 text-primary-400 shrink-0" />
            <span className="font-semibold text-white">{episodes.length}</span> video{episodes.length === 1 ? '' : 's'}
            <span className="text-dark-600">·</span>
            <span>{formatBytes(totalBytes)}</span>
          </div>
          <p className="text-[11px] text-dark-500 mt-1.5 truncate">
            From <span className="text-dark-300">{group.title}</span>
            {topic && <> › <span className="text-accent-400">{topic.title}</span></>}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px]">
            {r2Connected ? (
              <span className="flex items-center gap-1 text-success-400 bg-success-500/10 px-2 py-0.5 rounded-full">
                <Cloud className="w-3 h-3" /> R2 connected · {inR2Count}/{episodes.length} already stored
              </span>
            ) : (
              <span className="flex items-center gap-1 text-dark-400 bg-dark-800 px-2 py-0.5 rounded-full">
                <CloudOff className="w-3 h-3" /> R2 not connected — forwarding still works
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Destination Group ID *</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-100xxxxxxxxxx"
                autoFocus
                className={`w-full bg-dark-800 border rounded-lg pl-10 pr-9 py-2.5 text-sm text-white placeholder-dark-600 outline-none transition-colors font-mono ${
                  verifyState === 'verified'
                    ? 'border-success-500/60 focus:border-success-500'
                    : verifyState === 'failed'
                    ? 'border-error-500/60 focus:border-error-500'
                    : 'border-dark-700 focus:border-primary-500'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {verifyState === 'checking' && <Loader2 className="w-4 h-4 text-dark-500 animate-spin" />}
                {verifyState === 'verified' && <ShieldCheck className="w-4 h-4 text-success-400" />}
                {verifyState === 'failed' && <ShieldAlert className="w-4 h-4 text-error-400" />}
              </div>
            </div>

            {verifyState === 'checking' && <p className="text-xs text-dark-500 mt-1.5">Looking this group up on Telegram…</p>}
            {verifyState === 'failed' && (
              <p className="text-xs text-error-400 mt-1.5 flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {verifyError || "Couldn't reach this group. Check the ID and that the userbot is a member."}
              </p>
            )}
            {verifyState === 'verified' && resolved && (
              <div className="mt-2.5 rounded-xl border border-success-500/30 bg-gradient-to-br from-success-500/10 to-dark-900 p-3 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500/30 to-accent-500/30 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-white">{(resolved.title || '?').charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{resolved.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-dark-400 flex-wrap mt-0.5">
                      {resolved.username && <span className="text-accent-400">@{resolved.username}</span>}
                      {typeof resolved.participants_count === 'number' && (
                        <span className="flex items-center gap-1"><Users className="w-2.5 h-2.5" /> {resolved.participants_count.toLocaleString()}</span>
                      )}
                      {resolved.is_forum && <span className="text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded font-medium">FORUM</span>}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-success-400 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Recently used destinations */}
          {targets.length > 0 && (
            <div>
              <p className="text-[10px] text-dark-500 font-medium mb-1.5 flex items-center gap-1.5">
                <History className="w-3 h-3" /> Recent destinations
              </p>
              <div className="flex flex-wrap gap-1.5">
                {targets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setChatId(t.chat_id)}
                    className="text-[11px] text-dark-300 hover:text-white bg-dark-800/70 hover:bg-dark-700 border border-dark-700/60 px-2 py-1 rounded-md truncate max-w-[180px] transition-colors"
                  >
                    {t.title || t.chat_id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Optional destination topic for forum groups */}
          {(resolved?.is_forum || targetTopicId) && (
            <div>
              <label className="text-xs text-dark-400 font-medium block mb-1.5">Destination Topic ID (optional)</label>
              <input
                value={targetTopicId}
                onChange={(e) => setTargetTopicId(e.target.value)}
                placeholder="Leave empty to post in the General topic"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors font-mono"
              />
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setAutoFollow(!autoFollow)}
              className={`w-10 h-6 rounded-full transition-colors relative shrink-0 mt-0.5 ${autoFollow ? 'bg-primary-500' : 'bg-dark-700'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoFollow ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span>
              <span className="text-sm text-dark-300 flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5 text-primary-400" /> Keep forwarding automatically</span>
              <span className="text-[11px] text-dark-500 block mt-0.5">
                New videos found in {topic ? 'this topic' : 'this group'} are forwarded to the destination as soon as they are scanned.
              </span>
            </span>
          </label>

          {submitError && (
            <p className="text-xs text-error-400 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {submitError}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!chatId.trim() || episodes.length === 0 || submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Forward {episodes.length} video{episodes.length === 1 ? '' : 's'}
            </button>
          </div>
          {verifyState !== 'verified' && chatId.trim() && (
            <p className="text-[10px] text-dark-500 text-center -mt-2">
              This ID has not been confirmed yet — the job will fail if the userbot cannot post there.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
