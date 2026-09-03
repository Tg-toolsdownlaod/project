import { useEffect, useState } from 'react';
import { Send, Zap } from 'lucide-react';

import { Tabs } from '@/components/Tabs';
import { AutoDownloadPage } from '@/pages/AutoDownloadPage';
import { ForwardsPage } from '@/pages/ForwardsPage';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n';

/**
 * Auto-download rules and forward jobs were two sidebar entries that did the
 * same kind of thing — "keep doing this for me". They are one page with two
 * tabs now.
 */
export function AutomationPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'rules' | 'forwards'>('rules');
  const [counts, setCounts] = useState({ rules: 0, forwards: 0 });

  useEffect(() => {
    (async () => {
      const [rules, forwards] = await Promise.all([
        supabase.from('auto_download_rules').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('forward_jobs').select('*', { count: 'exact', head: true }).in('status', ['queued', 'running']),
      ]);
      setCounts({ rules: rules.count ?? 0, forwards: forwards.count ?? 0 });
    })();
  }, [tab]);

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={(key) => setTab(key as 'rules' | 'forwards')}
        tabs={[
          { key: 'rules', label: t('tab.rules'), icon: <Zap className="h-3.5 w-3.5" />, badge: counts.rules },
          { key: 'forwards', label: t('tab.forwards'), icon: <Send className="h-3.5 w-3.5" />, badge: counts.forwards },
        ]}
      />
      {tab === 'rules' ? <AutoDownloadPage /> : <ForwardsPage />}
    </div>
  );
}
