/* Filter bar for the Sessions console.
 *
 * PRD-06 §4: "All sessions, filterable by state, time, agent, free text."
 * Renders a compact horizontal bar with four controls + a reset button.
 */
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
} from '@/design-system/components';
import type { SessionState } from '@/ipc/types';

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

export interface SessionFiltersState {
  states: SessionState[];
  timeRange: TimeRange;
  agents: string[];
  search: string;
}

interface SessionFiltersProps {
  filters: SessionFiltersState;
  onChange: (next: SessionFiltersState) => void;
  availableAgents: string[];
}

const ALL_STATES = '__all__';

export function SessionFilters({ filters, onChange, availableAgents }: SessionFiltersProps) {
  const toggleState = (state: SessionState) => {
    const next = filters.states.includes(state)
      ? filters.states.filter((s) => s !== state)
      : [...filters.states, state];
    onChange({ ...filters, states: next });
  };

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
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
    >
      <div className="flex items-center gap-1" role="group" aria-label="Filter by state">
        {SESSION_STATES.map((s) => {
          const active = filters.states.includes(s.value);
          return (
            <Button
              key={s.value}
              variant={active ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={active}
              onClick={() => toggleState(s.value)}
            >
              {s.label}
            </Button>
          );
        })}
      </div>

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

      <Select
        value={ALL_STATES}
        onValueChange={() => {
          /* placeholder — multi-agent select is a follow-on */
        }}
        disabled={availableAgents.length === 0}
      >
        <SelectTrigger className="w-40" aria-label="Filter by agent">
          <SelectValue
            placeholder={
              availableAgents.length === 0
                ? 'No agents'
                : `All agents (${availableAgents.length})`
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATES}>All agents</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search title or id…"
        aria-label="Search sessions"
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
