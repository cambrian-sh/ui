import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
  Button,
} from '@/design-system/components';
import type { SessionState, SessionSummary } from '@/ipc/types';
import { sessionStateCounts } from '@/lib/sessions';

export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

export const SESSION_STATES: { value: SessionState; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'dormant', label: 'Dormant' },
  { value: 'completed', label: 'Completed' },
];

export interface TaskFiltersState {
  states: SessionState[];
  timeRange: TimeRange;
  agents: string[];
  search: string;
}

interface SessionFiltersProps {
  filters: TaskFiltersState;
  onChange: (next: TaskFiltersState) => void;
  availableAgents: string[];
  /** Unfiltered sessions, so the counts describe what each filter would show. */
  sessions: readonly SessionSummary[];
}

const ALL_AGENTS = '__all__';

export function TaskFilters({
  filters,
  onChange,
  availableAgents,
  sessions,
}: SessionFiltersProps) {
  const counts = sessionStateCounts(sessions);

  const reset = () => {
    onChange({ states: [], timeRange: 'all', agents: [], search: '' });
  };

  const hasFilters =
    filters.states.length > 0 ||
    filters.timeRange !== 'all' ||
    filters.agents.length > 0 ||
    filters.search.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Session filters"
      className="flex flex-wrap items-center gap-2 px-[22px] py-2.5 shadow-[inset_0_-1px_0_var(--border-subtle)]"
    >
      {/* The count is part of the label, so the filter says how much it will
          show before it is pressed — "Paused 1" rather than "Paused", pressed,
          then one row. */}
      <ToggleGroup
        type="multiple"
        value={filters.states}
        onValueChange={(next) => onChange({ ...filters, states: next as SessionState[] })}
        aria-label="Filter by state"
      >
        {SESSION_STATES.map((s) => (
          <ToggleGroupItem key={s.value} value={s.value} aria-label={s.label}>
            {s.label}
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">
              {counts[s.value] ?? 0}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="h-6 w-px bg-[var(--border-subtle)]" aria-hidden="true" />

      <Select
        value={filters.timeRange}
        onValueChange={(v) => onChange({ ...filters, timeRange: v as TimeRange })}
      >
        <SelectTrigger className="w-40" aria-label="Filter by time">
          <SelectValue placeholder="Time range" />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* This used to be a select whose onValueChange was empty, so choosing an
          agent narrowed nothing at all. */}
      <Select
        value={filters.agents[0] ?? ALL_AGENTS}
        onValueChange={(v) =>
          onChange({ ...filters, agents: v === ALL_AGENTS ? [] : [v] })
        }
        disabled={availableAgents.length === 0}
      >
        <SelectTrigger className="w-40" aria-label="Filter by agent">
          <SelectValue
            placeholder={availableAgents.length === 0 ? 'No agents' : 'All agents'}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_AGENTS}>All agents</SelectItem>
          {availableAgents.map((agent) => (
            <SelectItem key={agent} value={agent}>
              {agent}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search subject or id…"
        aria-label="Search tasks"
        className="w-[260px]"
      />

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-[11.5px] text-[var(--fg-muted)] lg:inline">
          Sorted by what needs you, then by last activity
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
