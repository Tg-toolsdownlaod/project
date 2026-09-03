import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { DashboardPage } from '@/pages/DashboardPage';
import { GroupsPage } from '@/pages/GroupsPage';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { AutoDownloadPage } from '@/pages/AutoDownloadPage';
import { ForwardsPage } from '@/pages/ForwardsPage';
import { UrlListsPage } from '@/pages/UrlListsPage';
import { R2Page } from '@/pages/R2Page';
import { TelegramPage } from '@/pages/TelegramPage';
import { SettingsPage } from '@/pages/SettingsPage';
import type { PageKey } from '@/lib/types';
import { useLanguage } from '@/lib/i18n';

function App() {
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t } = useLanguage();

  const PAGE_INFO: Record<PageKey, { title: string; subtitle: string }> = {
    dashboard: { title: t('page.dashboard.title'), subtitle: t('page.dashboard.subtitle') },
    groups: { title: t('page.groups.title'), subtitle: t('page.groups.subtitle') },
    downloads: { title: t('page.downloads.title'), subtitle: t('page.downloads.subtitle') },
    autodownload: { title: t('page.autodownload.title'), subtitle: t('page.autodownload.subtitle') },
    forwards: { title: t('page.forwards.title'), subtitle: t('page.forwards.subtitle') },
    urllists: { title: t('page.urllists.title'), subtitle: t('page.urllists.subtitle') },
    r2: { title: t('page.r2.title'), subtitle: t('page.r2.subtitle') },
    telegram: { title: t('page.telegram.title'), subtitle: t('page.telegram.subtitle') },
    settings: { title: t('page.settings.title'), subtitle: t('page.settings.subtitle') },
  };

  const info = PAGE_INFO[currentPage];

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage />;
      case 'groups': return <GroupsPage />;
      case 'downloads': return <DownloadsPage />;
      case 'autodownload': return <AutoDownloadPage />;
      case 'forwards': return <ForwardsPage />;
      case 'urllists': return <UrlListsPage />;
      case 'r2': return <R2Page />;
      case 'telegram': return <TelegramPage />;
      case 'settings': return <SettingsPage />;
    }
  };

  return (
    <div className="flex h-screen bg-dark-950 text-white overflow-hidden">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} collapsed={sidebarCollapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={info.title}
          subtitle={info.subtitle}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
