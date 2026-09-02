import { useEffect, useState } from 'react';
import {
  Send,
  Phone,
  Key,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Zap,
  Shield,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { TelegramSettings } from '@/lib/types';
import { formatTimeAgo } from '@/lib/utils';

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

export function TelegramPage() {
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error: loadError } = await supabase.from('telegram_settings').select('*').maybeSingle();
      if (loadError) {
        setError('Could not load Telegram settings. Please refresh and try again.');
      } else if (data) {
        setSettings(data as TelegramSettings);
        setConnected((data as TelegramSettings).connected);
      } else {
        setSettings({
          id: '', api_id: '', api_hash: '', phone: '', session_string: '',
          connected: false, last_connected_at: null, created_at: '', updated_at: '',
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    const result = settings.id
      ? await supabase.from('telegram_settings').update({
          api_id: settings.api_id,
          api_hash: settings.api_hash,
          phone: settings.phone,
        }).eq('id', settings.id)
      : await supabase.from('telegram_settings').insert({
          api_id: settings.api_id,
          api_hash: settings.api_hash,
          phone: settings.phone,
        }).select().maybeSingle();

    if (result.error) {
      setError('Could not save Telegram credentials. Please try again.');
    } else if (!settings.id && result.data) {
      setSettings({ ...settings, id: (result.data as TelegramSettings).id });
    }
    setSaving(false);
  };

  const handleConnect = async () => {
    setError('');
    setConnecting(true);
    try {
      await callBackend('/api/telegram/send-code');
      setAwaitingCode(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the verification code.');
    } finally {
      setConnecting(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    setConnecting(true);
    try {
      const result = await callBackend('/api/telegram/verify-code', {
        code,
        password: needsPassword ? password : undefined,
      });
      if (result.needsPassword) {
        setNeedsPassword(true);
        return;
      }
      setConnected(true);
      setAwaitingCode(false);
      setCode('');
      setPassword('');
      setNeedsPassword(false);
      const { data } = await supabase.from('telegram_settings').select('*').maybeSingle();
      if (data) setSettings(data as TelegramSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setError('');
    try {
      await callBackend('/api/telegram/logout');
    } catch {
      // fall through and clear local state / DB flag either way
    }
    setConnected(false);
    setAwaitingCode(false);
    if (settings?.id) {
      const { error: disconnectError } = await supabase.from('telegram_settings').update({ connected: false }).eq('id', settings.id);
      if (disconnectError) setError('Could not disconnect Telegram. Please try again.');
    }
  };

  const update = (field: keyof TelegramSettings, value: string) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {/* Connection Status */}
      <div className={`relative overflow-hidden rounded-2xl border p-6 ${
        connected ? 'border-success-500/30 bg-gradient-to-br from-success-500/10 to-dark-900' : 'border-dark-800 bg-dark-900/60'
      }`}>
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${connected ? 'bg-success-500/20' : 'bg-dark-800'}`}>
              <Send className={`w-6 h-6 ${connected ? 'text-success-400' : 'text-dark-500'}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Telegram Userbot</h2>
              <p className="text-xs text-dark-500">
                {connected ? `Connected as ${settings?.phone || 'user'}` : 'Not connected — set up your userbot credentials'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success-500/10 text-success-400 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Active
                </span>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-error-500/20 text-dark-400 hover:text-error-400 text-xs font-medium transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Disconnect
                </button>
              </>
            ) : (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 text-dark-400 text-xs font-medium">
                <XCircle className="w-4 h-4" /> Offline
              </span>
            )}
          </div>
        </div>
      </div>

      {/* API Credentials */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="w-4 h-4 text-primary-400" /> API Credentials
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">API ID</label>
            <input
              type="text"
              value={settings?.api_id || ''}
              onChange={(e) => update('api_id', e.target.value)}
              placeholder="12345678"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">API Hash</label>
            <input
              type="password"
              value={settings?.api_hash || ''}
              onChange={(e) => update('api_hash', e.target.value)}
              placeholder="your_api_hash_here"
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="text"
                value={settings?.phone || ''}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+85512345678"
                className="w-full bg-dark-800 border border-dark-700 rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Credentials
          </button>
        </div>
      </div>

      {/* Connection / OTP */}
      {!connected && (
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-warning-400" /> Connect Userbot
          </h3>
          <div>
            {!awaitingCode ? (
              <>
                <p className="text-xs text-dark-400 mb-4">
                  Save your details first, then connect. Telegram will text a login code to the phone number above.
                </p>
                <button
                  onClick={handleConnect}
                  disabled={!settings?.api_id || !settings?.api_hash || !settings?.phone || connecting}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-success-500 hover:bg-success-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Connect & Send Code
                </button>
                {(!settings?.api_id || !settings?.api_hash || !settings?.phone) && (
                  <p className="text-xs text-warning-400 mt-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Fill in all credentials above first
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-dark-400">
                  Enter the login code Telegram just sent to {settings?.phone}.
                </p>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="12345"
                  className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors font-mono tracking-widest"
                />
                {needsPassword && (
                  <>
                    <p className="text-xs text-dark-400">
                      Your account has Two-Step Verification enabled — enter that password too.
                    </p>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="2FA password"
                      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors"
                    />
                  </>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleVerify}
                    disabled={!code || connecting}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-success-500 hover:bg-success-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Verify & Connect
                  </button>
                  <button
                    onClick={() => { setAwaitingCode(false); setCode(''); setPassword(''); setNeedsPassword(false); }}
                    className="text-xs text-dark-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Session Info */}
      {connected && (
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-success-400" /> Session Info
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-dark-800/40 rounded-lg p-3">
              <p className="text-xs text-dark-500 mb-1">Session Status</p>
              <p className="text-sm text-success-400 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Active & Encrypted
              </p>
            </div>
            <div className="bg-dark-800/40 rounded-lg p-3">
              <p className="text-xs text-dark-500 mb-1">Last Connected</p>
              <p className="text-sm text-white font-medium">{formatTimeAgo(settings?.last_connected_at ?? null)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Setup Guide */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-accent-400" /> How to get Telegram API credentials
        </h3>
        <div className="space-y-2 text-xs text-dark-400">
          {[
            'Go to my.telegram.org and log in with your phone number',
            'Click "API development tools"',
            'Fill in app name (any name) and platform',
            'Copy the api_id and api_hash',
            'Paste them here, enter your phone number, and connect',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-warning-500/10 border border-warning-500/20">
          <Shield className="w-4 h-4 text-warning-400 shrink-0 mt-0.5" />
          <p className="text-xs text-warning-300">
            Your credentials are stored securely. The userbot uses your personal Telegram account to access groups. Make sure you comply with Telegram's Terms of Service.
          </p>
        </div>
      </div>
    </div>
  );
}
