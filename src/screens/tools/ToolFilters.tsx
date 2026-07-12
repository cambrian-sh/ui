import { Input, Button } from '@/design-system/components';

export interface ToolFiltersState {
  dangerOnly: boolean;
  search: string;
}

interface ToolFiltersProps {
  filters: ToolFiltersState;
  onChange: (next: ToolFiltersState) => void;
}

export function ToolFilters({ filters, onChange }: ToolFiltersProps) {
  const toggleDanger = () => {
    onChange({ ...filters, dangerOnly: !filters.dangerOnly });
  };

  const reset = () => {
    onChange({ dangerOnly: false, search: '' });
  };

  const hasFilters = filters.dangerOnly || filters.search.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Tool filters"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
    >
      <div className="flex items-center gap-1" role="group" aria-label="Filter by danger">
        <Button
          variant={filters.dangerOnly ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={filters.dangerOnly}
          onClick={toggleDanger}
        >
          Danger only
        </Button>
      </div>

      <div className="h-6 w-px bg-[var(--border-subtle)]" aria-hidden="true" />

      <Input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search id or description…"
        aria-label="Search tools"
        className="w-64"
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
