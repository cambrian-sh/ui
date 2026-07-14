export function relativeTime(iso: string, now: Date = new Date()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diffMs = now.getTime() - then;
  if (diffMs < 0) return 'just now';
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMon = Math.round(diffDay / 30);
  if (diffMon < 12) return `${diffMon}mo ago`;
  const diffYr = Math.round(diffMon / 12);
  return `${diffYr}y ago`;
}
