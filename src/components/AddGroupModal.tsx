import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Hash,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Users,
  MessagesSquare,
} from 'lucide-react';
import { backendConfigured, resolveGroup, type ResolvedGroupInfo } from '@/lib/backend';

export interface NewGroupInput {
  chat_id: string;
  title: string;
  username: string;
  is_forum: boolean;
}

export function AddGroupModal({ onClose, onAdd }: { onClose: () => void; onAdd: (data: NewGroupInput) => void }) {
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
        if (myRequestId !== requestIdRef.current) return; // a newer request superseded this one
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
        className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-6 animate-slide-up shadow-2xl shadow-black/40 max-h-[92vh] overflow-y-auto"
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

                {/* Topic preview so the user can see what's inside before adding */}
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
