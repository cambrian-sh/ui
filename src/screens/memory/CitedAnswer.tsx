import { useMemo, useState } from 'react';
import type { AnswerMemory, Citation } from '@/ipc/types';
import { cn } from '@/design-system/lib/utils';

/**
 * NotebookLM-style grounded answer.
 *
 * The kernel returns prose with inline 1-based `[n]` markers plus the citations
 * they resolve to. This splits the answer into segments, and any segment that
 * carries trailing `[n]` markers becomes a coloured, clickable span. Clicking it
 * reveals the exact source chunk(s) below. A segment with no marker is uncited
 * connective text (neutral) — so an ungrounded sentence is visually obvious.
 */

// Stable, theme-aware citation accent classes (cycled by citation index).
const CITE_COLORS = [
  'var(--status-info)',
  'var(--status-ok)',
  'var(--status-warn)',
  'var(--accent-bg)',
  'var(--status-pulse)',
];

function colorFor(marker: number): string {
  return CITE_COLORS[(marker - 1) % CITE_COLORS.length];
}

interface Segment {
  text: string;
  markers: number[];
}

/**
 * Split the answer into segments at sentence boundaries, attaching each trailing
 * run of `[n]` markers to the sentence they follow. Robust to `[1][2]` and `[1, 2]`.
 */
function segment(answer: string): Segment[] {
  const segments: Segment[] = [];
  // Split into sentences, keeping the terminator; a marker run may sit before it.
  const sentenceRe = /[^.!?]*(?:\[[\d,\s]*\]\s*)*[.!?]?/g;
  const raw = answer.match(sentenceRe)?.filter((s) => s.trim() !== '') ?? [answer];
  for (const s of raw) {
    const markers: number[] = [];
    // Pull every [n] / [n,m] out of this sentence.
    const markerRe = /\[([\d,\s]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = markerRe.exec(s)) !== null) {
      for (const part of m[1].split(',')) {
        const n = parseInt(part.trim(), 10);
        if (!Number.isNaN(n) && !markers.includes(n)) markers.push(n);
      }
    }
    const text = s.replace(markerRe, '').replace(/\s+/g, ' ').trim();
    if (text === '' && markers.length === 0) continue;
    segments.push({ text, markers });
  }
  return segments;
}

export function CitedAnswer({ answer }: { answer: AnswerMemory }) {
  const [active, setActive] = useState<number | null>(null);
  const byMarker = useMemo(() => {
    const map = new Map<number, Citation>();
    for (const c of answer.citations) map.set(c.marker, c);
    return map;
  }, [answer.citations]);

  if (answer.status === 'abstention') {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        The corpus does not answer this question.{' '}
        <span className="text-[var(--fg-secondary)]">{answer.answer}</span>
      </p>
    );
  }
  if (answer.status === 'clarification') {
    return (
      <p className="text-sm text-[var(--fg-primary)]">
        <span className="text-[var(--status-warn)]">Needs clarification: </span>
        {answer.answer}
      </p>
    );
  }

  const segments = segment(answer.answer);
  const activeCitations =
    active === null ? [] : segments[active]?.markers.map((n) => byMarker.get(n)).filter(Boolean) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-[var(--fg-primary)]">
        {segments.map((seg, i) => {
          if (seg.markers.length === 0) {
            return (
              <span key={i} className="text-[var(--fg-secondary)]">
                {seg.text}{' '}
              </span>
            );
          }
          const color = colorFor(seg.markers[0]);
          const isActive = active === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActive(isActive ? null : i)}
              aria-expanded={isActive}
              aria-label={`Cited passage; sources ${seg.markers.join(', ')}`}
              className={cn(
                'mr-1 rounded-sm px-0.5 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
              )}
              style={{
                backgroundColor: isActive ? color : `color-mix(in srgb, ${color} 18%, transparent)`,
                color: isActive ? 'var(--fg-on-accent)' : 'var(--fg-primary)',
                boxShadow: `inset 0 -2px 0 ${color}`,
              }}
            >
              {seg.text}
              <sup className="ml-0.5 font-mono text-[9px]">{seg.markers.join(',')}</sup>
            </button>
          );
        })}
      </p>

      {active !== null && activeCitations.length > 0 && (
        <div className="flex flex-col gap-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--fg-muted)]">
              Source{activeCitations.length === 1 ? '' : 's'} for this passage
            </span>
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Close sources"
              className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
            >
              ×
            </button>
          </div>
          {activeCitations.map((c) => c && <CitationCard key={c.marker} cite={c} />)}
        </div>
      )}

      <p className="text-[10px] text-[var(--fg-muted)]">
        Click a highlighted passage to see the exact source it came from. Uncited text is neutral.
      </p>
    </div>
  );
}

function CitationCard({ cite }: { cite: Citation }) {
  const crumbs = cite.section_path.split('>').map((s) => s.trim()).filter(Boolean);
  const color = colorFor(cite.marker);
  return (
    <div className="flex flex-col gap-1 rounded-sm border-l-2 bg-[var(--bg-elevated)] p-2" style={{ borderColor: color }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-mono text-[10px]" style={{ color }}>
            [{cite.marker}]
          </span>
          <span className="truncate text-xs font-medium text-[var(--fg-primary)]" title={cite.source}>
            {cite.source || 'untitled'}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-[var(--fg-muted)]">{cite.score.toFixed(2)}</span>
      </div>
      {crumbs.length > 0 && (
        <nav aria-label="Section path" className="font-mono text-[10px] text-[var(--fg-muted)]">
          {crumbs.join(' › ')}
        </nav>
      )}
      <p className="border-l border-[var(--border-strong)] pl-2 text-[11px] leading-relaxed text-[var(--fg-secondary)]">
        {cite.text}
      </p>
    </div>
  );
}
