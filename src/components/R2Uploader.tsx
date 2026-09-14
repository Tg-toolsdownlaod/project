import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  X,
  Trash2,
  RefreshCw,
  FileVideo,
  Clapperboard,
  Hash,
  Layers,
} from 'lucide-react';
import {
  backendConfigured,
  deleteR2Object,
  listR2Objects,
  uploadToR2,
  type R2Object,
} from '@/lib/backend';
import { formatBytes, formatTimeAgo } from '@/lib/utils';

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error';
type NameMode = 'episode' | 'label';

interface UploadItem {
  id: string;
  file: File;
  status: ItemStatus;
  loaded: number;
  total: number;
  key: string;
  title: string;
  show: string;
  season: string;
  episodeNumber?: number;
  label?: string;
  url?: string | null;
  error?: string;
}

const nextId = () => Math.random().toString(36).slice(2);

/**
 * Keeps letters, combining marks, numbers, spaces, dots and dashes, then turns
 * spaces into dashes. The mark class matters for Khmer (and Vietnamese,
 * Devanagari, ...): most vowels and the subscript sign are combining marks
 * attached to a letter, not letters themselves, so dropping them silently
 * corrupted show/episode names typed in those scripts into the wrong word.
 */
function slugSegment(value: string): string {
  const cleaned = value.replace(/[^\p{L}\p{M}\p{N}\-. ]+/gu, '').trim();
  return cleaned.replace(/\s+/g, '-');
}

function extOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function stripExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

const pad3 = (n: number) => String(Math.max(0, n)).padStart(3, '0');

interface NameFields {
  show: string;
  season: string;
  mode: NameMode;
  episodeStart: string;
  label: string;
}

interface NamePlan {
  key: string;
  title: string;
  /** Forwarded to the backend so it can file the upload as an episode. */
  show: string;
  season: string;
  episodeNumber?: number;
  label?: string;
}

/** Turns the show/season/episode fields into a readable R2 key + display title. */
function planName(fields: NameFields, fileName: string, index: number, multiple: boolean): NamePlan {
  const showSlug = slugSegment(fields.show) || 'uploads';
  const seasonSlug = fields.season.trim() ? slugSegment(fields.season) : '';
  const ext = extOf(fileName) || 'mp4';

  let namePart: string;
  let titleTail: string;
  let episodeNumber: number | undefined;
  let label: string | undefined;
  if (fields.mode === 'episode') {
    const start = Number.parseInt(fields.episodeStart, 10);
    episodeNumber = (Number.isFinite(start) ? start : 1) + index;
    namePart = `EP${pad3(episodeNumber)}`;
    titleTail = `Episode ${episodeNumber}`;
  } else {
    const base = fields.label.trim() ? slugSegment(fields.label) : slugSegment(stripExt(fileName)) || 'video';
    namePart = multiple ? `${base}-${index + 1}` : base;
    label = fields.label.trim()
      ? multiple
        ? `${fields.label.trim()} ${index + 1}`
        : fields.label.trim()
      : stripExt(fileName);
    titleTail = label;
  }

  const dir = [showSlug, seasonSlug].filter(Boolean).join('/');
  const key = `${dir}/${namePart}.${ext}`;
  const title = [fields.show.trim() || 'Untitled', fields.season.trim(), titleTail]
    .filter(Boolean)
    .join(' · ');
  return { key, title, show: fields.show.trim(), season: fields.season.trim(), episodeNumber, label };
}

/** Turns a key already in R2 back into a readable title, for the browse list. */
function describeStoredKey(key: string): { title: string; badge?: string } {
  const parts = key.split('/');
  const fileWithExt = parts[parts.length - 1] || key;
  const dot = fileWithExt.lastIndexOf('.');
  const base = dot > 0 ? fileWithExt.slice(0, dot) : fileWithExt;
  const middle = parts.slice(1, -1);
  const epMatch = /^EP(\d+)$/i.exec(base);
  const title = epMatch ? `Episode ${Number.parseInt(epMatch[1], 10)}` : base.replace(/-/g, ' ');
  return { title, badge: middle.join(' / ') || undefined };
}

/**
 * Picks videos in the panel and puts them in R2 under a readable path built
 * from a show name, an optional season/arc, and an episode number or label --
 * so every key and public URL says on its own which show and which episode it
 * is, instead of a random-suffixed filename. Re-uploading the same show +
 * episode overwrites it in place rather than piling up duplicates.
 *
 * Uploads run one at a time on purpose: several videos at once share the same
 * uplink and only make every one of them slower, while the backend streams
 * each request straight through to R2.
 */
