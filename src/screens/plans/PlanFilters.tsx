
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
  ToggleGroup,
  ToggleGroupItem,
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
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-[var(--page-gutter)] pb-3"
    >
      <ToggleGroup
        type="multiple"
        value={filters.statuses}
        onValueChange={(next) => onChange({ ...filters, statuses: next as PlanStatus[] })}
        aria-label="Filter by status"
      >
        {PLAN_STATUS_OPTIONS.map((s) => (
          <ToggleGroupItem key={s.value} value={s.value}>
            {s.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="h-6 w-px bg-[var(--border-subtle)]" aria-hidden="true" />

      <Select
        value={filters.session ?? ALL_SESSIONS}
        onValueChange={(v) =>
          onChange({ ...filters, session: v === ALL_SESSIONS ? null : v })
        }
        disabled={availableSessions.length === 0}
      >
        <SelectTrigger className="w-48" aria-label="Filter by task">
          <SelectValue
            placeholder={
              availableSessions.length === 0
                ? 'No tasks'
                : filters.session
                ? availableSessions.find((s) => s.id === filters.session)?.title ??
                  filters.session
                : `All tasks (${availableSessions.length})`
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SESSIONS}>All tasks</SelectItem>
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

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-[12px] text-[var(--fg-muted)] 2xl:inline">
          Press 1–9 to open a plan
        </span>
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
