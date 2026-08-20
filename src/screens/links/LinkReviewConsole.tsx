import { useCallback, useMemo, useState } from 'react';
import { EmptyState, ScrollArea } from '@/design-system/components';
import { ipc } from '@/ipc';
import { errorMessage } from '@/lib/errorMessage';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { Link } from '@/ipc/types';
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

/**
 * Link review — the identity plane's inbox (contract 0098).
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
  const projection = useStore(projectionStore);
  const capabilities = projection.state?.capabilities ?? [];
  const role = projection.state?.role ?? null;
  const available = capabilities.includes(LINKS_CAPABILITY);
  const canDecide = role === 'operator';

  const candidates = useKernelQuery(['link-candidates'], () => ipc.listLinkCandidates(), {
    enabled: available,
  });

  // Per-row, so a failure on one card cannot blank the queue — and so a second
  // card is still actionable while the first one is explaining itself.
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const decide = useCallback(
    async (link: Link, verb: 'confirm' | 'reject', reason: string) => {
      setPending(link.id);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[link.id];
        return next;
      });
      try {
        if (verb === 'confirm') {
          await ipc.confirmLink(link.id, reason, link.namespace_id);
        } else {
          await ipc.retractLink(link.id, reason, link.namespace_id);
        }
        await candidates.refetch();
      } catch (e) {
        setErrors((prev) => ({ ...prev, [link.id]: errorMessage(e) }));
      } finally {
        setPending(null);
      }
    },
    [candidates],
  );

  const rows = useMemo(() => orderCandidates(candidates.data ?? []), [candidates.data]);

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
          <h2 className="text-[15px] font-medium">Link review</h2>
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
          <h2 className="text-[17px] font-medium leading-[1.25] tracking-[-0.01em]">
            Link review
          </h2>
          <p className="mt-1 text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
            {rows.length === 0
              ? 'Proposals a machine could not confirm on its own arrive here.'
              : `${rows.length} proposal${rows.length === 1 ? '' : 's'} waiting, strongest first. Confirming appends a human assertion; rejecting stamps the proposal retracted and never deletes it.`}
          </p>
        </header>

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            body="Producers propose links whenever data arrives; anything a mechanism was not trusted to confirm on its own would be here. An empty queue means every proposal has been decided."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((link) => (
              <LinkCandidateCard
                key={link.id}
                link={link}
                canDecide={canDecide}
                busy={pending === link.id}
                error={errors[link.id] ?? null}
                onConfirm={(reason) => void decide(link, 'confirm', reason)}
                onReject={(reason) => void decide(link, 'reject', reason)}
              />
            ))}
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
