import { Menu, Search, Bell, Download } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  title: string;
  subtitle: string;
}

export function Header({ onToggleSidebar, title, subtitle }: HeaderProps) {
  return (
    <header className="h-16 glass border-b border-dark-800 flex items-center justify-between px-6 shrink-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">{title}</h1>
          <p className="text-xs text-dark-500">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 bg-dark-800/50 rounded-lg px-3 py-2 w-64 border border-dark-700/50">
          <Search className="w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent text-sm text-white placeholder-dark-500 outline-none flex-1"
          />
          <kbd className="text-[10px] text-dark-500 bg-dark-700 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </div>

        <button className="relative p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error-500 rounded-full" />
        </button>

        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shrink-0">
          <Download className="w-4 h-4 text-white" />
        </div>
      </div>
    </header>
  );
}
