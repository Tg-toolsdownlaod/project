import { useEffect, useState } from 'react';
import {
  DownloadCloud,
  CheckCircle2,
  XCircle,
  HardDrive,
  TrendingUp,
  Activity,
  Zap,
  Clock,
  Film,
  Send,
  User,
  AtSign,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Download, Episode, Group, TelegramSettings } from '@/lib/types';
import { formatBytes, formatSpeed, formatTimeAgo, getStatusColor } from '@/lib/utils';

interface Stats {
  totalDownloads: number;
  completed: number;
  failed: number;
  active: number;
  totalStorage: number;
  totalEpisodes: number;
  groups: number;
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalDownloads: 0,
    completed: 0,
    failed: 0,
    active: 0,
    totalStorage: 0,
    totalEpisodes: 0,
    groups: 0,
  });
  const [recentDownloads, setRecentDownloads] = useState<(Download & { episode?: Episode })[]>([]);
  const [activeGroups, setActiveGroups] = useState<(Group & { topic_count?: number })[]>([]);
  const [tgSettings, setTgSettings] = useState<TelegramSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [dlRes, epRes, groupRes, recentRes, groupsRes, tgRes] = await Promise.all([
        supabase.from('downloads').select('*'),
        supabase.from('episodes').select('*'),
        supabase.from('groups').select('*', { count: 'exact' }),
        supabase.from('downloads').select('*, episode:episodes(*)').order('created_at', { ascending: false }).limit(8),
        supabase.from('groups').select('*').eq('active', true).order('updated_at', { ascending: false }).limit(5),
        supabase.from('telegram_settings').select('*').maybeSingle(),
      ]);

      const downloads = dlRes.data as Download[] || [];
      const episodes = epRes.data as Episode[] || [];

      setStats({
        totalDownloads: downloads.length,
        completed: downloads.filter((d) => d.status === 'completed').length,
        failed: downloads.filter((d) => d.status === 'failed').length,
        active: downloads.filter((d) => d.status === 'downloading' || d.status === 'queued').length,
        totalStorage: episodes.reduce((sum, e) => sum + (e.file_size || 0), 0),
        totalEpisodes: episodes.length,
        groups: groupRes.count ?? 0,
      });

      setRecentDownloads((recentRes.data as (Download & { episode?: Episode })[]) || []);
      setActiveGroups((groupsRes.data as (Group & { topic_count?: number })[]) || []);
      setTgSettings((tgRes.data as TelegramSettings) || null);
      setLoading(false);
    })();
  }, []);

  const statCards = [
    { label: 'Total Downloads', value: stats.totalDownloads, icon: DownloadCloud, color: 'primary', change: '+12%' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'success', change: '+8%' },
    { label: 'Failed', value: stats.failed, icon: XCircle, color: 'error', change: '-2%' },
    { label: 'Active Now', value: stats.active, icon: Activity, color: 'accent', change: 'live' },
  ];

  const colorMap: Record<string, string> = {
    primary: 'from-primary-500/20 to-primary-500/5 text-primary-400 border-primary-500/20',
    success: 'from-success-500/20 to-success-500/5 text-success-400 border-success-500/20',
    error: 'from-error-500/20 to-error-500/5 text-error-400 border-error-500/20',
    accent: 'from-accent-500/20 to-accent-500/5 text-accent-400 border-accent-500/20',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${colorMap[stat.color]} p-5 card-hover`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg bg-dark-900/40`}>
                  <Icon className="w-5 h-5" />
                </div>
                {stat.change !== 'live' && (
                  <span className="text-xs text-dark-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> {stat.change}
                  </span>
                )}
                {stat.change === 'live' && (
                  <span className="text-xs text-accent-400 flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse" /> live
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold text-white tabular-nums">
                {loading ? '—' : stat.value}
              </p>
              <p className="text-xs text-dark-400 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Userbot + System Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          tgSettings?.connected
            ? 'border-success-500/30 bg-gradient-to-br from-success-500/10 to-dark-900'
            : 'border-dark-800 bg-dark-900/60'
        }`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tgSettings?.connected ? 'bg-success-500/20' : 'bg-dark-800'}`}>
            <Send className={`w-5 h-5 ${tgSettings?.connected ? 'text-success-400' : 'text-dark-500'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-dark-500">Userbot</p>
            <p className="text-sm font-bold text-white truncate">
              {tgSettings?.connected
                ? (tgSettings.account_username
                    ? '@' + tgSettings.account_username
                    : [tgSettings.account_first_name, tgSettings.account_last_name].filter(Boolean).join(' ') || tgSettings.phone || 'Connected')
                : 'Offline'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-dark-500">Account ID</p>
            <p className="text-sm font-bold text-white font-mono truncate">
              {tgSettings?.account_user_id || (tgSettings?.phone || '—')}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center shrink-0">
            <AtSign className="w-5 h-5 text-accent-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-dark-500">Username</p>
            <p className="text-sm font-bold text-white truncate">
              {tgSettings?.account_username ? '@' + tgSettings.account_username : '—'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-warning-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-dark-500">Last Connected</p>
            <p className="text-sm font-bold text-white truncate">
              {tgSettings?.connected ? formatTimeAgo(tgSettings.last_connected_at) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Storage + Episodes overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-dark-800 bg-dark-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Recent Downloads</h3>
              <p className="text-xs text-dark-500">Latest download activity</p>
            </div>
            <Activity className="w-4 h-4 text-dark-500" />
          </div>

          {recentDownloads.length === 0 && !loading ? (
            <div className="text-center py-12">
              <DownloadCloud className="w-10 h-10 text-dark-700 mx-auto mb-3" />
              <p className="text-sm text-dark-500">No downloads yet</p>
              <p className="text-xs text-dark-600 mt-1">Add a group and start downloading episodes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDownloads.map((dl) => (
                <div
                  key={dl.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/40 hover:bg-dark-800/70 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-dark-700/50 flex items-center justify-center shrink-0">
                    <Film className="w-4 h-4 text-dark-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">
                      {dl.episode?.title || dl.episode?.file_name || `Episode ${dl.episode?.ep_number ?? '?'}`}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(dl.status)}`}>
                        {dl.status}
                      </span>
                      <span className="text-[10px] text-dark-500">
                        {dl.total_bytes > 0 ? formatBytes(dl.downloaded_bytes) + ' / ' + formatBytes(dl.total_bytes) : formatTimeAgo(dl.started_at)}
                      </span>
                    </div>
                  </div>
                  {dl.status === 'downloading' && (
                    <div className="w-20 shrink-0">
                      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${dl.progress}%` }} />
                      </div>
                      <p className="text-[10px] text-primary-400 mt-1 text-right tabular-nums">{dl.progress}%</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Storage Card */}
        <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-semibold text-white">R2 Storage</h3>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-dark-400">Used Space</span>
                <span className="text-white font-medium tabular-nums">{formatBytes(stats.totalStorage)}</span>
              </div>
              <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((stats.totalStorage / (50 * 1024 * 1024 * 1024)) * 100, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-dark-500 mt-1">{formatBytes(stats.totalStorage)} of 50 GB</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-dark-800/40 rounded-lg p-3">
                <Film className="w-4 h-4 text-primary-400 mb-2" />
                <p className="text-xl font-bold text-white tabular-nums">{stats.totalEpisodes}</p>
                <p className="text-[10px] text-dark-500">Episodes</p>
              </div>
              <div className="bg-dark-800/40 rounded-lg p-3">
                <Zap className="w-4 h-4 text-warning-400 mb-2" />
                <p className="text-xl font-bold text-white tabular-nums">{stats.groups}</p>
                <p className="text-[10px] text-dark-500">Groups</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Groups */}
      <div className="rounded-xl border border-dark-800 bg-dark-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Active Groups</h3>
            <p className="text-xs text-dark-500">Monitored Telegram groups</p>
          </div>
        </div>
        {activeGroups.length === 0 && !loading ? (
          <div className="text-center py-8">
            <p className="text-sm text-dark-500">No active groups yet</p>
            <p className="text-xs text-dark-600 mt-1">Go to Groups & Topics to add one</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeGroups.map((group) => (
              <div key={group.id} className="bg-dark-800/40 rounded-lg p-4 border border-dark-700/30 card-hover">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500/30 to-accent-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{group.title.charAt(0).toUpperCase()}</span>
                  </div>
                  {group.is_forum && (
                    <span className="text-[9px] text-accent-400 bg-accent-500/10 px-2 py-0.5 rounded-full font-medium">FORUM</span>
                  )}
                </div>
                <p className="text-sm text-white font-medium truncate">{group.title}</p>
                <p className="text-xs text-dark-500 truncate">{group.username ? '@' + group.username : group.chat_id}</p>
                <div className="flex items-center gap-3 mt-3 text-xs">
                  <span className="text-dark-400 flex items-center gap-1">
                    <Film className="w-3 h-3" /> {group.total_episodes}
                  </span>
                  <span className="text-success-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {group.downloaded_episodes}
                  </span>
                  <span className="text-dark-500 flex items-center gap-1 ml-auto">
                    <Clock className="w-3 h-3" /> {formatTimeAgo(group.last_scanned_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
