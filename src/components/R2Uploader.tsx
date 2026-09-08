import { useCallback, useEffect, useRef, useState } from 'react';
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

interface UploadItem {
  id: string;
  file: File;
  status: ItemStatus;
  loaded: number;
  total: number;
  key?: string;
  url?: string | null;
  error?: string;
}

const nextId = () => Math.random().toString(36).slice(2);

/**
 * Picks videos in the panel and puts them in R2, one after another, then hands
 * back the public URL of each — the whole point of the card, so the URL is
 * copyable the moment the upload lands, without a trip to the Cloudflare
 * dashboard.
 *
 * Uploads run one at a time on purpose: several videos at once share the same
 * uplink and only make every one of them slower, while the backend streams
 * each request straight through to R2.
 */
export function R2Uploader({ publicUrl }: { publicUrl: string }) {
  const [folder, setFolder] = useState('uploads');
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState('');
  const [objects, setObjects] = useState<R2Object[]>([]);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);
  const queueRef = useRef<UploadItem[]>([]);

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));
    queueRef.current = queueRef.current.map((it) => (it.id === id ? { ...it, ...changes } : it));
  }, []);

  const refreshObjects = useCallback(async () => {
    if (!backendConfigured) return;
    setListing(true);
    setListError('');
    try {
      const result = await listR2Objects(folder ? `${folder.replace(/^\/+|\/+$/g, '')}/` : '', 50);
      setObjects(result.objects || []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not list the bucket.');
    }
    setListing(false);
  }, [folder]);

  // Debounced: the folder box refreshes the listing, but not once per keystroke.
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
          folder,
          onProgress: (loaded, total) => patch(next.id, { loaded, total: total || next.file.size }),
        });
        patch(next.id, {
          status: 'done',
          loaded: next.file.size,
          key: result.key,
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
  }, [folder, patch, refreshObjects]);

  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      const chosen = Array.from(files || []);
      if (!chosen.length) return;
      const added: UploadItem[] = chosen.map((file) => ({
        id: nextId(),
        file,
        status: 'pending',
        loaded: 0,
        total: file.size,
      }));
      setItems((prev) => [...prev, ...added]);
      queueRef.current = [...queueRef.current, ...added];
      void drain();
    },
    [drain]
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
        <div className="flex items-center gap-2">
          <label className="text-xs text-dark-500">Folder</label>
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="uploads"
            className="w-40 bg-dark-800 border border-dark-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-dark-600 font-mono outline-none focus:border-primary-500 transition-colors"
          />
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
          Uploaded straight into <span className="font-mono">{folder || 'uploads'}/</span> — the
          public URL appears as soon as each file lands.
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
                    <p className="text-sm text-white truncate font-medium">{item.file.name}</p>
                    <p className="text-[10px] text-dark-500">
                      {item.status === 'uploading'
                        ? `${formatBytes(item.loaded)} of ${formatBytes(item.total)} · ${percent}%`
                        : item.status === 'error'
                          ? item.error
                          : formatBytes(item.file.size)}
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

      {/* What is already in that folder, read back from the bucket itself. */}
      <div className="mt-5 border-t border-dark-800 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-dark-300">
            In <span className="font-mono">{folder || '/'}</span>
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
            {objects.map((obj) => (
              <div
                key={obj.key}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-800/30 hover:bg-dark-800/60 transition-colors"
              >
                <FileVideo className="w-4 h-4 text-dark-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate font-mono">{obj.key}</p>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
