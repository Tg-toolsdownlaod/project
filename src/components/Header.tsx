import { Menu } from 'lucide-react';

import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { TelegramGlyph } from '@/components/Brand';
import { useConnectionStatus } from '@/lib/hooks';
import { useLanguage } from '@/lib/i18n';

interface HeaderProps {
  onToggleSidebar: () => void;
  title: string;
  subtitle: string;
}

export function Header({ onToggleSidebar, title, subtitle }: HeaderProps) {
  const status = useConnectionStatus();
  const { t } = useLanguage();

  return (
    <header className="glass z-10 flex h-16 shrink-0 items-center justify-between border-b border-dark-800 px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-dark-400 transition-colors hover:bg-dark-800 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-white">{title}</h1>
          <p className="truncate text-xs text-dark-500">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ConnectionPill
          label={t('status.telegram')}
          ok={status.telegram}
          icon={<TelegramGlyph className="h-3 w-3" />}
        />
        <ConnectionPill label={t('status.r2')} ok={status.r2} />
        <ThemeSwitcher />
      </div>
    </header>
  );
}

/**
 * A small honest status chip. Grey while unknown so it never claims a
 * connection the app has not actually verified.
 */
function ConnectionPill({
  label,
  ok,
  icon,
}: {
  label: string;
  ok: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <span
      title={label}
      className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium sm:flex ${
        ok
          ? 'border-success-500/25 bg-success-500/10 text-success-400'
          : 'border-dark-700/60 bg-dark-800/50 text-dark-500'
      }`}
    >
      {icon ?? <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-success-400' : 'bg-dark-600'}`} />}
      <span className="hidden md:inline">{label}</span>
    </span>
  );
}
