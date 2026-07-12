import { Input, Button } from '@/design-system/components';

export type ConnectionFilter = 'all' | 'Up' | 'Reconnecting' | 'Down';

export const CONNECTION_STATES: { value: ConnectionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Up', label: 'Up' },
  { value: 'Reconnecting', label: 'Reconnecting' },
  { value: 'Down', label: 'Down' },
];

export interface MCPFiltersState {
  connectionState: ConnectionFilter;
  search: string;
}

interface MCPFiltersProps {
  filters: MCPFiltersState;
  onChange: (next: MCPFiltersState) => void;
}

export function MCPFilters({ filters, onChange }: MCPFiltersProps) {
  const reset = () => {
    onChange({ connectionState: 'all', search: '' });
  };

  const hasFilters = filters.connectionState !== 'all' || filters.search.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="MCP server filters"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
    >
      <div className="flex items-center gap-1" role="group" aria-label="Filter by connection state">
        {CONNECTION_STATES.map((s) => {
          const active = filters.connectionState === s.value;
          return (
            <Button
              key={s.value}
              variant={active ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={active}
              onClick={() => onChange({ ...filters, connectionState: s.value })}
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
        placeholder="Search id…"
        aria-label="Search MCP servers"
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
