import {
  LayoutDashboard,
  Users,
  DownloadCloud,
  Zap,
  Link2,
  Database,
  Send,
  Settings,
  Video,
  CircleDot,
  Languages,
} from 'lucide-react';
import type { PageKey } from '@/lib/types';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n';

interface SidebarProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  collapsed: boolean;
}

export function Sidebar({ currentPage, onNavigate, collapsed }: SidebarProps) {
  const [queueCount, setQueueCount] = useState(0);
  const [activeGroups, setActiveGroups] = useState(0);
  const { language, toggleLanguage, t } = useLanguage();

  useEffect(() => {
    (async () => {
      const [{ count: dlCount }, { count: gCount }] = await Promise.all([
        supabase.from('downloads').select('*', { count: 'exact', head: true }).in('status', ['queued', 'downloading']),
        supabase.from('groups').select('*', { count: 'exact', head: true }).eq('active', true),
      ]);
      setQueueCount(dlCount ?? 0);
      setActiveGroups(gCount ?? 0);
    })();
  }, [currentPage]);

  const menuItems: { key: PageKey; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { key: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { key: 'groups', label: t('nav.groups'), icon: Users, badge: activeGroups },
    { key: 'downloads', label: t('nav.downloads'), icon: DownloadCloud, badge: queueCount },
    { key: 'autodownload', label: t('nav.autodownload'), icon: Zap },
    { key: 'urllists', label: t('nav.urllists'), icon: Link2 },
    { key: 'r2', label: t('nav.r2'), icon: Database },
    { key: 'telegram', label: t('nav.telegram'), icon: Send },
    { key: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} transition-all duration-300 bg-dark-900 border-r border-dark-800 flex flex-col shrink-0`}>
      <div className="h-16 flex items-center gap-3 px-4 border-b border-dark-800 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shrink-0 glow">
          <Video className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-white tracking-tight">{t('nav.appName')}</p>
            <p className="text-[10px] text-dark-500 font-medium">{t('nav.appTagline')}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                isActive
                  ? 'bg-primary-500/15 text-primary-400'
                  : 'text-dark-400 hover:text-white hover:bg-dark-800'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary-500 rounded-r-full" />}
              <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-primary-400' : ''}`} />
              {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
              {!collapsed && item.badge !== undefined && item.badge > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-primary-500 text-white' : 'bg-dark-700 text-dark-300'
                }`}>
                  {item.badge}
                </span>
              )}
              {collapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary-500 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-dark-800 space-y-1">
        <button
          onClick={toggleLanguage}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-dark-300 hover:text-white hover:bg-dark-800 transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? (language === 'en' ? 'ខ្មែរ' : 'English') : undefined}
        >
          <Languages className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && <span>{language === 'en' ? 'ខ្មែរ' : 'English'}</span>}
        </button>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${collapsed ? 'justify-center' : ''}`}>
          <CircleDot className="w-3.5 h-3.5 text-success-500 animate-pulse shrink-0" />
          {!collapsed && (
            <div>
              <p className="text-[10px] text-dark-500 font-medium">{t('nav.systemStatus')}</p>
              <p className="text-xs text-success-400 font-semibold">{t('nav.online')}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
