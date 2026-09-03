import { useState } from 'react';

import { Header } from '@/components/Header';
import { SetupNotice } from '@/components/SetupNotice';
import { Sidebar } from '@/components/Sidebar';
import { AutomationPage } from '@/pages/AutomationPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { GroupsPage } from '@/pages/GroupsPage';
import { GuidePage } from '@/pages/GuidePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UrlListsPage } from '@/pages/UrlListsPage';
import { useLanguage } from '@/lib/i18n';
import { supabaseConfigured } from '@/lib/supabase';
import type { PageKey } from '@/lib/types';

function App() {
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t } = useLanguage();

  const PAGE_INFO: Record<PageKey, { title: string; subtitle: string }> = {
    dashboard: { title: t('page.dashboard.title'), subtitle: t('page.dashboard.subtitle') },
    groups: { title: t('page.groups.title'), subtitle: t('page.groups.subtitle') },
    downloads: { title: t('page.downloads.title'), subtitle: t('page.downloads.subtitle') },
    automation: { title: t('page.automation.title'), subtitle: t('page.automation.subtitle') },
    urllists: { title: t('page.urllists.title'), subtitle: t('page.urllists.subtitle') },
    settings: { title: t('page.settings.title'), subtitle: t('page.settings.subtitle') },
    guide: { title: t('page.guide.title'), subtitle: t('page.guide.subtitle') },
  };

  const info = PAGE_INFO[currentPage];

  // Every page reads from the database, so without credentials the app can
  // only explain itself.
  if (!supabaseConfigured) return <SetupNotice />;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'groups':
        return <GroupsPage />;
      case 'downloads':
        return <DownloadsPage />;
      case 'automation':
        return <AutomationPage />;
      case 'urllists':
        return <UrlListsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'guide':
        return <GuidePage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-dark-950 text-white">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} collapsed={sidebarCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={info.title}
          subtitle={info.subtitle}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
