import type { ReactNode } from 'react';

export interface TabDefinition {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

/**
 * The one tab strip the app uses, so Automation and Settings look identical.
 */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDefinition[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-dark-800 bg-dark-900/60 p-1">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-primary-500/15 text-primary-400'
                : 'text-dark-400 hover:bg-dark-800 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive ? 'bg-primary-500 text-white' : 'bg-dark-800 text-dark-400'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
