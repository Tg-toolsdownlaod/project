import { useEffect, useState, useCallback } from 'react';
import {
  Link2,
  Plus,
  Trash2,
  ExternalLink,
  Film,
  Download,
  Copy,
  Check,
  List,
  Tag,
  Pencil,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { UrlList, UrlListItem } from '@/lib/types';
import { getStatusColor } from '@/lib/utils';

const COLORS = [
  { name: 'blue', class: 'from-primary-500 to-primary-600', text: 'text-primary-400', bg: 'bg-primary-500/10' },
  { name: 'cyan', class: 'from-accent-500 to-accent-600', text: 'text-accent-400', bg: 'bg-accent-500/10' },
  { name: 'green', class: 'from-success-500 to-success-600', text: 'text-success-400', bg: 'bg-success-500/10' },
  { name: 'amber', class: 'from-warning-500 to-warning-600', text: 'text-warning-400', bg: 'bg-warning-500/10' },
  { name: 'red', class: 'from-error-500 to-error-600', text: 'text-error-400', bg: 'bg-error-500/10' },
];

export function UrlListsPage() {
  const [lists, setLists] = useState<UrlList[]>([]);
  const [items, setItems] = useState<UrlListItem[]>([]);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingList, setEditingList] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [lRes, iRes] = await Promise.all([
      supabase.from('url_lists').select('*').order('created_at', { ascending: false }),
      supabase.from('url_list_items').select('*').order('episode_number', { ascending: true, nullsFirst: false }),
    ]);
    setLists((lRes.data as UrlList[]) || []);
    setItems((iRes.data as UrlListItem[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addList = async (title: string, description: string, color: string) => {
    const { data } = await supabase.from('url_lists').insert({ title, description, color }).select().single();
    if (data) {
      setShowAddModal(false);
      loadData();
      setSelectedList((data as UrlList).id);
    }
  };

  const deleteList = async (id: string) => {
    await supabase.from('url_lists').delete().eq('id', id);
    if (selectedList === id) setSelectedList(null);
    loadData();
  };

  const addItem = async (url: string, label: string, epNumber: string) => {
    if (!selectedList || !url) return;
    await supabase.from('url_list_items').insert({
      url_list_id: selectedList,
      url,
      label: label || null,
      episode_number: epNumber ? parseInt(epNumber) : null,
    });
    setShowAddItem(false);
    loadData();
  };

  const addBulkItems = async () => {
    if (!selectedList || !bulkText.trim()) return;
    const lines = bulkText.trim().split('\n').filter((l) => l.trim());
    const rows = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const url = parts.find((p) => p.startsWith('http'));
      const epMatch = line.match(/EP?\s*(\d+)/i);
      return {
        url_list_id: selectedList,
        url: url || line.trim(),
        label: line.trim(),
        episode_number: epMatch ? parseInt(epMatch[1]) : null,
      };
    }).filter((r) => r.url);
    if (rows.length > 0) {
      await supabase.from('url_list_items').insert(rows);
      setBulkText('');
      setShowBulk(false);
      loadData();
    }
  };

  const deleteItem = async (id: string) => {
    await supabase.from('url_list_items').delete().eq('id', id);
    loadData();
  };

  const queueItemDownload = async (item: UrlListItem) => {
    await supabase.from('url_list_items').update({ status: 'downloading' }).eq('id', item.id);
    loadData();
  };

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const updateList = async (id: string, title: string, description: string) => {
    await supabase.from('url_lists').update({ title, description }).eq('id', id);
    setEditingList(null);
    loadData();
  };

  const currentList = lists.find((l) => l.id === selectedList);
  const currentColor = COLORS.find((c) => c.name === currentList?.color) || COLORS[0];
  const listItems = items.filter((i) => i.url_list_id === selectedList);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary-400" /> URL Lists
          </h2>
          <p className="text-xs text-dark-500">Organize episode URLs into lists for batch downloading</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New List
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lists sidebar */}
        <div className="space-y-2">
          {lists.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40 p-8 text-center">
              <List className="w-10 h-10 text-dark-700 mx-auto mb-3" />
              <p className="text-sm text-dark-500">No lists yet</p>
              <p className="text-xs text-dark-600 mt-1">Create a list to organize your URLs</p>
            </div>
          ) : (
            lists.map((list) => {
              const color = COLORS.find((c) => c.name === list.color) || COLORS[0];
              const count = items.filter((i) => i.url_list_id === list.id).length;
              const isSelected = selectedList === list.id;
              return (
                <div
                  key={list.id}
                  onClick={() => setSelectedList(isSelected ? null : list.id)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${
                    isSelected ? 'border-primary-500 bg-primary-500/5' : 'border-dark-800 bg-dark-900/60 hover:border-dark-700 card-hover'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color.class} flex items-center justify-center shrink-0`}>
                        <List className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">{list.title}</p>
                        {list.description && <p className="text-xs text-dark-500 truncate">{list.description}</p>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteList(list.id); }}
                      className="p-1 rounded hover:bg-error-500/20 text-dark-600 hover:text-error-400 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${color.bg} ${color.text} font-medium`}>
                      {count} URLs
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Items panel */}
        <div className="lg:col-span-2">
          {selectedList ? (
            <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentColor.class} flex items-center justify-center`}>
                    <Tag className="w-4 h-4 text-white" />
                  </div>
                  {editingList === selectedList ? (
                    <EditListName list={currentList!} onSave={(t, d) => updateList(selectedList, t, d)} onCancel={() => setEditingList(null)} />
                  ) : (
                    <div>
                      <p className="text-sm text-white font-medium">{currentList?.title}</p>
                      {currentList?.description && <p className="text-xs text-dark-500">{currentList.description}</p>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingList(selectedList)} className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowBulk(!showBulk)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs font-medium transition-colors"
                  >
                    <List className="w-3.5 h-3.5" /> Bulk Add
                  </button>
                  <button
                    onClick={() => setShowAddItem(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add URL
                  </button>
                </div>
              </div>

              {showBulk && (
                <div className="mb-4 p-3 rounded-lg bg-dark-800/40 border border-dark-700/30 animate-slide-down">
                  <p className="text-xs text-dark-400 mb-2">Paste URLs (one per line). Episode numbers auto-detected from "EP1", "EP 12" etc.</p>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="https://t.me/group/123 EP1&#10;https://t.me/group/124 EP2&#10;https://t.me/group/125 EP3"
                    rows={5}
                    className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-xs text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors font-mono"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setShowBulk(false)} className="px-3 py-1.5 rounded-lg bg-dark-800 text-dark-400 text-xs">Cancel</button>
                    <button onClick={addBulkItems} className="px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-medium">Add {bulkText.trim().split('\n').filter(l => l.trim()).length} URLs</button>
                  </div>
                </div>
              )}

              {listItems.length === 0 ? (
                <div className="text-center py-10">
                  <Link2 className="w-10 h-10 text-dark-700 mx-auto mb-3" />
                  <p className="text-sm text-dark-500">No URLs in this list yet</p>
                  <p className="text-xs text-dark-600 mt-1">Add URLs individually or use bulk add</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  {listItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/30 hover:bg-dark-800/60 transition-colors group"
                    >
                      {item.episode_number !== null && (
                        <span className={`text-xs font-bold ${currentColor.text} tabular-nums w-12 shrink-0`}>
                          EP{String(item.episode_number).padStart(3, '0')}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate font-medium">{item.label || item.url}</p>
                        <p className="text-[10px] text-dark-500 truncate font-mono">{item.url}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(item.status)} shrink-0`}>
                        {item.status}
                      </span>
                      <button
                        onClick={() => copyUrl(item.url, item.id)}
                        className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-white transition-colors shrink-0"
                      >
                        {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-success-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <a href={item.url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-white transition-colors shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {item.status === 'pending' && (
                        <button
                          onClick={() => queueItemDownload(item)}
                          className="p-1.5 rounded-lg hover:bg-primary-500/20 text-dark-500 hover:text-primary-400 transition-colors shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-1.5 rounded-lg hover:bg-error-500/20 text-dark-600 hover:text-error-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40 p-16 text-center">
              <Link2 className="w-12 h-12 text-dark-700 mx-auto mb-4" />
              <p className="text-sm text-dark-400">Select a list to view its URLs</p>
              <p className="text-xs text-dark-600 mt-1">Or create a new list to get started</p>
            </div>
          )}
        </div>
      </div>

      {showAddModal && <AddListModal onClose={() => setShowAddModal(false)} onAdd={addList} />}
      {showAddItem && <AddItemModal onClose={() => setShowAddItem(false)} onAdd={addItem} />}
    </div>
  );
}

function AddListModal({ onClose, onAdd }: { onClose: () => void; onAdd: (title: string, description: string, color: string) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('blue');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-1">New URL List</h3>
        <p className="text-xs text-dark-500 mb-5">Create a list to organize episode links</p>
        <form onSubmit={(e) => { e.preventDefault(); if (title) onAdd(title, description, color); }} className="space-y-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">List Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Series EP1-EP100"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Season 1 links"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-2">Color Tag</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c.name} type="button" onClick={() => setColor(c.name)}
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c.class} transition-all ${color === c.name ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-900' : ''}`} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors">Create List</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddItemModal({ onClose, onAdd }: { onClose: () => void; onAdd: (url: string, label: string, epNumber: string) => void }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [epNumber, setEpNumber] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-1">Add URL</h3>
        <p className="text-xs text-dark-500 mb-5">Add a single episode URL to this list</p>
        <form onSubmit={(e) => { e.preventDefault(); if (url) onAdd(url, label, epNumber); }} className="space-y-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">URL *</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://t.me/group/123"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors font-mono" />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Episode 1 - The Beginning"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Episode Number</label>
            <input type="number" value={epNumber} onChange={(e) => setEpNumber(e.target.value)} placeholder="1"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors">Add URL</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditListName({ list, onSave, onCancel }: { list: UrlList; onSave: (title: string, description: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description || '');
  return (
    <div className="flex items-center gap-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
        className="bg-dark-800 border border-dark-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-primary-500" />
      <button onClick={() => onSave(title, description)} className="p-1 rounded hover:bg-success-500/20 text-success-400"><Check className="w-4 h-4" /></button>
      <button onClick={onCancel} className="p-1 rounded hover:bg-dark-800 text-dark-500"><X className="w-4 h-4" /></button>
    </div>
  );
}