export function R2Uploader({ publicUrl }: { publicUrl: string }) {
  const [show, setShow] = useState('');
  const [season, setSeason] = useState('');
  const [mode, setMode] = useState<NameMode>('episode');
  const [episodeStart, setEpisodeStart] = useState('1');
  const [label, setLabel] = useState('');

  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState('');
  const [objects, setObjects] = useState<R2Object[]>([]);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);
  const queueRef = useRef<UploadItem[]>([]);

  const showSlug = slugSegment(show) || 'uploads';
  const browsePrefix = `${showSlug}/`;

  const preview = useMemo(
    () => planName({ show, season, mode, episodeStart, label }, 'video.mp4', 0, false),
    [show, season, mode, episodeStart, label]
  );

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));
    queueRef.current = queueRef.current.map((it) => (it.id === id ? { ...it, ...changes } : it));
  }, []);

  const refreshObjects = useCallback(async () => {
    if (!backendConfigured) return;
    setListing(true);
    setListError('');
    try {
      const result = await listR2Objects(browsePrefix, 50);
      setObjects(result.objects || []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not list the bucket.');
    }
    setListing(false);
  }, [browsePrefix]);

  // Debounced: the show name refreshes the listing, but not once per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void refreshObjects(), 400);
    return () => clearTimeout(timer);
  }, [refreshObjects]);

  /** Works the queue in order; re-entrant calls just return, the loop picks up. */
  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    for (;;) {
      const next = queueRef.current.find((it) => it.status === 'pending');
      if (!next) break;
      patch(next.id, { status: 'uploading', loaded: 0 });
      try {
        const result = await uploadToR2(next.file, {
          key: next.key,
          show: next.show,
          season: next.season,
          episode: next.episodeNumber,
          label: next.label,
          onProgress: (loaded, total) => patch(next.id, { loaded, total: total || next.file.size }),
        });
        patch(next.id, {
          status: 'done',
          loaded: next.file.size,
          key: result.key || next.key,
          url: result.url,
        });
      } catch (err) {
        patch(next.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed.',
        });
      }
    }
    runningRef.current = false;
    void refreshObjects();
  }, [patch, refreshObjects]);

  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      const chosen = Array.from(files || []);
      if (!chosen.length) return;
      const fields: NameFields = { show, season, mode, episodeStart, label };
      const multiple = chosen.length > 1;
      const added: UploadItem[] = chosen.map((file, index) => {
        const plan = planName(fields, file.name, index, multiple);
        return {
          id: nextId(),
          file,
          status: 'pending',
          loaded: 0,
          total: file.size,
          ...plan,
        };
      });
      setItems((prev) => [...prev, ...added]);
      queueRef.current = [...queueRef.current, ...added];
      void drain();
    },
    [show, season, mode, episodeStart, label, drain]
  );

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? '' : c)), 1500);
    } catch {
      setCopied('');
    }
  };

  const removeObject = async (key: string) => {
    if (!window.confirm(`Delete ${key} from R2? This cannot be undone.`)) return;
    try {
      await deleteR2Object(key);
      setObjects((prev) => prev.filter((o) => o.key !== key));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not delete the file.');
    }
  };

  const doneUrls = items.filter((it) => it.status === 'done' && it.url).map((it) => it.url as string);
  const busy = items.some((it) => it.status === 'pending' || it.status === 'uploading');

  return (
    <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-accent-400" /> Upload videos to R2
        </h3>
      </div>

      {/* Naming: what show, what season/arc, and which episode this is */}
      <div className="rounded-lg border border-dark-800 bg-dark-950/40 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-dark-400 font-medium mb-1.5 flex items-center gap-1.5">
              <Clapperboard className="w-3.5 h-3.5" /> Show / Series
            </label>
            <input
              value={show}
              onChange={(e) => setShow(e.target.value)}
              placeholder="Naruto Shippuden"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Season / Arc <span className="text-dark-600">(optional)</span>
            </label>
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="Season 1"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-3">
          <div className="flex rounded-lg bg-dark-800 p-1 shrink-0">
            <button
              onClick={() => setMode('episode')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                mode === 'episode' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              <Hash className="w-3.5 h-3.5" /> Episode
            </button>
            <button
              onClick={() => setMode('label')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'label' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              Movie / Extra
            </button>
          </div>

          {mode === 'episode' ? (
            <input
              type="number"
              min={0}
              value={episodeStart}
              onChange={(e) => setEpisodeStart(e.target.value)}
              placeholder="Episode #"
              className="w-full sm:w-40 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
            />
          ) : (
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Full Movie, OVA 1, Trailer…"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
            />
          )}
        </div>

        {mode === 'episode' && (
          <p className="text-[11px] text-dark-500 mt-2">
            Dropping several files at once numbers them EP{pad3(Number.parseInt(episodeStart, 10) || 1)},{' '}
            EP{pad3((Number.parseInt(episodeStart, 10) || 1) + 1)}, … in the order you picked them.
          </p>
        )}

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-dark-900 border border-dark-800 px-3 py-2">
          <span className="text-[10px] uppercase tracking-wide text-dark-500 shrink-0 mt-0.5">Will save as</span>
          <code className="text-[11px] text-primary-300 break-all">{preview.key}</code>
        </div>
      </div>

      {!backendConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs text-warning-300 mb-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            No backend is configured (VITE_TELEGRAM_BACKEND_URL), so the browser has nowhere to send
            the file. Start the userbot service and point the frontend at it.
          </span>
        </div>
      )}

      {backendConfigured && !publicUrl && (
        <div className="flex items-start gap-2 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs text-warning-300 mb-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Set the <strong>Public URL</strong> above (your r2.dev address or custom domain) —
            without it the file still uploads, but R2 has no public address to hand back.
          </span>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition-colors ${
          dragging
            ? 'border-primary-500 bg-primary-500/10'
            : 'border-dark-700 bg-dark-800/30 hover:border-dark-600'
        }`}
      >
        <UploadCloud className="w-7 h-7 text-dark-500" />
        <p className="text-sm text-white font-medium">Drop videos here, or click to choose</p>
        <p className="text-[11px] text-dark-500">
          The public URL is ready the moment each file lands.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-dark-400">
              {busy ? 'Uploading…' : `${items.filter((i) => i.status === 'done').length} uploaded`}
            </p>
            <div className="flex items-center gap-2">
              {doneUrls.length > 1 && (
                <button
                  onClick={() => copy(doneUrls.join('\n'), 'all')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-[11px] font-medium transition-colors"
                >
                  {copied === 'all' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  Copy all URLs
                </button>
              )}
              {!busy && (
                <button
                  onClick={() => {
                    setItems([]);
                    queueRef.current = [];
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-[11px] font-medium transition-colors"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </div>

          {items.map((item) => {
            const percent = item.total ? Math.round((item.loaded / item.total) * 100) : 0;
            return (
              <div key={item.id} className="rounded-lg bg-dark-800/40 p-3">
                <div className="flex items-center gap-3">
                  {item.status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
                  ) : item.status === 'error' ? (
                    <AlertTriangle className="w-4 h-4 text-error-400 shrink-0" />
                  ) : item.status === 'uploading' ? (
                    <Loader2 className="w-4 h-4 text-primary-400 animate-spin shrink-0" />
                  ) : (
                    <FileVideo className="w-4 h-4 text-dark-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">{item.title}</p>
                    <p className="text-[10px] text-dark-500 font-mono truncate">
                      {item.status === 'uploading'
                        ? `${item.key} · ${formatBytes(item.loaded)} of ${formatBytes(item.total)} · ${percent}%`
                        : item.status === 'error'
                          ? item.error
                          : item.key}
                    </p>
                  </div>
                  {item.status === 'done' && item.url && (
                    <>
                      <button
                        onClick={() => copy(item.url as string, item.id)}
                        title="Copy URL"
                        className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-white transition-colors"
                      >
                        {copied === item.id ? (
                          <Check className="w-3.5 h-3.5 text-success-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open"
                        className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </>
                  )}
                </div>

                {item.status === 'uploading' && (
                  <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-gradient-to-r from-accent-500 to-primary-500 rounded-full transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}

                {item.status === 'done' && (
                  <p className="mt-2 text-[11px] font-mono text-primary-300 break-all">
                    {item.url || `${item.key} (no public URL configured)`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* What is already in R2 for this show, read back from the bucket itself. */}
      <div className="mt-5 border-t border-dark-800 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-dark-300">
            Already in <span className="font-mono text-dark-200">{showSlug}/</span>
          </h4>
          <button
            onClick={() => void refreshObjects()}
            disabled={listing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            {listing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Refresh
          </button>
        </div>

        {listError && <p className="text-[11px] text-error-300 mb-2">{listError}</p>}

        {objects.length === 0 && !listing && !listError ? (
          <p className="text-[11px] text-dark-500">Nothing here yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {objects.map((obj) => {
              const described = describeStoredKey(obj.key);
              return (
                <div
                  key={obj.key}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-800/30 hover:bg-dark-800/60 transition-colors"
                >
                  <FileVideo className="w-4 h-4 text-dark-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-white truncate font-medium">{described.title}</p>
                      {described.badge && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-dark-700 text-dark-300">
                          {described.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-dark-500 font-mono truncate">{obj.key}</p>
                    <p className="text-[10px] text-dark-500">
                      {formatBytes(obj.size)}
                      {obj.last_modified ? ` · ${formatTimeAgo(obj.last_modified)}` : ''}
                    </p>
                  </div>
                  {obj.url && (
                    <>
                      <button
                        onClick={() => copy(obj.url as string, obj.key)}
                        title="Copy URL"
                        className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-white transition-colors"
                      >
                        {copied === obj.key ? (
                          <Check className="w-3.5 h-3.5 text-success-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={obj.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open"
                        className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </>
                  )}
                  <button
                    onClick={() => void removeObject(obj.key)}
                    title="Delete from R2"
                    className="p-1.5 rounded-lg hover:bg-error-500/20 text-dark-500 hover:text-error-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
