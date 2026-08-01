import { parseCitedText } from './drift-format';
import type { AlertCitation } from '@/ipc/types';
import { cn } from '@/design-system/lib/utils';

/**
 * An alert's sentence, with its `[n]` markers resolved against its citations.
 *
 * The same ADR-0081 mechanism as a cited memory answer — a coloured marker you
 * click to reveal the exact source — deliberately, so someone who has learned to
 * read one can read the other without learning a second format.
 *
 * It is a separate component from `CitedAnswer` rather than a reuse of it for one
 * structural reason: that renderer segments by SENTENCE and attaches markers to
 * whole sentences, which is right for a synthesised answer. An alert's markers sit
 * inline mid-clause ("…to acme [1], but PO-4471 records…"), and running them
 * through a sentence segmenter would attach `[1]` to the entire opening clause and
 * lose which side of the comparison it anchors. The visual language is shared; the
 * parse cannot be.
 *
 * **Every marker here is derived from the data.** Nothing emits a literal `[3]`:
 * an alert with one earlier date renders `[3]`, and an alert with none renders no
 * third marker at all. A hardcoded run produced two markers with no citations on
 * two of three alerts during review, and this page argues in its own copy that a
 * citation an operator cannot follow is a defect.
 */
export function CitedAlertText({
  text,
  citations,
  activeIndex,
  onSelect,
}: {
  text: string;
  citations: readonly AlertCitation[];
  /** Which citation is currently revealed, if any. */
  activeIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
  const segments = parseCitedText(text, citations);

  return (
    <p className="text-sm leading-[1.75] text-[var(--fg-primary)] text-pretty">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') return <span key={i}>{seg.text}</span>;

        if (seg.kind === 'orphan') {
          // Deliberately NOT citation-styled. The marker is in the kernel's
          // sentence but nothing backs it, and drawing it as followable would be
          // the one lie this surface cannot afford.
          return (
            <span
              key={i}
              title="This marker has no citation behind it, so there is nothing to open."
              className="font-mono text-[10px] text-[var(--fg-muted)]"
            >
              {seg.text}
            </span>
          );
        }

        const active = activeIndex === seg.index;
        // The promise and the current record are the comparison; the earlier
        // dates are the history behind it. Two tones, because they are two
        // different kinds of evidence and the inspector groups them that way.
        const tone =
          seg.citation.kind === 'message' || seg.index <= 2
            ? 'var(--color-accent-400)'
            : 'var(--status-warn)';

        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(active ? null : seg.index)}
            aria-expanded={active}
            aria-label={`Citation ${seg.index}: ${seg.citation.kind} ${seg.citation.ref}`}
            className={cn(
              'rounded-[2px] px-[1px] align-baseline transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
            )}
            style={{
              backgroundColor: active ? `color-mix(in srgb, ${tone} 22%, transparent)` : undefined,
            }}
          >
            <sup className="font-mono text-[10px]" style={{ color: tone }}>
              [{seg.index}]
            </sup>
          </button>
        );
      })}
    </p>
  );
}
