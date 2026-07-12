import { cn } from '@/design-system/lib/utils';
import { relativeTime } from '@/lib/relativeTime';
import type { SkillSummary } from '@/ipc/types';

interface SkillListRowProps {
  skill: SkillSummary;
  selected: boolean;
  onClick: () => void;
}

export function SkillListRow({ skill, selected, onClick }: SkillListRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2 text-left transition-colors',
        'hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
        selected && 'bg-[var(--list-row-bg-selected)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--fg-primary)]">{skill.id}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
          {skill.scope_tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right text-xs text-[var(--fg-muted)]">
        <div>
          <div className="tabular-nums text-sm text-[var(--fg-secondary)]">
            {skill.loaded_in_count}
          </div>
          <div>loaded in</div>
        </div>
        <div>
          <div className="text-sm text-[var(--fg-secondary)]">
            {relativeTime(skill.last_loaded_at)}
          </div>
          <div>last loaded</div>
        </div>
      </div>
    </button>
  );
}
