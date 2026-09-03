import { useEffect, useState, useCallback } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Clock,
  Sparkles,
  Send,
  Hash,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AutoDownloadRule, Group, Topic } from '@/lib/types';
import { formatTimeAgo } from '@/lib/utils';

export function AutoDownloadPage() {
  const [rules, setRules] = useState<(AutoDownloadRule & { group?: Group; topic?: Topic })[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadRules = useCallback(async () => {
    const { data } = await supabase
      .from('auto_download_rules')
      .select('*, group:groups(*), topic:topics(*)')
      .order('created_at', { ascending: false });
    setRules((data as (AutoDownloadRule & { group?: Group; topic?: Topic })[]) || []);
    const [gRes, tRes] = await Promise.all([
      supabase.from('groups').select('*'),
      supabase.from('topics').select('*'),
    ]);
    setGroups((gRes.data as Group[]) || []);
    setTopics((tRes.data as Topic[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const toggleRule = async (id: string, active: boolean) => {
    await supabase.from('auto_download_rules').update({ active: !active }).eq('id', id);
    loadRules();
  };

  const deleteRule = async (id: string) => {
    await supabase.from('auto_download_rules').delete().eq('id', id);
    loadRules();
  };

  const addRule = async (data: {
    group_id: string;
    topic_id: string | null;
    auto_ep_start: number | null;
    auto_ep_end: number | null;
    quality_filter: string | null;
    min_file_size_mb: number;
    forward_to_chat_id: string | null;
    forward_enabled: boolean;
  }) => {
    await supabase.from('auto_download_rules').insert(data);
    setShowAddModal(false);
    loadRules();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-dark-800 bg-gradient-to-br from-dark-900 via-dark-900 to-primary-950/30 p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning-500 to-warning-600 flex items-center justify-center glow">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Auto Download Rules</h2>
              <p className="text-xs text-dark-500">Automatically download new episodes as they're posted</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Rule
            </button>
            <div className="flex items-center gap-2 text-xs text-dark-500 ml-auto">
              <Sparkles className="w-3.5 h-3.5 text-warning-400" />
              <span>{rules.filter((r) => r.active).length} active rules</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rules List */}
      {rules.length === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40 p-12 text-center">
          <Zap className="w-12 h-12 text-dark-700 mx-auto mb-4" />
          <p className="text-sm text-dark-400">No auto-download rules yet</p>
          <p className="text-xs text-dark-600 mt-1 mb-4">Create a rule to automatically download new episodes from your groups</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Create First Rule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-xl border p-4 transition-all ${
                rule.active
                  ? 'border-primary-500/30 bg-primary-500/5'
                  : 'border-dark-800 bg-dark-900/60'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${rule.active ? 'bg-warning-500/20' : 'bg-dark-800'}`}>
                    <Zap className={`w-4 h-4 ${rule.active ? 'text-warning-400' : 'text-dark-600'}`} />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{rule.group?.title || 'Unknown Group'}</p>
                    {rule.topic && (
                      <p className="text-xs text-dark-500">{rule.topic.title}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => toggleRule(rule.id, rule.active)} className="shrink-0">
                  {rule.active ? (
                    <ToggleRight className="w-8 h-8 text-primary-400" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-dark-600" />
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-dark-800/40 rounded-lg p-2.5">
                  <p className="text-dark-500 text-[10px] mb-0.5">Episode Range</p>
                  <p className="text-white font-medium tabular-nums">
                    {rule.auto_ep_start ?? '∞'} - {rule.auto_ep_end ?? '∞'}
                  </p>
                </div>
                <div className="bg-dark-800/40 rounded-lg p-2.5">
                  <p className="text-dark-500 text-[10px] mb-0.5">Min File Size</p>
                  <p className="text-white font-medium">{rule.min_file_size_mb} MB</p>
                </div>
                {rule.forward_enabled && rule.forward_to_chat_id && (
                  <div className="bg-accent-500/10 rounded-lg p-2.5 col-span-2">
                    <p className="text-accent-400/70 text-[10px] mb-0.5 flex items-center gap-1">
                      <Send className="w-2.5 h-2.5" /> Auto-forward to
                    </p>
                    <p className="text-accent-300 font-medium font-mono truncate">{rule.forward_to_chat_id}</p>
                  </div>
                )}
                {rule.quality_filter && (
                  <div className="bg-dark-800/40 rounded-lg p-2.5 col-span-2">
                    <p className="text-dark-500 text-[10px] mb-0.5">Quality Filter</p>
                    <p className="text-white font-medium">{rule.quality_filter}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-800">
                <span className="text-[10px] text-dark-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Last checked: {formatTimeAgo(rule.last_check_at)}
                </span>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="p-1.5 rounded-lg hover:bg-error-500/20 text-dark-600 hover:text-error-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-warning-400" /> How Auto Download Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { step: '1', title: 'Set Range', desc: 'Define episode range (e.g. EP1-EP100) for each group/topic' },
            { step: '2', title: 'Monitor', desc: 'The bot scans for new episodes matching your criteria' },
            { step: '3', title: 'Download & Forward', desc: 'New episodes go to R2 — and to another group if you set a forward ID' },
          ].map((item) => (
            <div key={item.step} className="bg-dark-800/30 rounded-lg p-4">
              <div className="w-7 h-7 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-xs font-bold mb-2">
                {item.step}
              </div>
              <p className="text-sm text-white font-medium mb-1">{item.title}</p>
              <p className="text-xs text-dark-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <AddRuleModal groups={groups} topics={topics} onClose={() => setShowAddModal(false)} onAdd={addRule} />
      )}
    </div>
  );
}

function AddRuleModal({
  groups,
  topics,
  onClose,
  onAdd,
}: {
  groups: Group[];
  topics: Topic[];
  onClose: () => void;
  onAdd: (data: {
    group_id: string;
    topic_id: string | null;
    auto_ep_start: number | null;
    auto_ep_end: number | null;
    quality_filter: string | null;
    min_file_size_mb: number;
    forward_to_chat_id: string | null;
    forward_enabled: boolean;
  }) => void;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [topicId, setTopicId] = useState<string | null>(null);
  const [epStart, setEpStart] = useState('');
  const [epEnd, setEpEnd] = useState('');
  const [quality, setQuality] = useState('');
  const [minSize, setMinSize] = useState('10');
  const [forwardChatId, setForwardChatId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId) return;
    onAdd({
      group_id: groupId,
      topic_id: topicId || null,
      auto_ep_start: epStart ? parseInt(epStart) : null,
      auto_ep_end: epEnd ? parseInt(epEnd) : null,
      quality_filter: quality || null,
      min_file_size_mb: parseInt(minSize) || 0,
      forward_to_chat_id: forwardChatId.trim() || null,
      forward_enabled: Boolean(forwardChatId.trim()),
    });
  };

  const groupTopics = topics.filter((t) => t.group_id === groupId);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-6 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-1">Create Auto Download Rule</h3>
        <p className="text-xs text-dark-500 mb-5">Automatically download new episodes matching these criteria</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Group *</label>
            <select
              value={groupId}
              onChange={(e) => { setGroupId(e.target.value); setTopicId(null); }}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>
          {groupTopics.length > 0 && (
            <div>
              <label className="text-xs text-dark-400 font-medium block mb-1.5">Topic (optional)</label>
              <select
                value={topicId ?? ''}
                onChange={(e) => setTopicId(e.target.value || null)}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors"
              >
                <option value="">All topics</option>
                {groupTopics.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-dark-400 font-medium block mb-1.5">EP Start</label>
              <input
                type="number"
                value={epStart}
                onChange={(e) => setEpStart(e.target.value)}
                placeholder="1"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 font-medium block mb-1.5">EP End</label>
              <input
                type="number"
                value={epEnd}
                onChange={(e) => setEpEnd(e.target.value)}
                placeholder="100"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Quality Filter (optional)</label>
            <input
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              placeholder="e.g. 1080p, 720p"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Min File Size (MB)</label>
            <input
              type="number"
              value={minSize}
              onChange={(e) => setMinSize(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5 flex items-center gap-1.5">
              <Send className="w-3 h-3 text-accent-400" /> Auto-forward to Group ID (optional)
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                value={forwardChatId}
                onChange={(e) => setForwardChatId(e.target.value)}
                placeholder="-100xxxxxxxxxx"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors font-mono"
              />
            </div>
            <p className="text-[10px] text-dark-500 mt-1.5">
              Every new episode this rule picks up is also forwarded into that group.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors">
              Create Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
