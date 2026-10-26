import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  EmptyState,
  ErrorState,
  HITLInline,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { consequenceOf, formatIdle, idleSeconds, NATURE_LABEL, NATURE_TONE } from '@/lib/hitl';
import { cn } from '@/design-system/lib/utils';
import type { HITLIntervention } from '@/ipc/types';
import { FullScreenApproval } from './FullScreenApproval';

/**
 * The approvals inbox.
 *
 * Before this screen existed, a HITL only appeared inside the chat of a session
 * the operator had already opened — so the one thing in the whole console that
 * genuinely blocks on a human was the one thing you had to go looking for. Now
 * the count is in the header and on the rail from every screen, and this is
 * where it lands.
 *
 * Ordering is longest-waiting first. A plan blocked on an approval is burning
 * wall-clock time, so "how long has this been stuck" is the priority, not when
 * it was raised relative to the others.
 */
export function InboxConsole() {
  const projection = useStore(projectionStore);
  const breakpoint = useBreakpoint();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const role = projection.state?.role ?? null;
  const connection = projection.state?.connection.status ?? 'down';
  const pending = projection.state?.pending_hitl ?? [];
  const plans = projection.state?.plans ?? [];

  const resolve = useMutation(ipc.resolveHITL);

  const ordered = useMemo(
    () => [...pending].sort((a, b) => idleSeconds(b) - idleSeconds(a)),
    [pending],
  );

  const sessionOfPlan = useMemo(
    () => new Map(plans.map((p) => [p.plan_id, p.session_id])),
    [plans],
  );

  // A Viewer's mutations are refused server-side; saying so up front is more
  // honest than a button that fails on click.
  const disabledReason =
    role === 'viewer'
      ? 'Operator role required to resolve an intervention.'
      : connection === 'reconnecting'
        ? 'Reconnecting — the kernel is not accepting commands right now.'
        : connection === 'down'
          ? 'Kernel unreachable.'
          : undefined;

  const decide = (interventionId: string, approve: boolean, reason: string) => {
    void resolve.mutate({ intervention_id: interventionId, approve, reason });
    setSelectedId(null);
  };

  const selected = ordered.find((h) => h.intervention_id === selectedId) ?? null;
  const isMobile = breakpoint === 'mobile';

  if (ordered.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <InboxHeader count={0} />
        <EmptyState
          title="Nothing is waiting on you"
          body="Interventions appear here the moment a plan raises one. Nothing polls — this list is folded from the kernel feed."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <InboxHeader count={ordered.length} />

      {resolve.error && (
        <div className="px-[26px] pt-3">
          <ErrorState
            reason={resolve.error}
            whatToDo="The intervention is still pending — nothing was decided. Try again, or open the task to see what the plan is waiting on."
          />
        </div>
      )}

      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-3 px-[26px] py-[22px]">
          {ordered.map((h) => (
            <li key={h.intervention_id}>
              {isMobile ? (
                <ApprovalCard
                  intervention={h}
                  sessionId={sessionOfPlan.get(h.plan_id) ?? null}
                  onOpen={() => setSelectedId(h.intervention_id)}
                />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <SessionLink
                    sessionId={sessionOfPlan.get(h.plan_id) ?? null}
                    planId={h.plan_id}
                  />
                  <HITLInline
                    intervention={h}
                    disabledReason={disabledReason}
                    busy={resolve.isLoading}
                    onApprove={(id, reason) => decide(id, true, reason)}
                    onReject={(id, reason) => decide(id, false, reason)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>

      {/* An irreversible action gets the whole screen and a slide, not a sheet
          and a tap: `destructive_command` is the class where undo does not
          exist, so the confirmation has to cost more than a thumb. */}
      {selected && selected.nature === 'destructive_command' && (
        <FullScreenApproval
          intervention={selected}
          disabledReason={disabledReason}
          busy={resolve.isLoading}
          onApprove={(reason) => decide(selected.intervention_id, true, reason)}
          onReject={(reason) => decide(selected.intervention_id, false, reason)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* On a phone a reversible decision gets the bottom sheet rather than a
          card in a scrolling list — approving should not be a thing you can do
          while scrolling past it. */}
      <Sheet
        open={Boolean(selected) && selected?.nature !== 'destructive_command'}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto p-4">
          {selected && (
            <>
              <SheetTitle className="sr-only">
                Resolve intervention {selected.intervention_id}
              </SheetTitle>
              <HITLInline
                intervention={selected}
                disabledReason={disabledReason}
                busy={resolve.isLoading}
                onApprove={(id, reason) => decide(id, true, reason)}
                onReject={(id, reason) => decide(id, false, reason)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InboxHeader({ count }: { count: number }) {
  return (
    <div className="flex-none px-[26px] pb-3.5 pt-4 shadow-[inset_0_-1px_0_var(--border-subtle)]">
      <h1 className="type-page-title">Inbox</h1>
      <p className="type-page-description mt-1">
        {count === 0
          ? 'Nothing is blocked on a decision.'
          : `${count} decision${count === 1 ? '' : 's'} blocking a plan · longest waiting first`}
      </p>
    </div>
  );
}

function SessionLink({
  sessionId,
  planId,
}: {
  sessionId: string | null;
  planId: string;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10.5px] text-[var(--fg-muted)]">
      <span>plan {planId.slice(0, 8)}</span>
      {sessionId && (
        <>
          <span aria-hidden="true">·</span>
          <Link
            to="/tasks/$taskId"
            params={{ taskId: sessionId }}
            className="hover:text-[var(--fg-primary)]"
          >
            open the session
          </Link>
        </>
      )}
    </div>
  );
}

function ApprovalCard({
  intervention,
  sessionId,
  onOpen,
}: {
  intervention: HITLIntervention;
  sessionId: string | null;
  onOpen: () => void;
}) {
  const tone = NATURE_TONE[intervention.nature];
  const toneVar = tone === 'err' ? 'var(--status-err)' : 'var(--status-warn)';
  const consequence = consequenceOf(intervention);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full flex-col gap-2 rounded-[var(--radius-xl)] p-[13px_14px] text-left',
        'tint-wash tint-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
      )}
      style={{ '--tint': toneVar } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="type-label inline-block first-letter:uppercase"
          style={{ color: toneVar }}
        >
          {NATURE_LABEL[intervention.nature]}
        </span>
        <span className="font-mono text-[10px] text-[var(--fg-muted)]">
          {formatIdle(idleSeconds(intervention))}
        </span>
      </div>
      <p className="text-[15px] leading-[1.4] text-[var(--fg-primary)]">
        {consequence.sentence}
      </p>
      <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
        {sessionId ? `session ${sessionId.slice(0, 8)}` : `plan ${intervention.plan_id.slice(0, 8)}`}
      </span>
    </button>
  );
}
