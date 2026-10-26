// The ask box — the ONLY user-facing query surface of the Knowledge console.
//
// Natural language in; then one of exactly three outcomes, each rendered
// distinctly because conflating any two of them misstates the product:
//
//   ANSWERED — typed rows + the guarantee label + the COMPILED QUERY. The
//     compiled chip is the transparency contract: the model formed the query
//     (never the answer), and the operator always sees exactly what was asked
//     of the store, so NL convenience never becomes NL ambiguity.
//   REFUSED — the plane WORKING, not failing: open-ended or unexpressible
//     questions come back with the reason named, and `lane_hint: memory`
//     links to the memory lane, which is the right tool for fuzzy questions.
//   ERROR — the transport/kernel did not answer. A read failure, never
//     rendered as "no answer exists".

import { useCallback, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ipc } from '@/ipc';
import type { AskOutcome, CompiledQuery } from '@/ipc/types';
import { Button, ErrorState, Input } from '@/design-system/components';
import { GuaranteeLabel, parseRows, RowTable } from './rows';

export function AskPane({ onOpenReceipt }: { onOpenReceipt: (evidenceId: string) => void }) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);
  const [askedQuestion, setAskedQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Drops a stale in-flight answer when a newer ask was submitted.
  const askSeq = useRef(0);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q || asking) return;
    const seq = ++askSeq.current;
    setAsking(true);
    setError(null);
    try {
      const result = await ipc.askKnowledge(q);
      if (askSeq.current !== seq) return;
      setOutcome(result);
      setAskedQuestion(q);
    } catch (e) {
      if (askSeq.current !== seq) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (askSeq.current === seq) setAsking(false);
    }
  }, [question, asking]);

  return (
    <div className="flex flex-col gap-4 p-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <Input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the substrate — e.g. “What are the payment terms for PO-800?”"
          aria-label="Ask the knowledge substrate"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={asking || question.trim() === ''}>
          {asking ? 'Asking…' : 'Ask'}
        </Button>
      </form>

      {error && (
        <ErrorState
          reason={`The ask could not run: ${error}.`}
          whatToDo="This is a read failure, not an answer. The question was never evaluated — the substrate lane did not respond."
        />
      )}

      {outcome && !error && (
        <section aria-label="Answer" className="flex flex-col gap-3">
          <p className="text-[12px] text-[var(--fg-muted)]">
            Asked: <span className="text-[var(--fg-secondary)]">{askedQuestion}</span>
          </p>
          {outcome.answered ? (
            <>
              {outcome.compiled && <CompiledChip compiled={outcome.compiled} />}
              <GuaranteeLabel guarantee={outcome.guarantee} />
              <RowTable
                rows={parseRows(outcome.rows)}
                onOpenReceipt={onOpenReceipt}
                ariaLabel="Answer rows"
              />
            </>
          ) : (
            <Refusal reason={outcome.refusal_reason} laneHint={outcome.lane_hint} />
          )}
        </section>
      )}
    </div>
  );
}

/** The exact query that ran, shown with every answer. */
function CompiledChip({ compiled }: { compiled: CompiledQuery }) {
  const fields: Array<[string, string]> = [
    ['entity', compiled.entity_id],
    ['predicate', compiled.predicate],
    ['item kind', compiled.item_kind],
    ['actor', compiled.actor],
    ['aggregate', compiled.aggregate],
    ['as of', compiled.as_of],
    ['from', compiled.from],
    ['to', compiled.to],
    ['hops', compiled.hops > 0 ? String(compiled.hops) : ''],
    ['evidence', compiled.evidence_id],
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-3 py-2"
      aria-label="Compiled query"
    >
      <span className="type-label text-[var(--fg-muted)]">
        Compiled query
      </span>
      <span className="rounded-[5px] bg-[color-mix(in_srgb,var(--accent-bg)_13%,transparent)] px-2 py-0.5 font-mono text-[12px] font-medium text-[var(--fg-primary)]">
        {compiled.kind}
      </span>
      {fields
        .filter(([, v]) => v !== '')
        .map(([k, v]) => (
          <span key={k} className="font-mono text-[12px] text-[var(--fg-secondary)]">
            {k}=<span className="text-[var(--fg-primary)]">{v}</span>
          </span>
        ))}
    </div>
  );
}

/**
 * A refusal is a first-class answer: the substrate refuses rather than
 * guesses, and this card says so — with a word AND a shape, never colour
 * alone, and never styled like an error.
 */
function Refusal({ reason, laneHint }: { reason: string; laneHint: string }) {
  return (
    <div
      role="status"
      className="rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-inset)] px-4 py-3"
    >
      <p className="text-[13px] font-medium text-[var(--fg-primary)]">Refused — by design</p>
      <p className="mt-1 text-[13px] text-[var(--fg-secondary)]">{reason}</p>
      <p className="mt-2 text-[12.5px] text-[var(--fg-muted)]">
        The substrate answers modelled questions exactly, or not at all — it never guesses.
        {laneHint === 'memory' && (
          <>
            {' '}
            For open-ended questions,{' '}
            <Link
              to="/memory"
              className="text-[var(--accent-fg)] underline-offset-2 hover:underline"
            >
              search memory
            </Link>{' '}
            — the approximate lane is the right tool there.
          </>
        )}
      </p>
    </div>
  );
}
