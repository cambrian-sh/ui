import { Input, Button } from '@/design-system/components';

export interface ScopeFiltersState {
  search: string;
}

interface ScopeFiltersProps {
  filters: ScopeFiltersState;
  onChange: (next: ScopeFiltersState) => void;
}

export function ScopeFilters({ filters, onChange }: ScopeFiltersProps) {
  const reset = () => {
    onChange({ search: '' });
  };

  const hasFilters = filters.search.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Scope filters"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
    >
      <Input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search agent id…"
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
