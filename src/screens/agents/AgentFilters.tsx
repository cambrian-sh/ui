
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button } from '@/design-system/components';
import type { AgentTrait } from './AgentTraitPill';

export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

export const AGENT_TRAITS: { value: AgentTrait; label: string }[] = [
  { value: 'Cognitive', label: 'Cognitive' },
  { value: 'Model', label: 'Model' },
  { value: 'Daemon', label: 'Daemon' },
];

export interface AgentFiltersState {
  traits: AgentTrait[];
  timeRange: TimeRange;
  search: string;
}

interface AgentFiltersProps {
  filters: AgentFiltersState;
  onChange: (next: AgentFiltersState) => void;
}

export function AgentFilters({ filters, onChange }: AgentFiltersProps) {
  const toggleTrait = (trait: AgentTrait) => {
    const next = filters.traits.includes(trait)
      ? filters.traits.filter((t) => t !== trait)
      : [...filters.traits, trait];
    onChange({ ...filters, traits: next });
  };

  const reset = () => {
    onChange({ traits: [], timeRange: 'all', search: '' });
  };

  const hasFilters =
    filters.traits.length > 0 || filters.timeRange !== 'all' || filters.search.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Agent filters"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
    >
      <div className="flex items-center gap-1" role="group" aria-label="Filter by trait">
        {AGENT_TRAITS.map((t) => {
          const active = filters.traits.includes(t.value);
          return (
            <Button
              key={t.value}
              variant={active ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={active}
              onClick={() => toggleTrait(t.value)}
            >
              {t.label}
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

      <Input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search id or scope…"
        aria-label="Search agents"
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
