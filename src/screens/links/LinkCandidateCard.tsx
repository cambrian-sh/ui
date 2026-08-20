import { useState } from 'react';
import { Badge, Button } from '@/design-system/components';
import {
  ReasonField,
  useReasonGate,
} from '@/design-system/components/cambrian/reason-field';
import { cn } from '@/design-system/lib/utils';
import type { Link } from '@/ipc/types';

/**
 * How a mechanism reads on the card.
 *
 * The mechanism is the trust ceiling, not decoration: `derived`, `scored` and
 * `correlation` can never write `confirmed` on their own, which is exactly why
 * they are in this queue and why a human decision is the only way out of it.
 * The sentence says that in words rather than leaving the operator to know the
 * vocabulary — but the vocabulary itself is DATA, so an unrecognised mechanism
 * gets a neutral, honest line instead of a guess.
 */
const MECHANISMS: Record<string, string> = {
  declared: 'the source declared it — a mapping said these two are the same thing',
  record: 'a record carried it as a field of the row itself',
  reference: 'one record referenced the other by id',
  shared_object: 'both touched the same object',
  witnessed: 'the system watched it happen and wrote it down',
  derived: 'a rule inferred it — no source ever said it',
  scored: 'a model scored it — no source ever said it',
  human: 'a person asserted it',
  correlation: 'two things co-occurred. Co-occurrence is not causation',
};

/** Verbatim, and never rounded away: 0.51 and 0.94 are different decisions. */
function confidenceLabel(c: number): string {
  return c.toFixed(2);
}

/** A typed ref split into its type and its subject, for reading. */
function refParts(ref: string): { kind: string; subject: string } {
  const i = ref.indexOf(':');
  if (i < 0) return { kind: '', subject: ref };
  return { kind: ref.slice(0, i), subject: ref.slice(i + 1) };
}

function Ref({ value, label }: { value: string; label: string }) {
  const { kind, subject } = refParts(value);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
        {label}
        {kind && ` · ${kind}`}
      </span>
      <span className="truncate font-mono text-[13px] text-[var(--fg-primary)]" title={value}>
        {subject}
      </span>
    </div>
  );
}

export interface LinkCandidateCardProps {
  link: Link;
  /** False for a Viewer, or when the kernel has no write path for this lane. */
  canDecide: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onReject: (reason: string) => void;
}

/**
 * One proposal, arranged consequence first.
 *
 * The claim is the headline — *these two refs, this verb* — because that is what
 * is being decided. Everything under it is the half that decides whether to
 * believe the claim: **how** it was made (mechanism), **who** made it
 * (producer, the batch-revocation key), **how sure** it was (confidence) and
 * **what it stands on** (evidence). A card that showed only the endpoints would
 * be asking for a decision while hiding the grounds for it, which is the exact
 * failure the `LinkOp` contract comment names.
 *
 * Confirm and Reject are both irreversible-in-spirit and both audited, so
 * neither is a bare tap: choosing one opens a mandatory reason, and the reason
 * is what the kernel records next to the operator's name. Reject is styled as
 * the quieter option deliberately — rejecting is not the dangerous outcome here,
 * *confirming a wrong identity* is, because a confirmed `same_as` merges two
 * things everything downstream will then read as one.
 */
export function LinkCandidateCard({
  link,
  canDecide,
  busy,
  error,
  onConfirm,
  onReject,
}: LinkCandidateCardProps) {
  const [decision, setDecision] = useState<'confirm' | 'reject' | null>(null);
  const gate = useReasonGate();

  const close = () => {
    setDecision(null);
    gate.reset();
  };

  const submit = () => {
    if (!gate.satisfied) return;
    if (decision === 'confirm') onConfirm(gate.reason.trim());
    else if (decision === 'reject') onReject(gate.reason.trim());
  };

  const mechanismNote = MECHANISMS[link.mechanism] ?? 'mechanism not known to this console';

  return (
    <article className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      {/* The claim. */}
      <div className="flex items-center gap-3">
        <Ref value={link.from_ref} label="from" />
        <div className="flex shrink-0 flex-col items-center">
          <span className="font-mono text-[12px] font-medium text-[var(--color-accent-400)]">
            {link.relation}
          </span>
          <span aria-hidden="true" className="text-[11px] text-[var(--fg-muted)]">
            →
          </span>
        </div>
        <Ref value={link.to_ref} label="to" />
        <span className="ml-auto shrink-0">
          <Badge variant={link.confidence >= 0.8 ? 'warn' : 'neutral'}>
            {confidenceLabel(link.confidence)}
          </Badge>
        </span>
      </div>

      {/* Why it is here, and whether to believe it. */}
      <p className="text-[11.5px] leading-[1.55] text-[var(--fg-secondary)]">
        <span className="font-mono text-[11px] text-[var(--fg-primary)]">{link.mechanism}</span>
        {' — '}
        {mechanismNote}.
      </p>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11.5px]">
        <dt className="text-[var(--fg-muted)]">Producer</dt>
        <dd className="truncate font-mono text-[var(--fg-secondary)]" title={link.producer}>
          {link.producer || 'not recorded'}
        </dd>
        <dt className="text-[var(--fg-muted)]">Evidence</dt>
        <dd className="truncate font-mono text-[var(--fg-secondary)]" title={link.evidence_id}>
          {link.evidence_id || 'none — a human assertion carries no evidence row'}
        </dd>
        <dt className="text-[var(--fg-muted)]">Asserted by</dt>
        <dd className="truncate font-mono text-[var(--fg-secondary)]" title={link.asserted_by}>
          {link.asserted_by || 'not recorded'}
        </dd>
        <dt className="text-[var(--fg-muted)]">Family</dt>
        <dd className="font-mono text-[var(--fg-secondary)]">
          {link.family}
          {link.family === 'identity' && ' — confirming MERGES these two everywhere downstream'}
        </dd>
      </dl>

      {error && (
        <p role="alert" className="text-[11.5px] text-[var(--status-err)]">
          {error}
        </p>
      )}

      {decision === null ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!canDecide || busy}
            onClick={() => setDecision('confirm')}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canDecide || busy}
            onClick={() => setDecision('reject')}
          >
            Reject
          </Button>
          {!canDecide && (
            <span className="text-[11.5px] text-[var(--fg-muted)]">
              Reviewing is operator-only.
            </span>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-2.5 rounded-[var(--radius-md)] p-3 tint-wash tint-ring',
          )}
          style={
            {
              '--tint':
                decision === 'confirm' ? 'var(--status-warn)' : 'var(--status-idle)',
            } as React.CSSProperties
          }
        >
          <p className="text-[11.5px] leading-[1.55] text-[var(--fg-secondary)]">
            {decision === 'confirm'
              ? 'Confirming APPENDS a human assertion. The machine’s proposal stays exactly as it is — the record of what the producer said is not overwritten.'
              : 'Rejecting stamps this proposal retracted. It is never deleted: the producer has to be able to see that a human said no, or it proposes the same thing again.'}
          </p>
          <ReasonField
            gate={gate}
            id={`link-reason-${link.id}`}
            label={decision === 'confirm' ? 'Why confirm' : 'Why reject'}
            note="A reason is required — it lands in the audit log next to your name."
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={decision === 'confirm' ? 'default' : 'secondary'}
              disabled={!gate.satisfied || busy}
              onClick={submit}
            >
              {decision === 'confirm' ? 'Confirm link' : 'Reject link'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
