import { Crown } from 'lucide-react';

import { useLanguage } from '@/lib/i18n';
import type { Capability } from '@/lib/types';

/**
 * Wraps a Settings tab that only makes sense for a Pro subscriber (their own
 * Telegram account, their own storage) -- a Basic subscriber uses the app's
 * shared userbot and shared storage transparently, so there's nothing here
 * for them to configure at all, not just something to hide.
 */
export function ProGate({ capability, children }: { capability: Capability; children: React.ReactNode }) {
  const { t } = useLanguage();
  if (capability === 'pro') return <>{children}</>;

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-dark-700 bg-dark-900/40 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-500/10">
        <Crown className="h-6 w-6 text-warning-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{t('gate.proOnly.title')}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-dark-500">{t('gate.proOnly.body')}</p>
      </div>
    </div>
  );
}
