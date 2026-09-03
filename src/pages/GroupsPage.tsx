import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus,
  Users,
  FolderTree,
  Film,
  RefreshCw,
  Trash2,
  Download,
  Search,
  CheckCircle2,
  Loader2,
  Layers,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Hash,
  MessagesSquare,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Group, Topic, Episode } from '@/lib/types';
import { formatBytes, formatTimeAgo, getStatusColor } from '@/lib/utils';

const BACKEND_URL = import.meta.env.VITE_TELEGRAM_BACKEND_URL as string | undefined;
const BACKEND_KEY = import.meta.env.VITE_TELEGRAM_BACKEND_KEY as string | undefined;

async function callBackend(path: string, body?: Record<string, unknown>) {
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
  return data;
}

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const [gRes, tRes, eRes] = await Promise.all([
      supabase.from('groups').select('*').order('created_at', { ascending: false }),
      supabase.from('topics').select('*').order('title', { ascending: true }),
      supabase.from('episodes').select('*').order('ep_number', { ascending: true }),
    ]);
    setGroups((gRes.data as Group[]) || []);
    setTopics((tRes.data as Topic[]) || []);
    setEpisodes((eRes.data as Episode[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEpisodes = episodes.filter((ep) => {
    if (selectedTopic) return ep.topic_id === selectedTopic;
    if (selectedGroup) return ep.group_id === selectedGroup;
    return true;
  }).filter((ep) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      ep.title?.toLowerCase().includes(q) ||
      ep.file_name?.toLowerCase().includes(q) ||
      String(ep.ep_number ?? '').includes(q)
    );
  });

  const groupTopics = topics.filter((t) => t.group_id === selectedGroup);

  const [scanError, setScanError] = useState('');

  const handleScan = async () => {
    if (!selectedGroup) return;
    setScanning(true);
    setScanError('');
    try {
      await callBackend(`/api/telegram/groups/${selectedGroup}/scan`);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed.');
    }
    setScanning(false);
    loadData();
  };

  const handleAddGroup = async (data: { chat_id: string; title: string; username: string; is_forum: boolean }) => {
    const { data: newGroup } = await supabase
      .from('groups')
      .insert(data)
      .select()
      .single();
    if (newGroup) {
      setShowAddModal(false);
      const groupId = (newGroup as Group).id;
      setSelectedGroup(groupId);
      await loadData();
      // Immediately scan so topics/videos show up without an extra manual step.
      try {
        setScanning(true);
        await callBackend(`/api/telegram/groups/${groupId}/scan`);
      } catch {
        // Group was still added successfully; user can hit Scan manually if this fails.
      } finally {
        setScanning(false);
        loadData();
      }
    }
  };

  const handleDeleteGroup = async (id: string, title: string) => {
    const confirmed = window.confirm(
      `Remove "${title}"? This deletes the group and its scanned topics/episodes from this app (it does not affect the Telegram group itself).`
    );
    if (!confirmed) return;
    await supabase.from('groups').delete().eq('id', id);
    if (selectedGroup === id) {
      setSelectedGroup(null);
      setSelectedTopic(null);
    }
    loadData();
  };

  const handleQueueDownloads = async () => {
    const epsToQueue = episodes.filter((e) => selectedEpisodes.has(e.id));
    const downloads = epsToQueue.map((ep) => ({
      episode_id: ep.id,
      status: 'queued',
      total_bytes: ep.file_size,
    }));
    if (downloads.length > 0) {
      await supabase.from('downloads').insert(downloads);
      await supabase.from('episodes').update({ status: 'queued' }).in('id', Array.from(selectedEpisodes));
      setSelectedEpisodes(new Set());
      loadData();
    }
  };

  const toggleEpisode = (id: string) => {
    const next = new Set(selectedEpisodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEpisodes(next);
  };

  const selectAllVisible = () => {
    if (selectedEpisodes.size === filteredEpisodes.length) {
      setSelectedEpisodes(new Set());
    } else {
      setSelectedEpisodes(new Set(filteredEpisodes.map((e) => e.id)));
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Group Cards Row */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-400" /> Groups
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Group
          </button>
        </div>

        {groups.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40 p-12 text-center">
            <Users className="w-12 h-12 text-dark-700 mx-auto mb-4" />
            <p className="text-sm text-dark-400">No groups added yet</p>
            <p className="text-xs text-dark-600 mt-1 mb-4">Add a Telegram group to start scanning for videos</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Your First Group
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {groups.map((group) => {
              const isSelected = selectedGroup === group.id;
              const groupEpCount = episodes.filter((e) => e.group_id === group.id).length;
              return (
                <div
                  key={group.id}
                  onClick={() => {
                    setSelectedGroup(isSelected ? null : group.id);
                    setSelectedTopic(null);
                  }}
                  className={`relative rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-primary-500 bg-primary-500/10 glow'
                      : 'border-dark-800 bg-dark-900/60 hover:border-dark-700 card-hover'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500/30 to-accent-500/30 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-white">{group.title.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {group.is_forum && (
                        <span className="text-[9px] text-accent-400 bg-accent-500/10 px-1.5 py-0.5 rounded font-medium">FORUM</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id, group.title); }}
                        title="Remove group"
                        className="p-1 rounded hover:bg-error-500/20 text-dark-600 hover:text-error-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-white font-medium truncate">{group.title}</p>
                  <p className="text-xs text-dark-500 truncate">{group.username ? '@' + group.username : group.chat_id}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs">
                    <span className="text-dark-400 flex items-center gap-1">
                      <Film className="w-3 h-3" /> {groupEpCount}
                    </span>
                    {group.is_forum && (
                      <span className="text-accent-400 flex items-center gap-1">
                        <Layers className="w-3 h-3" /> {topics.filter((t) => t.group_id === group.id).length}
                      </span>
                    )}
                    <span className="text-dark-500 flex items-center gap-1 ml-auto">
                      <span className={`w-1.5 h-1.5 rounded-full ${group.active ? 'bg-success-500' : 'bg-dark-600'}`} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Topic + Episode Browser */}
      {selectedGroup && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 animate-slide-up">
          {/* Topics sidebar */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4 sticky top-4">
              <div className="flex items-center gap-2 mb-3">
                <FolderTree className="w-4 h-4 text-accent-400" />
                <h3 className="text-sm font-semibold text-white">Topics</h3>
              </div>
              {groupTopics.length === 0 ? (
                <p className="text-xs text-dark-500 py-4 text-center">
                  {groups.find((g) => g.id === selectedGroup)?.is_forum
                    ? 'No topics found. Run a scan.'
                    : 'This group has no topics (not a forum).'}
                </p>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  <button
                    onClick={() => setSelectedTopic(null)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      !selectedTopic ? 'bg-accent-500/15 text-accent-400' : 'text-dark-400 hover:bg-dark-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" /> All Episodes
                  </button>
                  {groupTopics.map((topic) => {
                    const isSelected = selectedTopic === topic.id;
                    const epCount = episodes.filter((e) => e.topic_id === topic.id).length;
                    return (
                      <button
                        key={topic.id}
                        onClick={() => setSelectedTopic(isSelected ? null : topic.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          isSelected ? 'bg-accent-500/15 text-accent-400' : 'text-dark-400 hover:bg-dark-800'
                        }`}
                      >
                        <span className="truncate text-left">{topic.title}</span>
                        <span className="text-[10px] text-dark-500 shrink-0 ml-2">{epCount}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Episodes list */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-white">Episodes</h3>
                  <span className="text-xs text-dark-500">{filteredEpisodes.length} found</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-dark-800/50 rounded-lg px-2.5 py-1.5 border border-dark-700/50">
                    <Search className="w-3.5 h-3.5 text-dark-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search episodes..."
                      className="bg-transparent text-xs text-white placeholder-dark-500 outline-none w-32"
                    />
                  </div>
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Scan
                  </button>
                </div>
              </div>

              {scanError && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-error-500/10 border border-error-500/20 text-xs text-error-300">
                  {scanError}
                </div>
              )}

              {selectedEpisodes.size > 0 && (
                <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-primary-500/10 border border-primary-500/20 animate-slide-right">
                  <span className="text-xs text-primary-300 font-medium">{selectedEpisodes.size} episodes selected</span>
                  <div className="flex items-center gap-2">
                    <button onClick={selectAllVisible} className="text-[10px] text-dark-400 hover:text-white px-2 py-1">
                      {selectedEpisodes.size === filteredEpisodes.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={handleQueueDownloads}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Queue Downloads
                    </button>
                  </div>
                </div>
              )}

              {filteredEpisodes.length === 0 ? (
                <div className="text-center py-12">
                  <Film className="w-10 h-10 text-dark-700 mx-auto mb-3" />
                  <p className="text-sm text-dark-500">No episodes found</p>
                  <p className="text-xs text-dark-600 mt-1">Run a scan to detect videos in this group</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  {filteredEpisodes.map((ep) => {
                    const isSelected = selectedEpisodes.has(ep.id);
                    return (
                      <div
                        key={ep.id}
                        onClick={() => toggleEpisode(ep.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                          isSelected ? 'bg-primary-500/10 border border-primary-500/30' : 'bg-dark-800/30 hover:bg-dark-800/60 border border-transparent'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-primary-500 border-primary-500' : 'border-dark-600'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className="w-12 h-12 rounded-lg bg-dark-700/50 flex items-center justify-center shrink-0 overflow-hidden">
                          {ep.thumbnail_url ? (
                            <img src={ep.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Film className="w-5 h-5 text-dark-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {ep.ep_number !== null && (
                              <span className="text-xs font-bold text-primary-400 tabular-nums">EP{String(ep.ep_number).padStart(3, '0')}</span>
                            )}
                            <p className="text-sm text-white truncate font-medium">{ep.title || ep.file_name || 'Untitled'}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-dark-500">
                            <span>{formatBytes(ep.file_size)}</span>
                            {ep.duration > 0 && <span>{Math.floor(ep.duration / 60)}m</span>}
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(ep.status)}`}>{ep.status}</span>
                          </div>
                        </div>
                        {ep.r2_key && (
                          <Eye className="w-4 h-4 text-success-400 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Group Modal */}
      {showAddModal && <AddGroupModal onClose={() => setShowAddModal(false)} onAdd={handleAddGroup} />}
    </div>
  );
}

interface ResolvedGroupInfo {
  title: string;
  username: string | null;
  is_forum: boolean;
  participants_count?: number;
  topics?: { topic_id: string; title: string }[];
}

function AddGroupModal({ onClose, onAdd }: { onClose: () => void; onAdd: (data: { chat_id: string; title: string; username: string; is_forum: boolean }) => void }) {
  const [chatId, setChatId] = useState('');
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [isForum, setIsForum] = useState(false);

  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'verified' | 'failed'>('idle');
  const [verifyError, setVerifyError] = useState('');
  const [resolved, setResolved] = useState<ResolvedGroupInfo | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Auto-verify the group as soon as a plausible chat ID is typed, so the
  // user immediately sees the real group name and knows the ID is correct.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResolved(null);
    setVerifyError('');

    const trimmed = chatId.trim();
    if (!trimmed) {
      setVerifyState('idle');
      return;
    }

    setVerifyState('idle');
    debounceRef.current = setTimeout(async () => {
      const myRequestId = ++requestIdRef.current;
      setVerifyState('checking');
      try {
        const result = await callBackend('/api/telegram/groups/resolve', { chat_id: trimmed });
        if (myRequestId !== requestIdRef.current) return; // a newer request superseded this one
        const info: ResolvedGroupInfo = {
          title: result.title,
          username: result.username ?? null,
          is_forum: !!result.is_forum,
          participants_count: result.participants_count,
          topics: result.topics,
        };
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-6 animate-slide-up shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-1">Add Telegram Group</h3>
        <p className="text-xs text-dark-500 mb-5">Paste the Chat ID — we'll confirm the group name automatically</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Chat ID *</label>
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

            {/* Live connection feedback */}
            {verifyState === 'checking' && (
              <p className="text-xs text-dark-500 mt-1.5">Connecting to Telegram to look up this group…</p>
            )}
            {verifyState === 'failed' && (
              <p className="text-xs text-error-400 mt-1.5 flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {verifyError || "Couldn't find this group. Double-check the Chat ID."}
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
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                  </span>
                </div>

                {/* Topic / video preview so the user can see what's inside before adding */}
                {resolved.topics && resolved.topics.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-dark-800/80">
                    <p className="text-[10px] text-dark-500 font-medium mb-1.5 flex items-center gap-1.5">
                      <MessagesSquare className="w-3 h-3" /> {resolved.topics.length} topic{resolved.topics.length === 1 ? '' : 's'} found
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {resolved.topics.slice(0, 12).map((t) => (
                        <span key={t.topic_id} className="text-[10px] text-dark-300 bg-dark-800/70 border border-dark-700/60 px-2 py-1 rounded-md truncate max-w-[160px]">
                          {t.title}
                        </span>
                      ))}
                      {resolved.topics.length > 12 && (
                        <span className="text-[10px] text-dark-500 px-2 py-1">+{resolved.topics.length - 12} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">
              Group Title {verifyState === 'verified' ? <span className="text-success-500">(auto-filled)</span> : '*'}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Anime Series"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Username (optional)</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@groupname"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setIsForum(!isForum)}
              className={`w-10 h-6 rounded-full transition-colors relative ${isForum ? 'bg-primary-500' : 'bg-dark-700'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isForum ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-dark-300">This is a forum (has topics/threads)</span>
          </label>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!chatId || !title}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> Add & Scan Group
            </button>
          </div>
          {verifyState !== 'verified' && chatId && title && (
            <p className="text-[10px] text-dark-500 text-center -mt-2">
              Adding without a confirmed connection — the ID couldn't be auto-verified.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
