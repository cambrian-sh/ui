import { useState } from 'react';
import type { MemoryHit } from '@/ipc/types';
import { cn } from '@/design-system/lib/utils';

export interface SourceCardProps {
  hit: MemoryHit;
  index: number;
  className?: string;
}

/**
 * One retrieval hit rendered as evidence.
 *
 * The quote is `text` (the verbatim chunk), never `summary` — `summary` is a
 * <=200-char preview and is not quotable. Collapsed to three lines; click to
 * expand the full chunk.
 */
export function SourceCard({ hit, index, className }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const crumbs = hit.section_path.split('>').map((s) => s.trim()).filter(Boolean);

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className="shrink-0 font-mono text-[10px] text-[var(--accent-bg)]"
            aria-label={`Source ${index}`}
          >
            [{index}]
          </span>
          <span className="truncate text-xs font-medium text-[var(--fg-primary)]" title={hit.source}>
            {hit.source || 'untitled'}
          </span>
        </div>
        <span
          className="shrink-0 font-mono text-[10px] text-[var(--fg-muted)]"
          aria-label={`score ${hit.score.toFixed(2)}`}
        >
          {hit.score.toFixed(2)}
        </span>
      </div>

      {crumbs.length > 0 && (
        <nav aria-label="Section path" className="truncate font-mono text-[10px] text-[var(--fg-muted)]">
          {crumbs.join(' › ')}
        </nav>
      )}

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse passage' : 'Expand passage'}
        className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <p
          className={cn(
            'border-l-2 border-[var(--border-strong)] pl-2 text-[11px] leading-relaxed text-[var(--fg-secondary)]',
            expanded ? 'whitespace-pre-wrap' : 'line-clamp-3',
          )}
        >
          {hit.text}
        </p>
      </button>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--fg-muted)]">
        {hit.tags.map((tag) => (
          <span key={tag} className="font-mono">
            #{tag}
          </span>
        ))}
        {hit.tags.length > 0 && <span aria-hidden="true">·</span>}
        <span className="font-mono">importance {hit.importance.toFixed(1)}</span>
      </div>
    </div>
  );
}
