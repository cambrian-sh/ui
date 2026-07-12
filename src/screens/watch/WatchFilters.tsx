import { Input, Button } from '@/design-system/components';

export type WatchStatus = 'ok' | 'error' | 'pending';

export const WATCH_STATUSES: { value: WatchStatus; label: string }[] = [
  { value: 'ok', label: 'OK' },
  { value: 'error', label: 'Error' },
  { value: 'pending', label: 'Pending' },
];

export interface WatchFiltersState {
  statuses: WatchStatus[];
  search: string;
}

interface WatchFiltersProps {
  filters: WatchFiltersState;
  onChange: (next: WatchFiltersState) => void;
}

export function WatchFilters({ filters, onChange }: WatchFiltersProps) {
  const toggleStatus = (status: WatchStatus) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: next });
  };

  const reset = () => {
    onChange({ statuses: [], search: '' });
  };

  const hasFilters = filters.statuses.length > 0 || filters.search.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Watch filters"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
    >
      <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
        {WATCH_STATUSES.map((s) => {
          const active = filters.statuses.includes(s.value);
          return (
            <Button
              key={s.value}
              variant={active ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={active}
              onClick={() => toggleStatus(s.value)}
            >
              {s.label}
            </Button>
          );
        })}
      </div>

      <div className="h-6 w-px bg-[var(--border-subtle)]" aria-hidden="true" />

      <Input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search id or streams…"
        aria-label="Search watch configs"
        className="w-56"
      />

      <div className="ml-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={!hasFilters}
          aria-label="Reset filters"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
