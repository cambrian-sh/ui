export function formatRelativeTime(iso: string): string {
  if (!iso) return 'Unknown';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'Unknown';

  const now = Date.now();
  const diffMs = now - then;

  if (diffMs < 0) return 'Just now';
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}
