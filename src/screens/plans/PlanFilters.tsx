
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
} from '@/design-system/components';
import type { PlanStatus } from '@/ipc/types';

export const PLAN_STATUS_OPTIONS: { value: PlanStatus; label: string }[] = [
  { value: 'forming', label: 'Forming' },
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export interface PlanFiltersState {
  statuses: PlanStatus[];
  session: string | null;
  search: string;
}

interface SessionOption {
  id: string;
  title: string;
}

interface PlanFiltersProps {
  filters: PlanFiltersState;
  onChange: (next: PlanFiltersState) => void;
  availableSessions: SessionOption[];
}

const ALL_SESSIONS = '__all__';

export function PlanFilters({
  filters,
  onChange,
  availableSessions,
}: PlanFiltersProps) {
  const reset = () => {
    onChange({ statuses: [], session: null, search: '' });
  };

  const hasFilters =
    filters.statuses.length > 0 || filters.session !== null || filters.search.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Plan filters"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
    >
      <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
        {PLAN_STATUS_OPTIONS.map((s) => {
          const active = filters.statuses.includes(s.value);
          return (
            <Button
              key={s.value}
              variant={active ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={active}
              onClick={() => {
                const next = active
                  ? filters.statuses.filter((x) => x !== s.value)
                  : [...filters.statuses, s.value];
                onChange({ ...filters, statuses: next });
              }}
            >
              {s.label}
            </Button>
          );
        })}
      </div>

      <div className="h-6 w-px bg-[var(--border-subtle)]" aria-hidden="true" />

      <Select
        value={filters.session ?? ALL_SESSIONS}
        onValueChange={(v) =>
          onChange({ ...filters, session: v === ALL_SESSIONS ? null : v })
        }
        disabled={availableSessions.length === 0}
      >
        <SelectTrigger className="w-48" aria-label="Filter by session">
          <SelectValue
            placeholder={
              availableSessions.length === 0
                ? 'No sessions'
                : filters.session
                ? availableSessions.find((s) => s.id === filters.session)?.title ??
                  filters.session
                : `All sessions (${availableSessions.length})`
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SESSIONS}>All sessions</SelectItem>
          {availableSessions.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search subject, plan id, agent…"
        aria-label="Search plans"
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
