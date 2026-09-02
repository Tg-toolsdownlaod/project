import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Sparkles,
  FileText,
  Send,
  Youtube,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { UrlList, UrlListItem } from '@/lib/types';
import { getStatusColor } from '@/lib/utils';
import { parseUrls, getSourceColor, type ParsedUrlItem } from '@/lib/urlParser';

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
  const [showAutoImport, setShowAutoImport] = useState(false);
  const [editingList, setEditingList] = useState<string | null>(null);
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

  const importUrls = async (parsed: ParsedUrlItem[]) => {
    if (!selectedList || parsed.length === 0) return;
    const rows = parsed.map((p) => ({
      url_list_id: selectedList,
      url: p.url,
      label: p.label,
      episode_number: p.episode_number,
    }));
    const { error } = await supabase.from('url_list_items').insert(rows);
    if (error) {
      // Fall back to individual inserts for partial success
      for (const row of rows) {
        await supabase.from('url_list_items').insert(row);
      }
    }
    setShowAutoImport(false);
    loadData();
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
  const existingUrls = useMemo(() => new Set(listItems.map((i) => i.url)), [listItems]);

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
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
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
                    onClick={() => setShowAutoImport(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white text-xs font-medium transition-all glow"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Auto Import
                  </button>
                  <button
                    onClick={() => setShowAddItem(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add URL
                  </button>
                </div>
              </div>

              {/* Quick stats */}
              {listItems.length > 0 && (
                <div className="flex items-center gap-3 mb-3 text-[10px]">
                  <span className="text-dark-500">{listItems.length} total</span>
                  <span className="text-success-400">{listItems.filter((i) => i.status === 'completed').length} done</span>
                  <span className="text-primary-400">{listItems.filter((i) => i.status === 'downloading').length} active</span>
                  <span className="text-dark-500">{listItems.filter((i) => i.status === 'pending').length} pending</span>
                </div>
              )}

              {listItems.length === 0 ? (
                <div className="text-center py-10">
                  <Link2 className="w-10 h-10 text-dark-700 mx-auto mb-3" />
                  <p className="text-sm text-dark-500">No URLs in this list yet</p>
                  <p className="text-xs text-dark-600 mt-1 mb-4">Use Auto Import to paste links in bulk</p>
                  <button
                    onClick={() => setShowAutoImport(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white text-sm font-medium transition-all glow"
                  >
                    <Sparkles className="w-4 h-4" /> Auto Import URLs
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  {listItems.map((item) => {
                    const source = detectSource(item.url);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/30 hover:bg-dark-800/60 transition-colors group"
                      >
                        {item.episode_number !== null && (
                          <span className={`text-xs font-bold ${currentColor.text} tabular-nums w-12 shrink-0`}>
                            EP{String(item.episode_number).padStart(3, '0')}
                          </span>
                        )}
                        <SourceBadge source={source} />
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
                          className="p-1.5 rounded-lg hover:bg-error-500/20 text-dark-600 hover:text-error-400 transition-all shrink-0 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
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
      {showAutoImport && selectedList && (
        <AutoImportModal
          existingUrls={existingUrls}
          onClose={() => setShowAutoImport(false)}
          onImport={importUrls}
        />
      )}
    </div>
  );
}

function detectSource(url: string): 'telegram' | 'youtube' | 'other' {
  if (/t\.me|telegram\.org/.test(url)) return 'telegram';
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  return 'other';
}

function SourceBadge({ source }: { source: 'telegram' | 'youtube' | 'other' }) {
  const config = {
    telegram: { icon: Send, color: 'text-accent-400 bg-accent-500/10' },
    youtube: { icon: Youtube, color: 'text-error-400 bg-error-500/10' },
    other: { icon: Link2, color: 'text-dark-400 bg-dark-700' },
  };
  const { icon: Icon, color } = config[source];
  return (
    <span className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${color}`}>
      <Icon className="w-3 h-3" />
    </span>
  );
}

function AutoImportModal({
  existingUrls,
  onClose,
  onImport,
}: {
  existingUrls: Set<string>;
  onClose: () => void;
  onImport: (items: ParsedUrlItem[]) => void;
}) {
  const [text, setText] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const parsed = useMemo(() => {
    if (!text.trim()) return [];
    return parseUrls(text, { skipDuplicates, existingUrls });
  }, [text, skipDuplicates, existingUrls]);

  const duplicates = parsed.filter((p) => p.duplicate);
  const telegramCount = parsed.filter((p) => p.source === 'telegram').length;
  const youtubeCount = parsed.filter((p) => p.source === 'youtube').length;
  const otherCount = parsed.filter((p) => p.source === 'other').length;
  const withEpNumbers = parsed.filter((p) => p.episode_number !== null).length;

  const handleFileRead = async (file: File) => {
    if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
      const content = await file.text();
      setText((prev) => (prev ? prev + '\n' + content : content));
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFileRead(file);
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;
    setImporting(true);
    await onImport(parsed);
    setImporting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border border-dark-700 bg-dark-900 p-6 animate-slide-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-400" /> Auto Import URLs
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-dark-500 mb-5">
          Paste any text containing links. Episode numbers, labels, and sources are detected automatically.
        </p>

        {/* Drop zone + textarea */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative rounded-xl border-2 border-dashed transition-colors mb-4 ${
            dragOver ? 'border-primary-500 bg-primary-500/5' : 'border-dark-700 bg-dark-800/30'
          }`}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onDrop={(e) => { e.preventDefault(); }}
            placeholder={
              'Paste URLs here — one per line or comma-separated:\n\n' +
              'https://t.me/groupname/123 EP1\n' +
              'https://t.me/c/123456/789 EP2 Episode Title\n' +
              'https://t.me/groupname/456, https://t.me/groupname/789\n' +
              '@channelname/123 EP3\n\n' +
              'Or drag & drop a .txt file here'
            }
            rows={8}
            className="w-full bg-transparent px-4 py-3 text-xs text-white placeholder-dark-600 outline-none resize-y font-mono"
          />
          {!text && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <FileText className="w-8 h-8 text-dark-700 mx-auto mb-2" />
                <p className="text-xs text-dark-600">Or drag a .txt file here</p>
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() => setSkipDuplicates(!skipDuplicates)}
              className={`w-10 h-6 rounded-full transition-colors relative ${skipDuplicates ? 'bg-primary-500' : 'bg-dark-700'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${skipDuplicates ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-xs text-dark-300">Skip duplicates</span>
          </label>
          {duplicates.length > 0 && (
            <span className="text-xs text-warning-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {duplicates.length} duplicate{duplicates.length !== 1 ? 's' : ''} found
            </span>
          )}
        </div>

        {/* Stats bar */}
        {parsed.length > 0 && (
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-xs font-bold text-white bg-dark-800 px-3 py-1.5 rounded-lg">
              {parsed.length} URLs ready
            </span>
            {telegramCount > 0 && (
              <span className="text-xs text-accent-400 bg-accent-500/10 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <Send className="w-3 h-3" /> {telegramCount} Telegram
              </span>
            )}
            {youtubeCount > 0 && (
              <span className="text-xs text-error-400 bg-error-500/10 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <Youtube className="w-3 h-3" /> {youtubeCount} YouTube
              </span>
            )}
            {otherCount > 0 && (
              <span className="text-xs text-dark-400 bg-dark-700 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <Link2 className="w-3 h-3" /> {otherCount} Other
              </span>
            )}
            {withEpNumbers > 0 && (
              <span className="text-xs text-primary-400 bg-primary-500/10 px-2.5 py-1 rounded-lg">
                {withEpNumbers} EP numbers detected
              </span>
            )}
          </div>
        )}

        {/* Preview table */}
        {parsed.length > 0 && (
          <div className="rounded-lg border border-dark-700 bg-dark-800/30 mb-5 max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-dark-900 text-dark-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-16">EP</th>
                  <th className="text-left px-3 py-2 font-medium w-16">Type</th>
                  <th className="text-left px-3 py-2 font-medium">URL & Label</th>
                  <th className="text-left px-3 py-2 font-medium w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 50).map((item, i) => (
                  <tr key={i} className="border-t border-dark-700/50 hover:bg-dark-800/50">
                    <td className="px-3 py-2 text-primary-400 font-bold tabular-nums">
                      {item.episode_number !== null ? `EP${String(item.episode_number).padStart(3, '0')}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-bold ${getSourceColor(item.source)}`}>
                        {item.source === 'telegram' ? 'TG' : item.source === 'youtube' ? 'YT' : 'LINK'}
                      </span>
                    </td>
                    <td className="px-3 py-2 min-w-0">
                      <p className="text-white truncate font-medium">{item.label}</p>
                      <p className="text-dark-500 truncate font-mono text-[10px]">{item.url}</p>
                    </td>
                    <td className="px-3 py-2">
                      {item.duplicate ? (
                        <span className="text-warning-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> dup
                        </span>
                      ) : (
                        <span className="text-success-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> new
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {parsed.length > 50 && (
                  <tr className="border-t border-dark-700/50">
                    <td colSpan={4} className="px-3 py-2 text-center text-dark-500">
                      +{parsed.length - 50} more...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-dark-600">
            {parsed.length > 0 ? `${parsed.length} URLs will be imported` : 'Paste text to start parsing'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={parsed.length === 0 || importing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed glow"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Import {parsed.length > 0 ? `${parsed.length} URL${parsed.length !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      </div>
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
