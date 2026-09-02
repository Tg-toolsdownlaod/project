export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatSpeed(mbps: number): string {
  if (mbps <= 0) return '—';
  return `${mbps.toFixed(1)} MB/s`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimeAgo(date: string | null): string {
  if (!date) return '—';
  const now = new Date();
  const past = new Date(date);
  const diff = now.getTime() - past.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'text-dark-400 bg-dark-700',
    queued: 'text-accent-400 bg-accent-500/10',
    downloading: 'text-primary-400 bg-primary-500/10',
    completed: 'text-success-400 bg-success-500/10',
    failed: 'text-error-400 bg-error-500/10',
    skipped: 'text-dark-400 bg-dark-700',
    paused: 'text-warning-400 bg-warning-500/10',
    cancelled: 'text-dark-400 bg-dark-700',
  };
  return colors[status] || colors.pending;
}

export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    pending: '○',
    queued: '◐',
    downloading: '◉',
    completed: '✓',
    failed: '✕',
    skipped: '⊘',
    paused: '⏸',
    cancelled: '⏹',
  };
  return icons[status] || icons.pending;
}
