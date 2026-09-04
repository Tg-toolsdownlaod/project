import { useEffect, useState } from 'react';
import {
  Database,
  Cloud,
  HardDrive,
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
  ExternalLink,
  Folder,
  FileVideo,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { backendConfigured, testR2Connection } from '@/lib/backend';
import type { R2Settings, Episode } from '@/lib/types';
import { formatBytes, formatTimeAgo } from '@/lib/utils';

export function R2Page() {
  const [settings, setSettings] = useState<R2Settings | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [remoteStats, setRemoteStats] = useState<{ object_count?: number; total_bytes?: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: loadError } = await supabase.from('r2_settings').select('*').maybeSingle();
      if (loadError) {
        setError('Could not load R2 settings. Please refresh and try again.');
      } else if (data) {
        setSettings(data as R2Settings);
        setConnected((data as R2Settings).connected);
      } else {
        setSettings({
          id: '', account_id: '', access_key_id: '', secret_access_key: '',
          bucket_name: '', endpoint_url: '', public_url: '', region: 'auto',
          connected: false, last_connected_at: null, created_at: '', updated_at: '',
        });
      }
      const { data: epData } = await supabase.from('episodes').select('*').not('r2_key', 'is', null).order('updated_at', { ascending: false });
      setEpisodes((epData as Episode[]) || []);
      setLoading(false);
    })();
  }, []);

  /** Persists the form and returns the row id, or null when the save failed. */
  const handleSave = async (): Promise<string | null> => {
    if (!settings) return null;
    setSaving(true);
    setError('');
    const result = settings.id
      ? await supabase.from('r2_settings').update({
          account_id: settings.account_id,
          access_key_id: settings.access_key_id,
          secret_access_key: settings.secret_access_key,
          bucket_name: settings.bucket_name,
          endpoint_url: settings.endpoint_url,
          public_url: settings.public_url,
          region: settings.region,
        }).eq('id', settings.id)
      : await supabase.from('r2_settings').insert({
          account_id: settings.account_id,
          access_key_id: settings.access_key_id,
          secret_access_key: settings.secret_access_key,
          bucket_name: settings.bucket_name,
          endpoint_url: settings.endpoint_url,
          public_url: settings.public_url,
          region: settings.region,
        }).select().maybeSingle();

    let savedId: string | null = settings.id || null;
    if (result.error) {
      setError('Could not save R2 settings. Please try again.');
      savedId = null;
    } else if (!settings.id && result.data) {
      savedId = (result.data as R2Settings).id;
      setSettings({ ...settings, id: savedId });
    }
    setSaving(false);
    return savedId;
  };

  const handleTest = async () => {
    if (!settings) return;
    setError('');
    setNotice('');
    if (!settings.account_id || !settings.access_key_id || !settings.secret_access_key || !settings.bucket_name) {
      setError('Fill in the Account ID, Access Key ID, Secret Access Key and Bucket Name first.');
      return;
    }
    if (!backendConfigured) {
      setError('No backend is configured (VITE_TELEGRAM_BACKEND_URL), so the credentials cannot be verified from the browser.');
      return;
    }
    setTesting(true);
    let savedId: string | null = null;
    try {
      // Save first so the backend tests exactly what is stored.
      savedId = await handleSave();
      if (!savedId) {
        setTesting(false);
        return;
      }
      const rowId: string = savedId;
      const result = await testR2Connection();
      setRemoteStats({ object_count: result.object_count, total_bytes: result.total_bytes });
      setConnected(true);
      const now = new Date().toISOString();
      await supabase.from('r2_settings').update({ connected: true, last_connected_at: now }).eq('id', rowId);
      setSettings((prev) => (prev ? { ...prev, id: rowId, connected: true, last_connected_at: now } : prev));
      setNotice(`Connected to ${result.bucket || settings.bucket_name}.`);
    } catch (err) {
      setConnected(false);
      if (savedId) {
        await supabase.from('r2_settings').update({ connected: false }).eq('id', savedId);
      }
      setError(err instanceof Error ? err.message : 'Could not reach the R2 bucket with these credentials.');
    }
    setTesting(false);
  };

  const update = (field: keyof R2Settings, value: string) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const totalSize = remoteStats?.total_bytes ?? episodes.reduce((sum, e) => sum + (e.file_size || 0), 0);

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
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {/* Connection Status Banner */}
      <div className={`relative overflow-hidden rounded-2xl border p-6 ${
        connected ? 'border-success-500/30 bg-gradient-to-br from-success-500/10 to-dark-900' : 'border-dark-800 bg-dark-900/60'
      }`}>
        <div className="absolute top-0 right-0 w-48 h-48 bg-accent-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${connected ? 'bg-success-500/20' : 'bg-dark-800'}`}>
              <Cloud className={`w-6 h-6 ${connected ? 'text-success-400' : 'text-dark-500'}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Cloudflare R2 Storage</h2>
              <p className="text-xs text-dark-500">
                {connected ? `Connected to ${settings?.bucket_name || 'bucket'}` : 'Not connected — configure your R2 credentials'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success-500/10 text-success-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" /> Connected {settings?.last_connected_at && `· ${formatTimeAgo(settings.last_connected_at)}`}
              </span>
            ) : (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 text-dark-400 text-xs font-medium">
                <XCircle className="w-4 h-4" /> Disconnected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Storage Overview */}
      {connected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-accent-400" />
              <h3 className="text-sm font-semibold text-white">Storage Used</h3>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{formatBytes(totalSize)}</p>
            <div className="h-2 bg-dark-800 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-r from-accent-500 to-primary-500 rounded-full" style={{ width: `${Math.min((totalSize / (50 * 1024 * 1024 * 1024)) * 100, 100)}%` }} />
            </div>
            <p className="text-[10px] text-dark-500 mt-1">{formatBytes(totalSize)} of 50 GB</p>
          </div>
          <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileVideo className="w-4 h-4 text-primary-400" />
              <h3 className="text-sm font-semibold text-white">Files in R2</h3>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{remoteStats?.object_count ?? episodes.length}</p>
            <p className="text-xs text-dark-500 mt-1">
              {remoteStats?.object_count !== undefined ? 'Objects in the bucket' : 'Video files uploaded'}
            </p>
          </div>
          <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Folder className="w-4 h-4 text-warning-400" />
              <h3 className="text-sm font-semibold text-white">Bucket</h3>
            </div>
            <p className="text-sm text-white font-medium truncate">{settings?.bucket_name || '—'}</p>
            <p className="text-xs text-dark-500 mt-1">{settings?.region || 'auto'}</p>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-primary-400" /> R2 Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Account ID" value={settings?.account_id || ''} onChange={(v) => update('account_id', v)} placeholder="Your Cloudflare Account ID" mono />
          <Field label="Bucket Name" value={settings?.bucket_name || ''} onChange={(v) => update('bucket_name', v)} placeholder="my-videos" />
          <Field label="Access Key ID" value={settings?.access_key_id || ''} onChange={(v) => update('access_key_id', v)} placeholder="R2 access key ID" mono type="password" />
          <Field label="Secret Access Key" value={settings?.secret_access_key || ''} onChange={(v) => update('secret_access_key', v)} placeholder="R2 secret access key" mono type="password" />
          <Field label="Endpoint URL" value={settings?.endpoint_url || ''} onChange={(v) => update('endpoint_url', v)} placeholder="https://<account>.r2.cloudflarestorage.com" mono />
          <Field label="Public URL (optional)" value={settings?.public_url || ''} onChange={(v) => update('public_url', v)} placeholder="https://cdn.example.com" mono />
          <Field label="Region" value={settings?.region || 'auto'} onChange={(v) => update('region', v)} placeholder="auto" />
        </div>
        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
          </button>
          <button
            onClick={handleTest}
            disabled={testing || saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Test Connection
          </button>
        </div>
      </div>

      {/* Files in R2 */}
      {connected && episodes.length > 0 && (
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <FileVideo className="w-4 h-4 text-accent-400" /> Files in R2 Storage
          </h3>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {episodes.map((ep) => (
              <div key={ep.id} className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/30 hover:bg-dark-800/60 transition-colors">
                <FileVideo className="w-4 h-4 text-dark-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate font-medium">{ep.r2_key || ep.file_name || `EP${ep.ep_number}`}</p>
                  <p className="text-[10px] text-dark-500">{formatBytes(ep.file_size)}</p>
                </div>
                {ep.r2_key && settings?.public_url && (
                  <a href={`${settings.public_url}/${ep.r2_key}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-500 hover:text-white transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup Guide */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">How to get R2 credentials</h3>
        <div className="space-y-2 text-xs text-dark-400">
          {[
            'Go to Cloudflare Dashboard > R2 Object Storage',
            'Create a new bucket (e.g. "my-videos")',
            'Go to Manage R2 API Tokens > Create API Token',
            'Copy the Account ID, Access Key ID, and Secret Access Key',
            'Paste them here and click "Test Connection"',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, mono, type = 'text' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-dark-400 font-medium block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
