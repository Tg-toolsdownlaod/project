import { useEffect, useState } from 'react';
import {
  Settings,
  Save,
  Loader2,
  Download,
  Gauge,
  Bell,
  RefreshCw,
  Cloud,
  Folder,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { DownloadSettings } from '@/lib/types';

export function SettingsPage() {
  const [settings, setSettings] = useState<DownloadSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('download_settings').select('*').maybeSingle();
      if (data) {
        setSettings(data as DownloadSettings);
      } else {
        setSettings({
          id: '', concurrent_downloads: 3, speed_limit_mbps: 0, auto_start: true,
          quality_pref: 'highest', notify_on_complete: true, retry_on_fail: true,
          max_retries: 3, r2_folder_pattern: '{group}/{topic}/EP{ep}', auto_r2_upload: true,
          created_at: '', updated_at: '',
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    if (settings.id) {
      await supabase.from('download_settings').update({
        concurrent_downloads: settings.concurrent_downloads,
        speed_limit_mbps: settings.speed_limit_mbps,
        auto_start: settings.auto_start,
        quality_pref: settings.quality_pref,
        notify_on_complete: settings.notify_on_complete,
        retry_on_fail: settings.retry_on_fail,
        max_retries: settings.max_retries,
        r2_folder_pattern: settings.r2_folder_pattern,
        auto_r2_upload: settings.auto_r2_upload,
      }).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('download_settings').insert({
        concurrent_downloads: settings.concurrent_downloads,
        speed_limit_mbps: settings.speed_limit_mbps,
        auto_start: settings.auto_start,
        quality_pref: settings.quality_pref,
        notify_on_complete: settings.notify_on_complete,
        retry_on_fail: settings.retry_on_fail,
        max_retries: settings.max_retries,
        r2_folder_pattern: settings.r2_folder_pattern,
        auto_r2_upload: settings.auto_r2_upload,
      }).select().single();
      if (data) setSettings({ ...settings, id: (data as DownloadSettings).id });
    }
    setSaving(false);
  };

  const update = (field: keyof DownloadSettings, value: string | number | boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl">
      {/* Download Performance */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary-400" /> Download Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Concurrent Downloads</label>
            <input
              type="number"
              min={1}
              max={10}
              value={settings?.concurrent_downloads ?? 3}
              onChange={(e) => update('concurrent_downloads', parseInt(e.target.value) || 1)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors"
            />
            <p className="text-[10px] text-dark-600 mt-1">Max simultaneous downloads (1-10)</p>
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Speed Limit (MB/s)</label>
            <input
              type="number"
              min={0}
              value={settings?.speed_limit_mbps ?? 0}
              onChange={(e) => update('speed_limit_mbps', parseInt(e.target.value) || 0)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors"
            />
            <p className="text-[10px] text-dark-600 mt-1">0 = unlimited</p>
          </div>
        </div>
      </div>

      {/* Quality & Auto-Start */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Download className="w-4 h-4 text-accent-400" /> Download Behavior
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1.5">Quality Preference</label>
            <select
              value={settings?.quality_pref ?? 'highest'}
              onChange={(e) => update('quality_pref', e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors"
            >
              <option value="highest">Highest Available</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
              <option value="lowest">Lowest (Fastest)</option>
            </select>
          </div>

          <Toggle
            label="Auto-start downloads"
            description="Automatically begin downloading when episodes are queued"
            value={settings?.auto_start ?? true}
            onChange={(v) => update('auto_start', v)}
          />

          <Toggle
            label="Auto-upload to R2"
            description="Upload completed downloads to Cloudflare R2 automatically"
            value={settings?.auto_r2_upload ?? true}
            onChange={(v) => update('auto_r2_upload', v)}
            icon={Cloud}
          />

          <Toggle
            label="Notify on completion"
            description="Get a notification when downloads finish"
            value={settings?.notify_on_complete ?? true}
            onChange={(v) => update('notify_on_complete', v)}
            icon={Bell}
          />

          <Toggle
            label="Retry on failure"
            description="Automatically retry failed downloads"
            value={settings?.retry_on_fail ?? true}
            onChange={(v) => update('retry_on_fail', v)}
            icon={RefreshCw}
          />

          {settings?.retry_on_fail && (
            <div className="pl-1">
              <label className="text-xs text-dark-400 font-medium block mb-1.5">Max Retries</label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings?.max_retries ?? 3}
                onChange={(e) => update('max_retries', parseInt(e.target.value) || 1)}
                className="w-32 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors"
              />
            </div>
          )}
        </div>
      </div>

      {/* R2 Folder Pattern */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Folder className="w-4 h-4 text-warning-400" /> R2 Folder Structure
        </h3>
        <div>
          <label className="text-xs text-dark-400 font-medium block mb-1.5">Folder Pattern</label>
          <input
            type="text"
            value={settings?.r2_folder_pattern ?? ''}
            onChange={(e) => update('r2_folder_pattern', e.target.value)}
            placeholder="{group}/{topic}/EP{ep}"
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-dark-600 outline-none focus:border-primary-500 transition-colors font-mono"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {['{group}', '{topic}', '{ep}', '{quality}', '{date}'].map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-1 rounded-full bg-dark-800 text-dark-400 font-mono">{tag}</span>
            ))}
          </div>
          <p className="text-[10px] text-dark-600 mt-2">Available variables: group, topic, ep, quality, date</p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, description, value, onChange, icon: Icon }: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: typeof Settings;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-dark-800/30">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="w-4 h-4 text-dark-500" />}
        <div>
          <p className="text-sm text-white font-medium">{label}</p>
          <p className="text-xs text-dark-500">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${value ? 'bg-primary-500' : 'bg-dark-700'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
