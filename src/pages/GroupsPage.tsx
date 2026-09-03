import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Users,
  Film,
  RefreshCw,
  Trash2,
  Download,
  Search,
  CheckCircle2,
  Loader2,
  Layers,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  Send,
  MessagesSquare,
  Cloud,
  AlertTriangle,
  X,
  HardDrive,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { backendConfigured, callBackend } from '@/lib/backend';
import type { Episode, Group, Topic } from '@/lib/types';
import { formatBytes, formatTimeAgo, getStatusColor } from '@/lib/utils';
import { AddGroupModal, type NewGroupInput } from '@/components/AddGroupModal';
import { ForwardModal } from '@/components/ForwardModal';

/** The synthetic topic id used for videos that sit outside any forum topic. */
const NO_TOPIC = '__none__';

interface ForwardRequest {
  group: Group;
  topic: Topic | null;
  episodes: Episode[];
  mode: 'selected' | 'topic';
}

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [r2Connected, setR2Connected] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [forwardRequest, setForwardRequest] = useState<ForwardRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [epFrom, setEpFrom] = useState('');
  const [epTo, setEpTo] = useState('');
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const [gRes, tRes, eRes, r2Res] = await Promise.all([
      supabase.from('groups').select('*').order('created_at', { ascending: false }),
      supabase.from('topics').select('*').order('title', { ascending: true }),
      supabase.from('episodes').select('*').order('ep_number', { ascending: true }),
      supabase.from('r2_settings').select('connected').maybeSingle(),
    ]);
    setGroups((gRes.data as Group[]) || []);
    setTopics((tRes.data as Topic[]) || []);
    setEpisodes((eRes.data as Episode[]) || []);
    setR2Connected(Boolean((r2Res.data as { connected?: boolean } | null)?.connected));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const selectedTopic = selectedTopicId && selectedTopicId !== NO_TOPIC
    ? topics.find((t) => t.id === selectedTopicId) || null
    : null;

  const groupTopics = useMemo(
    () => topics.filter((t) => t.group_id === selectedGroupId),
    [topics, selectedGroupId]
  );

  const episodesOf = useCallback(
    (groupId: string, topicId: string | null) =>
      episodes.filter((e) => {
        if (e.group_id !== groupId) return false;
        if (topicId === null) return true;
        if (topicId === NO_TOPIC) return e.topic_id === null;
        return e.topic_id === topicId;
      }),
    [episodes]
  );

  const topicEpisodes = useMemo(
    () => (selectedGroupId ? episodesOf(selectedGroupId, selectedTopicId) : []),
    [episodesOf, selectedGroupId, selectedTopicId]
  );

  const filteredEpisodes = useMemo(() => {
    const from = epFrom.trim() ? Number(epFrom) : null;
    const to = epTo.trim() ? Number(epTo) : null;
    const q = search.trim().toLowerCase();
    return topicEpisodes.filter((ep) => {
      if (from !== null && (ep.ep_number === null || ep.ep_number < from)) return false;
      if (to !== null && (ep.ep_number === null || ep.ep_number > to)) return false;
      if (!q) return true;
      return (
        ep.title?.toLowerCase().includes(q) ||
        ep.file_name?.toLowerCase().includes(q) ||
        String(ep.ep_number ?? '').includes(q)
      );
    });
  }, [topicEpisodes, search, epFrom, epTo]);

  const resetEpisodeFilters = () => {
    setSearch('');
    setEpFrom('');
    setEpTo('');
    setSelectedEpisodes(new Set());
  };

  const openGroup = (id: string) => {
    setSelectedGroupId(id);
    setSelectedTopicId(null);
    resetEpisodeFilters();
    setError('');
  };

  const openTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    resetEpisodeFilters();
  };

  const backToGroups = () => {
    setSelectedGroupId(null);
    setSelectedTopicId(null);
    resetEpisodeFilters();
  };

  const handleScan = async (groupId: string) => {
    setScanning(true);
    setError('');
    try {
      await callBackend(`/api/telegram/groups/${groupId}/scan`);
      setToast('Scan finished — topics and videos are up to date.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed.');
    }
    setScanning(false);
    loadData();
  };

  const handleAddGroup = async (data: NewGroupInput) => {
    const { data: newGroup, error: insertError } = await supabase.from('groups').insert(data).select().single();
    if (insertError || !newGroup) {
      setError(insertError?.message || 'Could not add this group.');
      return;
    }
    setShowAddModal(false);
    const groupId = (newGroup as Group).id;
    openGroup(groupId);
    await loadData();
    if (!backendConfigured) return;
    // Scan straight away so topics/videos show up without an extra manual step.
    try {
      setScanning(true);
      await callBackend(`/api/telegram/groups/${groupId}/scan`);
    } catch {
      // Group was still added successfully; the user can hit Scan manually.
    } finally {
      setScanning(false);
      loadData();
    }
  };

  const handleDeleteGroup = async (id: string, title: string) => {
    const confirmed = window.confirm(
      `Remove "${title}"? This deletes the group and its scanned topics/episodes from this app (it does not affect the Telegram group itself).`
    );
    if (!confirmed) return;
    await supabase.from('groups').delete().eq('id', id);
    if (selectedGroupId === id) backToGroups();
    loadData();
  };

  const queueDownloads = async (eps: Episode[]) => {
    const pending = eps.filter((e) => e.status !== 'completed' && e.status !== 'downloading');
    if (pending.length === 0) {
      setToast('Those videos are already downloaded or in progress.');
      return;
    }
    const { error: dlError } = await supabase.from('downloads').insert(
      pending.map((ep) => ({ episode_id: ep.id, status: 'queued', total_bytes: ep.file_size }))
    );
    if (dlError) {
      setError(dlError.message);
      return;
    }
    await supabase.from('episodes').update({ status: 'queued' }).in('id', pending.map((e) => e.id));
    setSelectedEpisodes(new Set());
    setToast(`Queued ${pending.length} video${pending.length === 1 ? '' : 's'} for download.`);
    loadData();
  };

  const toggleEpisode = (id: string) => {
    const next = new Set(selectedEpisodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEpisodes(next);
  };

  const allVisibleSelected = filteredEpisodes.length > 0 && filteredEpisodes.every((e) => selectedEpisodes.has(e.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) setSelectedEpisodes(new Set());
    else setSelectedEpisodes(new Set(filteredEpisodes.map((e) => e.id)));
  };

  const selectedEpisodeObjects = topicEpisodes.filter((e) => selectedEpisodes.has(e.id));

  return (
    <div className="space-y-4 animate-fade-in">
      <Breadcrumb
        group={selectedGroup}
        topicLabel={
          selectedTopicId === NO_TOPIC ? 'Videos without a topic' : selectedTopic?.title ?? null
        }
        onHome={backToGroups}
        onGroup={() => { setSelectedTopicId(null); resetEpisodeFilters(); }}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-error-400/70 hover:text-error-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : !selectedGroup ? (
        <GroupGrid
          groups={groups}
          topics={topics}
          episodes={episodes}
          onOpen={openGroup}
          onDelete={handleDeleteGroup}
          onAdd={() => setShowAddModal(true)}
        />
      ) : selectedTopicId === null ? (
        <GroupDetail
          group={selectedGroup}
          topics={groupTopics}
          episodesOf={episodesOf}
          scanning={scanning}
          onScan={() => handleScan(selectedGroup.id)}
          onBack={backToGroups}
          onOpenTopic={openTopic}
          onDownloadTopic={(eps) => queueDownloads(eps)}
          onForwardTopic={(topic, eps) =>
            setForwardRequest({ group: selectedGroup, topic, episodes: eps, mode: 'topic' })
          }
        />
      ) : (
        <EpisodeBrowser
          group={selectedGroup}
          topic={selectedTopic}
          isNoTopicBucket={selectedTopicId === NO_TOPIC}
          episodes={filteredEpisodes}
          totalInTopic={topicEpisodes.length}
          selected={selectedEpisodes}
          onToggle={toggleEpisode}
          allVisibleSelected={allVisibleSelected}
          onToggleAll={toggleSelectAllVisible}
          search={search}
          onSearch={setSearch}
          epFrom={epFrom}
          epTo={epTo}
          onEpFrom={setEpFrom}
          onEpTo={setEpTo}
          scanning={scanning}
          r2Connected={r2Connected}
          onScan={() => handleScan(selectedGroup.id)}
          onBack={() => { setSelectedTopicId(null); resetEpisodeFilters(); }}
          onQueue={() => queueDownloads(selectedEpisodeObjects)}
          onForward={() =>
            setForwardRequest({
              group: selectedGroup,
              topic: selectedTopic,
              episodes: selectedEpisodeObjects,
              mode: 'selected',
            })
          }
        />
      )}

      {showAddModal && <AddGroupModal onClose={() => setShowAddModal(false)} onAdd={handleAddGroup} />}
      {forwardRequest && (
        <ForwardModal
          group={forwardRequest.group}
          topic={forwardRequest.topic}
          episodes={forwardRequest.episodes}
          mode={forwardRequest.mode}
          onClose={() => setForwardRequest(null)}
          onDone={(message) => {
            setForwardRequest(null);
            setSelectedEpisodes(new Set());
            setToast(message);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-primary-500/30 bg-dark-900 px-4 py-3 text-sm text-white shadow-2xl shadow-black/50 animate-slide-up">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-400" />
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast('')} className="text-dark-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

function Breadcrumb({ group, topicLabel, onHome, onGroup }: {
  group: Group | null;
  topicLabel: string | null;
  onHome: () => void;
  onGroup: () => void;
}) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-dark-500 flex-wrap">
      <button onClick={onHome} className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${group ? 'hover:bg-dark-800 hover:text-white' : 'text-white font-medium'}`}>
        <Users className="w-3.5 h-3.5" /> Groups
      </button>
      {group && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <button onClick={onGroup} className={`px-2 py-1 rounded-md transition-colors truncate max-w-[220px] ${topicLabel ? 'hover:bg-dark-800 hover:text-white' : 'text-white font-medium'}`}>
            {group.title}
          </button>
        </>
      )}
      {group && topicLabel && (
        <>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="px-2 py-1 text-accent-400 font-medium truncate max-w-[260px]">{topicLabel}</span>
        </>
      )}
    </nav>
  );
}

function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy group ID"
      className="inline-flex items-center gap-1.5 rounded-md bg-dark-800/80 px-2 py-1 font-mono text-[10px] text-dark-400 transition-colors hover:bg-dark-700 hover:text-white"
    >
      {value}
      {copied ? <Check className="h-3 w-3 text-success-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min((done / total) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-dark-800">
      <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function GroupGrid({ groups, topics, episodes, onOpen, onDelete, onAdd }: {
  groups: Group[];
  topics: Topic[];
  episodes: Episode[];
  onOpen: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="animate-slide-up">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="h-4 w-4 text-primary-400" /> Groups
          <span className="text-xs font-normal text-dark-500">{groups.length}</span>
        </h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-600"
        >
          <Plus className="h-4 w-4" /> Add Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40 p-12 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-dark-700" />
          <p className="text-sm text-dark-400">No groups added yet</p>
          <p className="mb-4 mt-1 text-xs text-dark-600">Add a Telegram group to start scanning for videos</p>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            <Plus className="h-4 w-4" /> Add Your First Group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const groupEpisodes = episodes.filter((e) => e.group_id === group.id);
            const done = groupEpisodes.filter((e) => e.status === 'completed').length;
            const topicCount = topics.filter((t) => t.group_id === group.id).length;
            const size = groupEpisodes.reduce((sum, e) => sum + (e.file_size || 0), 0);
            return (
              <button
                key={group.id}
                onClick={() => onOpen(group.id)}
                className="group card-hover rounded-2xl border border-dark-800 bg-dark-900/60 p-4 text-left transition-all hover:border-primary-500/40"
              >
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500/30 to-accent-500/30">
                    <span className="text-base font-bold text-white">{group.title.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{group.title}</p>
                      {group.is_forum && (
                        <span className="shrink-0 rounded bg-accent-500/10 px-1.5 py-0.5 text-[9px] font-medium text-accent-400">FORUM</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-dark-500">{group.username ? '@' + group.username : 'private group'}</p>
                  </div>
                  <span
                    onClick={(e) => { e.stopPropagation(); onDelete(group.id, group.title); }}
                    title="Remove group"
                    className="rounded p-1 text-dark-600 transition-colors hover:bg-error-500/20 hover:text-error-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </div>

                <div className="mb-3"><CopyableId value={group.chat_id} /></div>

                <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                  <Stat icon={<MessagesSquare className="h-3 w-3" />} label="Topics" value={group.is_forum ? topicCount : '—'} />
                  <Stat icon={<Film className="h-3 w-3" />} label="Videos" value={groupEpisodes.length} />
                  <Stat icon={<HardDrive className="h-3 w-3" />} label="Size" value={formatBytes(size)} />
                </div>

                <ProgressBar done={done} total={groupEpisodes.length} />
                <div className="mt-2 flex items-center justify-between text-[10px] text-dark-500">
                  <span>{done}/{groupEpisodes.length} downloaded</span>
                  <span className="flex items-center gap-1">
                    Last scan {formatTimeAgo(group.last_scanned_at)}
                    <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-dark-800/40 px-2 py-1.5">
      <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wide text-dark-500">{icon}{label}</div>
      <p className="mt-0.5 truncate text-xs font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

function GroupDetail({ group, topics, episodesOf, scanning, onScan, onBack, onOpenTopic, onDownloadTopic, onForwardTopic }: {
  group: Group;
  topics: Topic[];
  episodesOf: (groupId: string, topicId: string | null) => Episode[];
  scanning: boolean;
  onScan: () => void;
  onBack: () => void;
  onOpenTopic: (topicId: string) => void;
  onDownloadTopic: (episodes: Episode[]) => void;
  onForwardTopic: (topic: Topic | null, episodes: Episode[]) => void;
}) {
  const allEpisodes = episodesOf(group.id, null);
  const untopicked = episodesOf(group.id, NO_TOPIC);
  const totalSize = allEpisodes.reduce((sum, e) => sum + (e.file_size || 0), 0);
  const done = allEpisodes.filter((e) => e.status === 'completed').length;

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Group header */}
      <div className="relative overflow-hidden rounded-2xl border border-dark-800 bg-gradient-to-br from-dark-900 via-dark-900 to-primary-950/30 p-5">
        <div className="absolute right-0 top-0 h-56 w-56 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="relative">
          <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-dark-400 transition-colors hover:bg-dark-800 hover:text-white">
            <ChevronLeft className="h-3.5 w-3.5" /> All groups
          </button>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/30 to-accent-500/30 glow">
              <span className="text-xl font-bold text-white">{group.title.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-bold text-white">{group.title}</h2>
                {group.is_forum && (
                  <span className="rounded bg-accent-500/10 px-1.5 py-0.5 text-[9px] font-medium text-accent-400">FORUM</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <CopyableId value={group.chat_id} />
                {group.username && <span className="text-xs text-accent-400">@{group.username}</span>}
                <span className="text-[10px] text-dark-500">Last scan {formatTimeAgo(group.last_scanned_at)}</span>
              </div>
            </div>
            <button
              onClick={onScan}
              disabled={scanning}
              className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Scan group
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<MessagesSquare className="h-3 w-3" />} label="Topics" value={group.is_forum ? topics.length : '—'} />
            <Stat icon={<Film className="h-3 w-3" />} label="Videos" value={allEpisodes.length} />
            <Stat icon={<Download className="h-3 w-3" />} label="Downloaded" value={`${done}/${allEpisodes.length}`} />
            <Stat icon={<HardDrive className="h-3 w-3" />} label="Total size" value={formatBytes(totalSize)} />
          </div>
        </div>
      </div>

      {/* Topic list */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Layers className="h-4 w-4 text-accent-400" /> Topics in this group
          <span className="text-xs font-normal text-dark-500">{topics.length}</span>
        </h3>

        {topics.length === 0 && untopicked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40 p-10 text-center">
            <MessagesSquare className="mx-auto mb-3 h-10 w-10 text-dark-700" />
            <p className="text-sm text-dark-400">
              {group.is_forum ? 'No topics found yet' : 'This group is not a forum, so it has no topics'}
            </p>
            <p className="mt-1 text-xs text-dark-600">Run a scan to pull the topics and videos from Telegram</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {topics.map((topic) => {
              const eps = episodesOf(group.id, topic.id);
              return (
                <TopicCard
                  key={topic.id}
                  title={topic.title}
                  episodes={eps}
                  onOpen={() => onOpenTopic(topic.id)}
                  onDownload={() => onDownloadTopic(eps)}
                  onForward={() => onForwardTopic(topic, eps)}
                />
              );
            })}
            {untopicked.length > 0 && (
              <TopicCard
                title="Videos without a topic"
                episodes={untopicked}
                muted
                onOpen={() => onOpenTopic(NO_TOPIC)}
                onDownload={() => onDownloadTopic(untopicked)}
                onForward={() => onForwardTopic(null, untopicked)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TopicCard({ title, episodes, muted, onOpen, onDownload, onForward }: {
  title: string;
  episodes: Episode[];
  muted?: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onForward: () => void;
}) {
  const done = episodes.filter((e) => e.status === 'completed').length;
  const inR2 = episodes.filter((e) => e.r2_key).length;
  const size = episodes.reduce((sum, e) => sum + (e.file_size || 0), 0);

  return (
    <div className="card-hover rounded-2xl border border-dark-800 bg-dark-900/60 p-4 transition-all hover:border-accent-500/40">
      <button onClick={onOpen} className="group w-full text-left">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${muted ? 'bg-dark-800' : 'bg-accent-500/15'}`}>
            <MessagesSquare className={`h-4 w-4 ${muted ? 'text-dark-500' : 'text-accent-400'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="mt-0.5 text-[11px] text-dark-500">
              <span className="font-semibold text-primary-400">{episodes.length}</span> video{episodes.length === 1 ? '' : 's'} · {formatBytes(size)}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-dark-600 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
        </div>

        <div className="mt-3"><ProgressBar done={done} total={episodes.length} /></div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-dark-500">
          <span>{done}/{episodes.length} downloaded</span>
          {inR2 > 0 && (
            <span className="flex items-center gap-1 text-success-400"><Cloud className="h-3 w-3" /> {inR2} in R2</span>
          )}
        </div>
      </button>

      <div className="mt-3 flex items-center gap-2 border-t border-dark-800 pt-3">
        <button
          onClick={onDownload}
          disabled={episodes.length === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-dark-800 px-2 py-1.5 text-[11px] font-medium text-dark-300 transition-colors hover:bg-primary-500 hover:text-white disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Download all
        </button>
        <button
          onClick={onForward}
          disabled={episodes.length === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-dark-800 px-2 py-1.5 text-[11px] font-medium text-dark-300 transition-colors hover:bg-accent-500 hover:text-white disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" /> Forward all
        </button>
      </div>
    </div>
  );
}

interface EpisodeBrowserProps {
  group: Group;
  topic: Topic | null;
  isNoTopicBucket: boolean;
  episodes: Episode[];
  totalInTopic: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  allVisibleSelected: boolean;
  onToggleAll: () => void;
  search: string;
  onSearch: (v: string) => void;
  epFrom: string;
  epTo: string;
  onEpFrom: (v: string) => void;
  onEpTo: (v: string) => void;
  scanning: boolean;
  r2Connected: boolean;
  onScan: () => void;
  onBack: () => void;
  onQueue: () => void;
  onForward: () => void;
}

function EpisodeBrowser({
  group, topic, isNoTopicBucket, episodes, totalInTopic, selected, onToggle,
  allVisibleSelected, onToggleAll, search, onSearch, epFrom, epTo, onEpFrom, onEpTo,
  scanning, r2Connected, onScan, onBack, onQueue, onForward,
}: EpisodeBrowserProps) {
  const title = isNoTopicBucket ? 'Videos without a topic' : topic?.title ?? group.title;
  const selectedSize = episodes.filter((e) => selected.has(e.id)).reduce((sum, e) => sum + (e.file_size || 0), 0);

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Topic header */}
      <div className="rounded-2xl border border-dark-800 bg-dark-900/60 p-5">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-dark-400 transition-colors hover:bg-dark-800 hover:text-white">
          <ChevronLeft className="h-3.5 w-3.5" /> {group.title}
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-500/15">
            <MessagesSquare className="h-5 w-5 text-accent-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-white">{title}</h2>
            <p className="text-xs text-dark-500">
              <span className="font-semibold text-primary-400">{totalInTopic}</span> video{totalInTopic === 1 ? '' : 's'} in this topic
              {r2Connected ? (
                <span className="ml-2 inline-flex items-center gap-1 text-success-400"><Cloud className="h-3 w-3" /> R2 connected</span>
              ) : (
                <span className="ml-2 text-dark-600">R2 not connected</span>
              )}
            </p>
          </div>
          <button
            onClick={onScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-lg bg-dark-800 px-3 py-2 text-xs font-medium text-dark-300 transition-colors hover:bg-dark-700 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Rescan
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dark-800 bg-dark-900/60 p-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-dark-700/50 bg-dark-800/50 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-dark-500" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search videos..."
            className="w-40 bg-transparent text-xs text-white placeholder-dark-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-dark-700/50 bg-dark-800/50 px-2.5 py-1.5">
          <span className="text-[10px] font-medium text-dark-500">EP</span>
          <input
            value={epFrom}
            onChange={(e) => onEpFrom(e.target.value.replace(/\D/g, ''))}
            placeholder="from"
            inputMode="numeric"
            className="w-12 bg-transparent text-xs text-white placeholder-dark-600 outline-none"
          />
          <span className="text-dark-600">–</span>
          <input
            value={epTo}
            onChange={(e) => onEpTo(e.target.value.replace(/\D/g, ''))}
            placeholder="to"
            inputMode="numeric"
            className="w-12 bg-transparent text-xs text-white placeholder-dark-600 outline-none"
          />
        </div>
        <button
          onClick={onToggleAll}
          disabled={episodes.length === 0}
          className="rounded-lg bg-dark-800 px-3 py-1.5 text-[11px] font-medium text-dark-300 transition-colors hover:bg-dark-700 disabled:opacity-40"
        >
          {allVisibleSelected ? 'Deselect all' : `Select all (${episodes.length})`}
        </button>
        <span className="ml-auto text-[11px] text-dark-500">{episodes.length} shown</span>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-500/30 bg-primary-500/10 px-4 py-3 animate-slide-right">
          <span className="text-xs font-medium text-primary-200">
            {selected.size} selected · {formatBytes(selectedSize)}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onQueue}
              className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-600"
            >
              <Download className="h-3.5 w-3.5" /> Download selected
            </button>
            <button
              onClick={onForward}
              className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-600"
            >
              <Send className="h-3.5 w-3.5" /> Forward to group
            </button>
          </div>
        </div>
      )}

      {/* Episodes */}
      {episodes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40 py-14 text-center">
          <Film className="mx-auto mb-3 h-10 w-10 text-dark-700" />
          <p className="text-sm text-dark-500">No videos match this view</p>
          <p className="mt-1 text-xs text-dark-600">Clear the filters, or run a rescan to detect new videos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {episodes.map((ep) => {
            const isSelected = selected.has(ep.id);
            return (
              <div
                key={ep.id}
                onClick={() => onToggle(ep.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
                  isSelected
                    ? 'border-primary-500/40 bg-primary-500/10'
                    : 'border-transparent bg-dark-900/60 hover:border-dark-700 hover:bg-dark-800/60'
                }`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                  isSelected ? 'border-primary-500 bg-primary-500' : 'border-dark-600'
                }`}>
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                </div>
                <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-dark-800/60">
                  {ep.thumbnail_url ? (
                    <img src={ep.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Film className="h-5 w-5 text-dark-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {ep.ep_number !== null && (
                      <span className="shrink-0 text-xs font-bold text-primary-400 tabular-nums">EP{String(ep.ep_number).padStart(3, '0')}</span>
                    )}
                    <p className="truncate text-sm font-medium text-white">{ep.title || ep.file_name || 'Untitled'}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-dark-500">
                    <span>{formatBytes(ep.file_size)}</span>
                    {ep.duration > 0 && <span>{Math.floor(ep.duration / 60)}m</span>}
                    <span className={`rounded-full px-1.5 py-0.5 font-medium ${getStatusColor(ep.status)}`}>{ep.status}</span>
                    {ep.r2_key && (
                      <span className="flex items-center gap-1 rounded-full bg-success-500/10 px-1.5 py-0.5 font-medium text-success-400">
                        <Cloud className="h-2.5 w-2.5" /> in R2
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
