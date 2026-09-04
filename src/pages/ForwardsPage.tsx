import { useCallback, useEffect, useState } from 'react';
import {
  Send,
  Loader2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Repeat,
  ChevronRight,
  AlertTriangle,
  Play,
  Hash,
  X,
  Copy,
  Layers,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { backendConfigured, cancelMirror, prepareMirror, startForwardJob } from '@/lib/backend';
import type { ForwardJob, ForwardTarget, Group, GroupMirror, Topic } from '@/lib/types';
import { formatTimeAgo } from '@/lib/utils';

type JobWithSource = ForwardJob & { group?: Group | null; topic?: Topic | null };

const STATUS_STYLES: Record<ForwardJob['status'], string> = {
  queued: 'text-accent-400 bg-accent-500/10',
  running: 'text-primary-400 bg-primary-500/10',
  completed: 'text-success-400 bg-success-500/10',
  failed: 'text-error-400 bg-error-500/10',
  cancelled: 'text-dark-400 bg-dark-700',
};

export function ForwardsPage() {
  const [jobs, setJobs] = useState<JobWithSource[]>([]);
  const [targets, setTargets] = useState<ForwardTarget[]>([]);
  const [mirrors, setMirrors] = useState<(GroupMirror & { group?: Group | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [jRes, tRes, mRes] = await Promise.all([
      supabase
        .from('forward_jobs')
        .select('*, group:groups(*), topic:topics(*)')
        .order('created_at', { ascending: false }),
      supabase.from('forward_targets').select('*').order('last_used_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('group_mirrors')
        .select('*, group:groups(*)')
        .order('created_at', { ascending: false }),
    ]);
    if (jRes.error) setError(jRes.error.message);
    setJobs((jRes.data as JobWithSource[]) || []);
    setTargets((tRes.data as ForwardTarget[]) || []);
    setMirrors((mRes.data as (GroupMirror & { group?: Group | null })[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = async (job: ForwardJob) => {
    setBusyId(job.id);
    setError('');
    await supabase.from('forward_jobs').update({ status: 'queued', error: null }).eq('id', job.id);
    await supabase.from('forward_job_items').update({ status: 'pending', error: null }).eq('job_id', job.id).neq('status', 'forwarded');
    if (backendConfigured) {
      try {
        await startForwardJob(job.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The userbot could not be reached — the job stays queued.');
      }
    }
    setBusyId(null);
    load();
  };

  const resumeMirror = async (mirror: GroupMirror) => {
    setBusyId(mirror.id);
    setError('');
    if (backendConfigured) {
      try {
        await prepareMirror(mirror.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The userbot could not be reached.');
      }
    }
    setBusyId(null);
    load();
  };

  const stopMirror = async (mirror: GroupMirror) => {
    if (!window.confirm('Stop this mirror? Videos already copied stay in the new group.')) return;
    if (backendConfigured) {
      await cancelMirror(mirror.id).catch(() => {});
    }
    await supabase.from('group_mirrors').update({ status: 'cancelled', auto_follow: false }).eq('id', mirror.id);
    load();
  };

  const toggleAutoFollow = async (job: ForwardJob) => {
    await supabase.from('forward_jobs').update({ auto_follow: !job.auto_follow }).eq('id', job.id);
    load();
  };

  const removeJob = async (job: ForwardJob) => {
    if (!window.confirm('Delete this forward job? Videos already forwarded stay in the destination group.')) return;
    await supabase.from('forward_jobs').delete().eq('id', job.id);
    load();
  };

  const removeTarget = async (target: ForwardTarget) => {
    await supabase.from('forward_targets').delete().eq('id', target.id);
    load();
  };

  const activeCount = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-error-400/70 hover:text-error-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-dark-800 bg-gradient-to-br from-dark-900 via-dark-900 to-accent-900/20 p-6">
        <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-primary-500 glow-accent">
            <Send className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white">Forward Jobs</h2>
            <p className="text-xs text-dark-500">Copy videos from a topic into another Telegram group by ID</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-dark-500"><span className="font-semibold text-white">{activeCount}</span> active</span>
            <span className="text-dark-500"><span className="font-semibold text-white">{jobs.length}</span> total</span>
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg bg-dark-800 px-3 py-1.5 font-medium text-dark-300 transition-colors hover:bg-dark-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
        {!backendConfigured && (
          <p className="relative mt-3 text-[11px] text-warning-400">
            No userbot backend is configured, so jobs stay queued until one picks them up.
          </p>
        )}
      </div>

      {/* Mirrors — a mirror owns many jobs, so it gets its own rolled-up card */}
      {mirrors.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Copy className="h-4 w-4 text-primary-400" /> Group mirrors
            <span className="text-xs font-normal text-dark-500">{mirrors.length}</span>
          </h3>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {mirrors.map((mirror) => {
              const own = jobs.filter((j) => j.mirror_id === mirror.id);
              const forwarded = own.reduce((sum, j) => sum + (j.forwarded_count || 0), 0);
              const failed = own.reduce((sum, j) => sum + (j.failed_count || 0), 0);
              const total = own.reduce((sum, j) => sum + (j.total_count || 0), 0) || mirror.total_videos;
              const pct = total > 0 ? Math.min((forwarded / total) * 100, 100) : 0;
              const active = mirror.status === 'running' || mirror.status === 'preparing';

              return (
                <div key={mirror.id} className="rounded-2xl border border-primary-500/20 bg-dark-900/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/15">
                      <Copy className="h-4 w-4 text-primary-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">
                          {mirror.group?.title || 'Unknown group'}
                        </p>
                        <ChevronRight className="h-3 w-3 text-dark-600" />
                        <p className="truncate text-sm text-accent-400">
                          {mirror.target_title || mirror.target_chat_id}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                        <span className={`rounded-full px-1.5 py-0.5 font-medium ${
                          active
                            ? 'bg-primary-500/10 text-primary-400'
                            : mirror.status === 'completed'
                            ? 'bg-success-500/10 text-success-400'
                            : mirror.status === 'failed'
                            ? 'bg-error-500/10 text-error-400'
                            : 'bg-dark-700 text-dark-400'
                        }`}>
                          {mirror.status}
                        </span>
                        <span className="flex items-center gap-1 text-dark-500">
                          <Layers className="h-2.5 w-2.5" /> {own.length || mirror.total_topics} topics
                        </span>
                        {mirror.copy_mode !== 'forward' && (
                          <span className="rounded-full bg-warning-500/10 px-1.5 py-0.5 font-medium text-warning-400">
                            {mirror.copy_mode === 'reupload' ? 're-upload' : 'auto copy'}
                          </span>
                        )}
                        {mirror.auto_follow && (
                          <span className="flex items-center gap-1 rounded-full bg-primary-500/10 px-1.5 py-0.5 font-medium text-primary-400">
                            <Repeat className="h-2.5 w-2.5" /> in sync
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-dark-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-dark-500">
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-success-400">
                        <CheckCircle2 className="h-3 w-3" /> {forwarded}
                      </span>
                      {failed > 0 && (
                        <span className="flex items-center gap-1 text-error-400">
                          <XCircle className="h-3 w-3" /> {failed}
                        </span>
                      )}
                      <span>of {total}</span>
                    </span>
                    <span>{formatTimeAgo(mirror.prepared_at || mirror.created_at)}</span>
                  </div>

                  {mirror.error && (
                    <p className="mt-2 rounded-lg bg-error-500/10 px-2.5 py-1.5 text-[11px] text-error-300">
                      {mirror.error}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2 border-t border-dark-800 pt-3">
                    <button
                      onClick={() => resumeMirror(mirror)}
                      disabled={busyId === mirror.id}
                      className="flex items-center gap-1.5 rounded-lg bg-dark-800 px-3 py-1.5 text-[11px] font-medium text-dark-300 transition-colors hover:bg-primary-500 hover:text-white disabled:opacity-50"
                    >
                      {busyId === mirror.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Sync now
                    </button>
                    {mirror.status !== 'cancelled' && (
                      <button
                        onClick={() => stopMirror(mirror)}
                        className="flex items-center gap-1.5 rounded-lg bg-dark-800 px-3 py-1.5 text-[11px] font-medium text-dark-300 transition-colors hover:bg-error-500 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" /> Stop
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Jobs */}
      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40 p-12 text-center">
          <Send className="mx-auto mb-4 h-12 w-12 text-dark-700" />
          <p className="text-sm text-dark-400">No forward jobs yet</p>
          <p className="mt-1 text-xs text-dark-600">
            Open a group, pick a topic, select videos and choose “Forward to group”.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {jobs.map((job) => {
            const total = job.total_count || 0;
            const pct = total > 0 ? Math.min((job.forwarded_count / total) * 100, 100) : 0;
            return (
              <div key={job.id} className="rounded-2xl border border-dark-800 bg-dark-900/60 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15">
                    <Send className="h-4 w-4 text-accent-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">
                        {job.target_title || job.target_chat_id}
                      </p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[job.status]}`}>
                        {job.status}
                      </span>
                      {job.auto_follow && (
                        <span className="flex items-center gap-1 rounded-full bg-primary-500/10 px-1.5 py-0.5 text-[10px] font-medium text-primary-400">
                          <Repeat className="h-2.5 w-2.5" /> auto
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-dark-500">
                      <span className="truncate">{job.group?.title || 'Unknown group'}</span>
                      {job.topic && (<><ChevronRight className="h-3 w-3" /><span className="truncate text-accent-400">{job.topic.title}</span></>)}
                      <ChevronRight className="h-3 w-3" />
                      <span className="inline-flex items-center gap-1 font-mono text-dark-400"><Hash className="h-2.5 w-2.5" />{job.target_chat_id}</span>
                      {job.target_topic_id && <span className="font-mono text-dark-500">/ topic {job.target_topic_id}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => removeJob(job)}
                    title="Delete job"
                    className="rounded p-1 text-dark-600 transition-colors hover:bg-error-500/20 hover:text-error-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-dark-800">
                  <div
                    className={`h-full rounded-full transition-all ${job.status === 'failed' ? 'bg-error-500' : 'bg-gradient-to-r from-accent-500 to-primary-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-dark-500">
                  <span className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-success-400"><CheckCircle2 className="h-3 w-3" /> {job.forwarded_count}</span>
                    {job.failed_count > 0 && (
                      <span className="flex items-center gap-1 text-error-400"><XCircle className="h-3 w-3" /> {job.failed_count}</span>
                    )}
                    <span>of {total}</span>
                  </span>
                  <span>{formatTimeAgo(job.completed_at || job.started_at || job.created_at)}</span>
                </div>

                {job.error && (
                  <p className="mt-2 rounded-lg bg-error-500/10 px-2.5 py-1.5 text-[11px] text-error-300">{job.error}</p>
                )}

                <div className="mt-3 flex items-center gap-2 border-t border-dark-800 pt-3">
                  <button
                    onClick={() => retry(job)}
                    disabled={busyId === job.id}
                    className="flex items-center gap-1.5 rounded-lg bg-dark-800 px-3 py-1.5 text-[11px] font-medium text-dark-300 transition-colors hover:bg-primary-500 hover:text-white disabled:opacity-50"
                  >
                    {busyId === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {job.status === 'completed' ? 'Run again' : 'Retry'}
                  </button>
                  <button
                    onClick={() => toggleAutoFollow(job)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      job.auto_follow ? 'bg-primary-500/15 text-primary-400 hover:bg-primary-500/25' : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                    }`}
                  >
                    <Repeat className="h-3.5 w-3.5" /> Auto-forward {job.auto_follow ? 'on' : 'off'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Saved destinations */}
      {targets.length > 0 && (
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Hash className="h-4 w-4 text-accent-400" /> Saved destination groups
          </h3>
          <div className="space-y-1.5">
            {targets.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg bg-dark-800/30 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500/30 to-accent-500/30">
                  <span className="text-xs font-bold text-white">{(t.title || t.chat_id).charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{t.title || t.chat_id}</p>
                  <p className="truncate font-mono text-[10px] text-dark-500">{t.chat_id}{t.username ? ` · @${t.username}` : ''}</p>
                </div>
                {t.verified && <CheckCircle2 className="h-4 w-4 shrink-0 text-success-400" />}
                <span className="shrink-0 text-[10px] text-dark-500">{formatTimeAgo(t.last_used_at)}</span>
                <button
                  onClick={() => removeTarget(t)}
                  title="Forget this destination"
                  className="shrink-0 rounded p-1 text-dark-600 transition-colors hover:bg-error-500/20 hover:text-error-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
