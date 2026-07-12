import { Input, Button } from '@/design-system/components';

export interface SkillFiltersState {
  search: string;
}

interface SkillFiltersProps {
  filters: SkillFiltersState;
  onChange: (next: SkillFiltersState) => void;
}

export function SkillFilters({ filters, onChange }: SkillFiltersProps) {
  const reset = () => {
    onChange({ search: '' });
  };

  const hasFilters = filters.search.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Skill filters"
      className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2"
    >
      <Input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search id, description, or scope tags…"
        aria-label="Search skills"
        className="w-80"
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
