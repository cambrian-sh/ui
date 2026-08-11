import { useState } from 'react';
import { LogRow } from './LogRow';
import { repeatSpan, type StreamItem } from './logStream';

/**
 * One row of the stream: either a single record, or a collapsed run.
 *
 * Collapsing repeats is not tidiness — it is what makes the rare line visible.
 * A reconnect loop firing 340 times will otherwise bury the one error that
 * matters, and scrolling past it is the failure the screen exists to prevent.
 */
export function LogStreamRow({
  item,
  selected,
  onSelect,
}: {
  item: StreamItem;
  selected: number | null;
  onSelect: (seq: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (item.repeats < 2) {
    return (
      <LogRow
        record={item.record}
        selected={item.record.seq === selected}
        onClick={() => onSelect(item.record.seq)}
      />
    );
  }

  return (
    <div>
      <div className="relative">
        <LogRow
          record={item.record}
          selected={item.record.seq === selected}
          onClick={() => onSelect(item.record.seq)}
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-[5px] bg-[color-mix(in_srgb,var(--fg-primary)_10%,transparent)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
        >
          {/* The count and the SPAN together: 340 times is a number, 340 times in
              15 minutes is a rate an operator can judge. */}
          {item.repeats}× {repeatSpan(item)}
        </button>
      </div>

      {expanded && (
        <ul className="flex flex-col bg-[color-mix(in_srgb,var(--fg-primary)_3%,transparent)]">
          {item.members.map((r) => (
            <li key={r.seq}>
              <LogRow
                record={r}
                selected={r.seq === selected}
                onClick={() => onSelect(r.seq)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
