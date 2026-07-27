import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import type { Vocabulary } from './useVocabulary';

interface TagPickerProps {
  label: string;
  /** What this term does, in the operator's words — not the algebra's. */
  hint: string;
  selected: string[];
  onChange: (tags: string[]) => void;
  vocabulary: Vocabulary;
  /** Colour role: a deny term reads differently from a boundary term. */
  tone?: 'neutral' | 'deny' | 'grant';
  disabled?: boolean;
  /**
   * Restrict selection to CLOSED tags (ADR-0091). Used by the grant field, because
   * the kernel refuses a grant on an open tag — offering one would hand the author
   * a rejection from a form that looked valid.
   */
  closedOnly?: boolean;
}

/**
 * Vocabulary-driven tag selection (ADR-0085 D11).
 *
 * This replaces the comma-separated free-text inputs the scope editor used to
 * have. The spec is blunt about why: **a free-text tag field in the admin UI is a
 * defect.** Tags are opaque strings, so nothing downstream can catch a typo — it
 * just produces a boundary that silently matches nothing, which is the exact
 * failure this whole subsystem exists to prevent.
 *
 * When the kernel has no vocabulary configured its coinage check is off and any
 * tag is accepted. Free entry is then honest rather than dangerous, so it is
 * allowed — with the reason stated, not hidden.
 */
export function TagPicker({
  label,
  hint,
  selected,
  onChange,
  vocabulary,
  tone = 'neutral',
  disabled = false,
  closedOnly = false,
}: TagPickerProps) {
  const [freeText, setFreeText] = useState('');

  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  };

  const addFreeText = () => {
    const t = freeText.trim();
    if (!t || selected.includes(t)) return;
    onChange([...selected, t]);
    setFreeText('');
  };

  const isClosed = (tag: string) => vocabulary.closed.has(tag);

  // The grant field may only offer CLOSED tags: the kernel refuses a grant on an
  // open tag, so showing one would hand the author a rejection from a form that
  // looked valid. Everywhere else, every tag is offerable — closure changes what a
  // term MEANS, not whether it may be selected.
  const available = vocabulary.tags.filter(
    (t) => !selected.includes(t) && (!closedOnly || isClosed(t)),
  );

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-xs font-medium text-[var(--fg-primary)]">{label}</legend>
      <p className="mb-2 text-xs text-[var(--fg-muted)]">{hint}</p>
      {vocabulary.closed.size > 0 && !closedOnly && (
        <p className="mb-2 text-[11px] text-[var(--fg-muted)]">
          <span aria-hidden="true">&#9679;</span> marks a <strong>closed</strong> tag: nobody
          reaches it unless a policy grants it. Putting one in <em>Forbidden</em> is redundant;
          putting one in <em>Required</em> without a matching grant yields a boundary that matches
          nothing.
        </p>
      )}

      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={`${label} — selected`}>
          {selected.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => toggle(tag)}
                aria-label={`Remove ${tag}`}
                className={cn(
                  'rounded-[var(--radius-sm,3px)] border px-2 py-0.5 text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  tone === 'deny'
                    ? 'border-[var(--color-status-err)] text-[var(--color-status-err)]'
                    : tone === 'grant'
                      ? 'border-[var(--color-status-ok)] text-[var(--color-status-ok)]'
                      : 'border-[var(--border-strong)] text-[var(--fg-secondary)]',
                )}
              >
                {isClosed(tag) && (
                  <span
                    aria-label="closed tag"
                    title="Closed: deny-by-default. Reachable only where a policy grants it."
                    className="mr-1"
                  >
                    &#9679;
                  </span>
                )}
                {tag} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {vocabulary.configured ? (
        available.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={`${label} — available`}>
            {available.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => toggle(tag)}
                  className={cn(
                    'rounded-[var(--radius-sm,3px)] border border-dashed border-[var(--border-subtle)] px-2 py-0.5 text-xs',
                    'text-[var(--fg-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--fg-secondary)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  )}
                >
                  + {tag}
                  {isClosed(tag) && (
                    <span
                      aria-label="closed tag"
                      title="Closed: deny-by-default. Reachable only where a policy grants it."
                      className="ml-1"
                    >
                      &#9679;
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--fg-muted)]">
            {closedOnly
              ? // A grant with nothing to offer is not an empty list — it means no tag
                // is deny-by-default, so there is nothing a grant could reopen.
                'No tag is closed, so there is nothing to grant. Close a tag first (CAMBRIAN_CLOSED_TAGS) — a grant on an open tag is refused, because it would confer nothing.'
              : 'Every vocabulary tag is selected.'}
          </p>
        )
      ) : (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFreeText();
                }
              }}
              placeholder="tag name"
              aria-label={`${label} — add a tag`}
              className="h-7 text-xs"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addFreeText}>
              Add
            </Button>
          </div>
          <p className="text-xs text-[var(--color-status-warn)]">
            This kernel has no classification vocabulary, so any tag is accepted and a typo
            here produces a boundary that matches nothing. Configure one to pick from a list.
          </p>
        </div>
      )}
    </fieldset>
  );
}
