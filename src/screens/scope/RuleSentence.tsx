import { cn } from '@/design-system/lib/utils';
import type { Vocabulary } from './useVocabulary';

/**
 * The four term kinds a `ScopeRule` can carry.
 *
 * Named for what they do to access, not for their field name, because that is
 * the distinction an author has to keep straight: three of them narrow, and
 * exactly one widens.
 */
export type TermKind = 'forbidden' | 'required' | 'any_of' | 'granted';

export interface TermSpec {
  kind: TermKind;
  /** The verb blank, as it reads in the sentence. */
  verb: string;
  /** The label used in a picker. */
  label: string;
  /** Whether this term adds access rather than removing it. */
  widens: boolean;
  /** Said in place, next to the term — never in a list at the bottom. */
  note?: string;
}

export const TERMS: Record<TermKind, TermSpec> = {
  forbidden: {
    kind: 'forbidden',
    verb: 'never read',
    label: 'Never read',
    widens: false,
    note: undefined,
  },
  required: {
    kind: 'required',
    verb: 'only read',
    label: 'Only read',
    widens: false,
    note: 'Every document must carry this label. A document missing it becomes unreachable.',
  },
  any_of: {
    kind: 'any_of',
    verb: 'only read',
    label: 'Only read (any of)',
    widens: false,
    note: 'The document must carry at least one of these.',
  },
  granted: {
    kind: 'granted',
    verb: 'also read',
    label: 'Also read (grant)',
    widens: true,
    note: 'A grant is the only term that widens access. It reopens a closed label — nothing else in this rule can do that.',
  },
};

/** Maps a term kind onto the `ScopeRule` field it compiles to. */
export const TERM_FIELD: Record<TermKind, 'forbidden_tags' | 'required_tags' | 'any_of_tags' | 'granted_tags'> = {
  forbidden: 'forbidden_tags',
  required: 'required_tags',
  any_of: 'any_of_tags',
  granted: 'granted_tags',
};

/** Where a blank's value came from, when the assistant filled it in (`8a`). */
export type Provenance = 'stated' | 'inferred';

export interface RuleSentenceProps {
  /** `surface:chat:telegram`, `group:support-team`, `organisation`. */
  container: string;
  term: TermKind;
  tags: string[];
  vocabulary: Vocabulary;
  /**
   * Per-blank provenance. Present only when a model filled the blanks in — the
   * inferred ones are the ones that deserve a second read, and today they are
   * indistinguishable from what the operator actually said.
   */
  provenance?: Partial<Record<'container' | 'term' | 'tags', Provenance>>;
  /** Render the blanks as buttons that open a picker. */
  onEditContainer?: () => void;
  onEditTerm?: () => void;
  onEditTags?: () => void;
  className?: string;
}

/**
 * A `ScopeRule` read back as a sentence.
 *
 * The model is never read back in the operator's language today: the intent
 * lives in the author's head while the UI shows four tag arrays, an effect
 * list, a mode and a link. This is the fix, and it is deliberately ONE renderer
 * with two callers — the editor in `7b` and the assistant's draft review in
 * `8a`. Reading a rule and approving a rule then become the same act, which is
 * the only way an approval step is a real check rather than a ceremony.
 *
 * Every blank is a vocabulary selection, never free text: tags are opaque
 * strings, so a typo produces a boundary that silently matches nothing.
 */
export function RuleSentence({
  container,
  term,
  tags,
  vocabulary,
  provenance,
  onEditContainer,
  onEditTerm,
  onEditTags,
  className,
}: RuleSentenceProps) {
  const spec = TERMS[term];

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-[15px] leading-[1.7] text-[var(--fg-primary)]">
        Anything reaching Cambrian through{' '}
        <Blank
          onClick={onEditContainer}
          provenance={provenance?.container}
          tone="neutral"
          label="container"
        >
          <code className="font-mono">{container || 'choose a container'}</code>
        </Blank>{' '}
        may{' '}
        <Blank
          onClick={onEditTerm}
          provenance={provenance?.term}
          tone={spec.widens ? 'grant' : 'deny'}
          label="what it may do"
        >
          {spec.verb}
        </Blank>{' '}
        a document labelled{' '}
        <Blank
          onClick={onEditTags}
          provenance={provenance?.tags}
          tone={spec.widens ? 'grant' : 'deny'}
          label="labels"
        >
          {tags.length === 0 ? (
            <span className="italic opacity-70">choose a label</span>
          ) : (
            tags.map((tag, i) => (
              <span key={tag}>
                {i > 0 && <span className="opacity-60"> or </span>}
                <TagChip tag={tag} closed={vocabulary.closed.has(tag)} />
              </span>
            ))
          )}
        </Blank>
        .
      </p>

      {/* The grant warning lives HERE, on the term that causes it. */}
      {spec.widens && (
        <p
          className="rounded-md p-2 text-[12px] leading-[1.5] tint-wash tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">{spec.note}</span>
        </p>
      )}
      {!spec.widens && spec.note && (
        <p className="text-[12px] leading-[1.5] text-[var(--fg-muted)]">{spec.note}</p>
      )}
    </div>
  );
}

/**
 * A closed label is deny-by-default, and that changes what every other term in
 * the rule means. The `●` marker is load-bearing: it is how "nobody reaches
 * this unless a policy grants it" is visible at a glance, inline, wherever a
 * tag appears.
 */
export function TagChip({ tag, closed }: { tag: string; closed: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[13px]',
        closed
          ? 'text-[var(--status-warn)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--status-warn)_34%,transparent)]'
          : 'text-[var(--color-accent-400)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_34%,transparent)]',
      )}
      title={closed ? `${tag} is a closed label — deny by default` : undefined}
    >
      {closed && <span aria-label="closed label">●</span>}
      {tag}
    </span>
  );
}

function Blank({
  children,
  onClick,
  provenance,
  tone,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  provenance?: Provenance;
  tone: 'neutral' | 'deny' | 'grant';
  label: string;
}) {
  const body = (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 rounded-sm px-1 font-medium',
        tone === 'deny' && 'text-[var(--fg-primary)]',
        tone === 'grant' && 'text-[var(--status-warn)]',
        onClick &&
          'cursor-pointer underline decoration-dotted underline-offset-4 hover:bg-[var(--list-row-bg-hover)]',
      )}
    >
      {children}
      {/* Provenance sits on the blank, so "the model guessed this one" is
          attached to the thing that was guessed. */}
      {provenance === 'inferred' && (
        <span
          className="rounded-sm px-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--status-warn)]"
          title="Inferred by the assistant — you did not say this"
        >
          inferred
        </span>
      )}
      {provenance === 'stated' && (
        <span
          className="rounded-sm px-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--fg-muted)]"
          title="You said this"
        >
          you said
        </span>
      )}
    </span>
  );

  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} aria-label={`Change ${label}`} className="text-left">
      {body}
    </button>
  );
}
