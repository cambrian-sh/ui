import { useCallback, useMemo, useState } from 'react';
import { EmptyState, ScrollArea } from '@/design-system/components';
import { ipc } from '@/ipc';
import { errorMessage } from '@/lib/errorMessage';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useCapability } from '@/lib/useCommandGate';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { Link, LinkPair } from '@/ipc/types';
import { LinkCandidateCard } from './LinkCandidateCard';

/** The capability that decides whether this lane exists at all (contract 0098). */
export const LINKS_CAPABILITY = 'links';

/**
 * Highest confidence first, then oldest first, then by id.
 *
 * The kernel already returns candidates in confidence order, and this sorts
 * anyway — for the same reason `records.rs` sorts its unresolved reasons: an
 * order that is a property of the data cannot reshuffle between two polls, and a
 * queue whose rows move while you read it is one an operator stops working from.
 * The tie-breaks matter because a producer writing a batch at one confidence is
 * the common case, not the exotic one.
 */
export function orderCandidates(links: readonly Link[]): Link[] {
  return [...links].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      a.asserted_at_unix_ms - b.asserted_at_unix_ms ||
      a.id.localeCompare(b.id),
  );
}

/** A stable key for one claim. */
export function pairKey(p: LinkPair): string {
  const k = p.pair;
  return [k.namespace_id, k.family, k.from_ref, k.relation, k.to_ref].join('|');
}

/**
 * Claims ordered like rows: best candidate first, then the longest-waiting, then
 * by key — a property of the data, so the queue does not reshuffle between polls.
 */
export function orderPairs(pairs: readonly LinkPair[]): LinkPair[] {
  const oldest = (p: LinkPair) => Math.min(...p.candidates.map((c) => c.asserted_at_unix_ms));
  return [...pairs].sort(
    (a, b) =>
      b.confidence - a.confidence || oldest(a) - oldest(b) || pairKey(a).localeCompare(pairKey(b)),
  );
}

/**
 * Link review — the identity plane's inbox (contracts 0098 and 0109).
 *
 * One card per CLAIM (contract 0109): several producer lanes and supporting
 * sources write their own rows for the same claim, each keeping its own evidence
 * and classification, and the kernel groups them. Confirming a claim appends one
 * confirmation per row; rejecting it retracts every row and stops every producer
 * proposing it again. A claim already confirmed through another source comes
 * back only when a new source supports it, flagged "extend the confirmation?".
 *
 * Producers mint entities freely and propose links all day, but a mechanism
 * below its trust ceiling — `derived`, `scored`, `correlation` — can only ever
 * write a *candidate*. This screen is the only path in the product from
 * candidate to confirmed, which is why it exists as a destination rather than a
 * pane inside Knowledge: a review lane nobody can reach is a queue, not a lane.
 *
 * Three things shape it:
 *
 *  1. **The card carries the grounds, not just the claim.** Mechanism, producer,
 *     confidence and evidence are on every card, because those are what a
 *     reviewer weighs. See `LinkCandidateCard`.
 *  2. **A decision re-reads the queue.** Candidates are not on the operator
 *     event feed, so there is no fold to wait for; the screen refetches after a
 *     write instead of optimistically removing a row it has not seen the kernel
 *     act on.
 *  3. **Zero candidates is calm, and an absent capability is a different
 *     sentence.** A kernel with no link store is a CORRECT deployment; it must
 *     not read as an empty queue, and an empty queue must not read as a fault.
 */
export function LinkReviewConsole() {
  // `links` is an OSS operator capability (core app.go operatorCaps), not a
  // plugin's, so this screen gates with useCapability and does not wrap itself
  // in PluginSurface: there is no plugin version to report skew against.
  const role = useStore(projectionStore, (s) => s.state?.role ?? null);
  const available = useCapability(LINKS_CAPABILITY);
  const canDecide = role === 'operator';

  const candidates = useKernelQuery(['link-pairs'], () => ipc.listLinkPairs(), {
    enabled: available,
  });

  // Per-row, so a failure on one card cannot blank the queue — and so a second
  // card is still actionable while the first one is explaining itself.
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const decide = useCallback(
    async (pair: LinkPair, verb: 'confirm' | 'reject', reason: string) => {
      const key = pairKey(pair);
      setPending(key);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        if (verb === 'confirm') {
          await ipc.confirmLinkPair(pair.pair, reason);
        } else {
          await ipc.rejectLinkPair(pair.pair, reason);
        }
        await candidates.refetch();
      } catch (e) {
        setErrors((prev) => ({ ...prev, [key]: errorMessage(e) }));
      } finally {
        setPending(null);
      }
    },
    [candidates],
  );

  const rows = useMemo(() => orderPairs(candidates.data ?? []), [candidates.data]);

  if (!available) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4">
          <EmptyState
            title="This kernel has no link review lane"
            body={
              'The identity plane needs a link store (contract 0098). A kernel without one can still answer over links it was given; it just has nothing to review, so the queue is hidden rather than drawn with buttons that would refuse.'
            }
          />
        </div>
      </ScrollArea>
    );
  }

  if (candidates.isLoading) {
    return <p className="p-4 text-[12.5px] text-[var(--fg-muted)]">Loading proposals…</p>;
  }

  if (candidates.error) {
    return (
      <div className="p-4">
        <div className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
          <h2 className="type-section-title">Link review</h2>
          <p role="alert" className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--status-err)]">
            {errorMessage(candidates.error)}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
            The kernel advertises the lane but did not answer. This is an error, not an
            empty queue — nothing here says there are no proposals waiting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 p-4 pb-10">
        <header>
          <h2 className="type-page-title">
            Link review
          </h2>
          <p className="type-page-description mt-1">
            {rows.length === 0
              ? 'Proposals a machine could not confirm on its own arrive here.'
              : `${rows.length} proposal${rows.length === 1 ? '' : 's'} waiting, strongest first. Confirming appends a human assertion per source; rejecting stamps the proposals retracted, never deletes them, and stops them being proposed again.`}
          </p>
        </header>

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            body="Producers propose links whenever data arrives; anything a mechanism was not trusted to confirm on its own would be here. An empty queue means every proposal has been decided."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((pair) => {
              const key = pairKey(pair);
              // The strongest row carries the grounds on the card; the others are
              // counted, each kept as its own row by the kernel.
              const [lead] = orderCandidates(pair.candidates);
              if (!lead) return null;
              return (
                <LinkCandidateCard
                  key={key}
                  link={lead}
                  sources={pair.candidates.length}
                  alreadyConfirmed={pair.already_confirmed}
                  canDecide={canDecide}
                  busy={pending === key}
                  error={errors[key] ?? null}
                  onConfirm={(reason) => void decide(pair, 'confirm', reason)}
                  onReject={(reason) => void decide(pair, 'reject', reason)}
                />
              );
            })}
          </div>
        )}

        <p className="text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
          This queue is polled, not live — proposals are not on the event feed, so it
          refreshes after a decision rather than streaming.
        </p>
      </div>
    </ScrollArea>
  );
}
