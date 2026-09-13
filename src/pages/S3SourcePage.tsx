import { useEffect, useRef, useState } from 'react';
import {
  Server,
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ArrowRightLeft,
  FileVideo,
  Search,
  HardDrive,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import {
  backendConfigured,
  testS3SourceConnection,
  listS3SourceObjects,
  startS3Migration,
  getS3MigrationStatus,
  type S3MigrationStatus,
  type S3SourceObject,
} from '@/lib/backend';
import type { S3SourceSettings } from '@/lib/types';
import { formatBytes, formatTimeAgo } from '@/lib/utils';

/**
 * A second, independent S3-compatible bucket (e.g. an old Contabo/Backblaze
 * host) -- configured with its own access key, entirely separate from the
 * main R2 bucket in Settings > R2 Storage. Lets a subscriber browse what's
 * still sitting there and, when ready, migrate it into R2 in one pass.
 */
export function S3SourcePage() {
  const [settings, setSettings] = useState<S3SourceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [remoteStats, setRemoteStats] = useState<{ object_count?: number; total_bytes?: number } | null>(null);

  const [prefix, setPrefix] = useState('');
  const [objects, setObjects] = useState<S3SourceObject[]>([]);
  const [objectsTotal, setObjectsTotal] = useState(0);
  const [browsing, setBrowsing] = useState(false);

  const [migration, setMigration] = useState<S3MigrationStatus | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [deleteSource, setDeleteSource] = useState(true);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: loadError } = await supabase.from('s3_source_settings').select('*').maybeSingle();
      if (loadError) {
        setError('Could not load the source storage settings. Please refresh and try again.');
      } else if (data) {
        setSettings(data as S3SourceSettings);
        setConnected((data as S3SourceSettings).connected);
      } else {
        setSettings({
          id: '', endpoint_url: '', access_key_id: '', secret_access_key: '',
          bucket_name: '', region: 'us-east-1', force_path_style: true,
          connected: false, last_connected_at: null, created_at: '', updated_at: '',
        });
      }
      setLoading(false);
      if (backendConfigured) {
        try {
          const status = await getS3MigrationStatus();
          setMigration(status);
        } catch {
          // Backend not reachable yet -- the settings form still works.
        }
      }
    })();
  }, []);

  // Follow a migration that's running, whether started here or in another tab.
  useEffect(() => {
    if (migration?.running && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        try {
          const status = await getS3MigrationStatus();
          setMigration(status);
          if (!status.running && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch {
          // A transient blip shouldn't stop polling; the next tick retries.
        }
      }, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [migration?.running]);

  const update = (field: keyof S3SourceSettings, value: string | boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value } as S3SourceSettings);
  };

  /** Persists the form and returns the row id, or null when the save failed. */
  const handleSave = async (): Promise<string | null> => {
    if (!settings) return null;
    setSaving(true);
    setError('');
    const payload = {
      endpoint_url: settings.endpoint_url,
      access_key_id: settings.access_key_id,
      secret_access_key: settings.secret_access_key,
      bucket_name: settings.bucket_name,
      region: settings.region,
      force_path_style: settings.force_path_style,
    };
    const result = settings.id
      ? await supabase.from('s3_source_settings').update(payload).eq('id', settings.id)
      : await supabase.from('s3_source_settings').insert(payload).select().maybeSingle();

    let savedId: string | null = settings.id || null;
    if (result.error) {
      setError('Could not save the source storage settings. Please try again.');
      savedId = null;
    } else if (!settings.id && result.data) {
      savedId = (result.data as S3SourceSettings).id;
      setSettings({ ...settings, id: savedId });
    }
    setSaving(false);
    return savedId;
  };

  const handleTest = async () => {
    if (!settings) return;
    setError('');
    setNotice('');
    if (!settings.endpoint_url || !settings.access_key_id || !settings.secret_access_key || !settings.bucket_name) {
      setError('Fill in the Endpoint URL, Access Key ID, Secret Access Key and Bucket Name first.');
      return;
    }
    if (!backendConfigured) {
      setError('No backend is configured (VITE_TELEGRAM_BACKEND_URL), so the credentials cannot be verified from the browser.');
      return;
    }
    setTesting(true);
    try {
      const savedId = await handleSave();
      if (!savedId) {
        setTesting(false);
        return;
      }
      const result = await testS3SourceConnection();
      setRemoteStats({ object_count: result.object_count, total_bytes: result.total_bytes });
      setConnected(true);
      const now = new Date().toISOString();
      await supabase.from('s3_source_settings').update({ connected: true, last_connected_at: now }).eq('id', savedId);
      setSettings((prev) => (prev ? { ...prev, id: savedId, connected: true, last_connected_at: now } : prev));
      setNotice(`Connected to ${result.bucket || settings.bucket_name}.`);
    } catch (err) {
      setConnected(false);
      if (settings.id) {
        await supabase.from('s3_source_settings').update({ connected: false }).eq('id', settings.id);
      }
      setError(err instanceof Error ? err.message : 'Could not reach that bucket with these credentials.');
    }
    setTesting(false);
  };

  const handleBrowse = async () => {
    setError('');
    setBrowsing(true);
    try {
      const result = await listS3SourceObjects(prefix, 200);
      setObjects(result.objects);
      setObjectsTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list the bucket.');
    }
    setBrowsing(false);
  };

  const handleStartMigration = async () => {
    setError('');
    setNotice('');
    setStarting(true);
    try {
      await startS3Migration({ prefix, dryRun, deleteSource });
      const status = await getS3MigrationStatus();
      setMigration(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the migration.');
    }
    setStarting(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>;
  }

  const migrationDone = migration && !migration.running && migration.finished_at;

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
              <Server className={`w-6 h-6 ${connected ? 'text-success-400' : 'text-dark-500'}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Other S3-Compatible Storage</h2>
              <p className="text-xs text-dark-500">
                {connected ? `Connected to ${settings?.bucket_name || 'bucket'}` : 'Not connected — configure another bucket to browse or migrate from it'}
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

      {connected && remoteStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-accent-400" />
              <h3 className="text-sm font-semibold text-white">Storage There</h3>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{formatBytes(remoteStats.total_bytes ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileVideo className="w-4 h-4 text-primary-400" />
              <h3 className="text-sm font-semibold text-white">Objects</h3>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{remoteStats.object_count ?? 0}</p>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Server className="w-4 h-4 text-primary-400" /> Storage Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Endpoint URL" value={settings?.endpoint_url || ''} onChange={(v) => update('endpoint_url', v)} placeholder="https://s3.your-provider.com" mono />
          <Field label="Bucket Name" value={settings?.bucket_name || ''} onChange={(v) => update('bucket_name', v)} placeholder="my-old-videos" />
          <Field label="Access Key ID" value={settings?.access_key_id || ''} onChange={(v) => update('access_key_id', v)} placeholder="Access key ID" mono type="password" />
          <Field label="Secret Access Key" value={settings?.secret_access_key || ''} onChange={(v) => update('secret_access_key', v)} placeholder="Secret access key" mono type="password" />
          <Field label="Region" value={settings?.region || 'us-east-1'} onChange={(v) => update('region', v)} placeholder="us-east-1" />
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs text-dark-400">
          <input
            type="checkbox"
            checked={settings?.force_path_style ?? true}
            onChange={(e) => update('force_path_style', e.target.checked)}
            className="h-3.5 w-3.5 rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-primary-500"
          />
          Force path-style addressing (most S3-compatible providers other than AWS need this on)
        </label>
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

      {/* Browser */}
      {connected && (
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Search className="w-4 h-4 text-accent-400" /> Browse Bucket
          </h3>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="Prefix filter (optional), e.g. season-1/"
              className="flex-1 min-w-[12rem] bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 font-mono"
            />
            <button
              onClick={handleBrowse}
              disabled={browsing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {browsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} List Objects
            </button>
          </div>
          {objects.length > 0 && (
            <>
              <p className="text-[11px] text-dark-500 mb-2">Showing {objects.length} of {objectsTotal}</p>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {objects.map((obj) => (
                  <div key={obj.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-800/30 hover:bg-dark-800/60 transition-colors">
                    <FileVideo className="w-4 h-4 text-dark-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate font-mono">{obj.key}</p>
                      <p className="text-[10px] text-dark-500">
                        {formatBytes(obj.size)}
                        {obj.last_modified && ` · ${formatTimeAgo(obj.last_modified)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Migrate into R2 */}
      {connected && (
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-warning-400" /> Migrate Into R2
          </h3>
          <p className="text-xs text-dark-500 mb-4">
            Streams every object from this bucket straight into your main R2 bucket (Settings › R2 Storage), verifying
            each one before removing it from here. Safe to re-run — anything already copied is skipped.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <label className="flex items-center gap-2 text-xs text-dark-400">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-primary-500"
              />
              Dry run (count only, copies nothing)
            </label>
            <label className="flex items-center gap-2 text-xs text-dark-400">
              <input
                type="checkbox"
                checked={deleteSource}
                onChange={(e) => setDeleteSource(e.target.checked)}
                disabled={dryRun}
                className="h-3.5 w-3.5 rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-primary-500 disabled:opacity-50"
              />
              Delete from source once confirmed in R2
            </label>
          </div>
          <button
            onClick={handleStartMigration}
            disabled={starting || Boolean(migration?.running)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-warning-500 hover:bg-warning-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {starting || migration?.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {migration?.running ? 'Migration Running…' : dryRun ? 'Preview Migration' : 'Start Migration'}
          </button>

          {migration && (migration.running || migrationDone) && (
            <div className="mt-4 rounded-lg border border-dark-800 bg-dark-800/30 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-dark-400">
                <span>{migration.running ? 'In progress' : migration.dry_run ? 'Dry run finished' : 'Finished'}</span>
                <span>{migration.scanned} / {migration.total} scanned</span>
              </div>
              <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-warning-500 to-primary-500 rounded-full transition-all"
                  style={{ width: `${migration.total ? Math.min((migration.scanned / migration.total) * 100, 100) : 0}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-dark-400 pt-1">
                <span>Migrated: <span className="text-white">{migration.migrated}</span></span>
                <span>Skipped: <span className="text-white">{migration.skipped}</span></span>
                <span>Deleted: <span className="text-white">{migration.deleted}</span></span>
                <span>Failed: <span className={migration.failed ? 'text-error-400' : 'text-white'}>{migration.failed}</span></span>
              </div>
              <p className="text-[11px] text-dark-500">{formatBytes(migration.bytes)} moved</p>
              {migration.errors.length > 0 && (
                <div className="pt-2 space-y-1">
                  {migration.errors.slice(-5).map((e, i) => (
                    <p key={i} className="text-[10px] text-error-400 font-mono truncate">{e.key}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
