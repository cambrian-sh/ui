import { useState } from 'react';
import { cn } from '@/design-system/lib/utils';
import { LogRow } from './LogRow';
import { NO_VALUE, type AttrGroup } from './logStream';
import type { LogLevel } from '@/ipc/types';

const TONE: Record<LogLevel, string> = {
  debug: 'var(--fg-muted)',
  info: 'var(--fg-secondary)',
  warn: 'var(--status-warn)',
  error: 'var(--status-err)',
};

/**
 * One value of the grouped attribute, collapsed to a row.
 *
 * Collapsing is what makes the rare group visible: a session with nine errors
 * should not be three screens below a session with four thousand healthy lines.
 * The count is coloured by the worst level in the group for the same reason the
 * component facet is.
 */
export function LogGroup({
  group,
  groupKey,
  selected,
  onSelect,
  onFilterValue,
}: {
  group: AttrGroup;
  groupKey: string;
  selected: number | null;
  onSelect: (seq: number | null) => void;
  onFilterValue: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const absent = group.value === NO_VALUE;

  return (
    <div className="border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-2 px-4 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span aria-hidden className="w-3 flex-none font-mono text-[10px] text-[var(--fg-muted)]">
            {open ? '▾' : '▸'}
          </span>
          <span
            className={cn(
              'truncate font-mono text-[11.5px]',
              // "No session at all" is usually the interesting half of the
              // answer, so it is named rather than hidden — but it is not a
              // value, and it does not read like one.
              absent ? 'italic text-[var(--fg-muted)]' : 'text-[var(--fg-primary)]',
            )}
          >
            {absent ? `no ${groupKey}` : group.value}
          </span>
          <span
            className="font-mono text-[10.5px] tabular-nums"
            style={{ color: TONE[group.worst] }}
          >
            {group.count}
          </span>
        </button>
        {!absent && (
          <button
            type="button"
            onClick={() => onFilterValue(group.value)}
            className="flex-none text-[10.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
          >
            filter to this
          </button>
        )}
      </div>

      {open && (
        <ul className="flex flex-col bg-[color-mix(in_srgb,var(--fg-primary)_3%,transparent)]">
          {group.records.map((r) => (
            <li key={r.seq}>
              <LogRow
                record={r}
                selected={r.seq === selected}
                onClick={() => onSelect(r.seq === selected ? null : r.seq)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
