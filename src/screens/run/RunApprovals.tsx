import { useMemo } from 'react';
import { ErrorState, HITLInline } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { HITLIntervention, PlanInFlight } from '@/ipc/types';
import { useMutation } from '@/lib/useMutation';
import { useCommandGate } from '@/lib/useCommandGate';
import { refreshInbox } from '@/lib/useInbox';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';

/**
 * Which pending approvals belong to this run.
 *
 * A step pause carries the session and plan. A dangerous-tool or skill-access
 * approval is raised by the ApprovalHub WITHOUT a session (cambrian-core
 * domain/tool_approval_controller.go), so it is matched by agent: an approval
 * from an agent that is running a step of this plan right now. That is an
 * inference, and the card says so (RPC gap: HITLRaisedOp.session_id unset for
 * hub approvals).
 */
export function approvalsForRun(
  pending: readonly HITLIntervention[],
  sessionId: string,
  plan: PlanInFlight | null | undefined,
): { hitl: HITLIntervention; inferred: boolean }[] {
  const running = new Set<string>();
  if (plan) {
    if (plan.active_agent) running.add(plan.active_agent);
    for (const s of plan.steps ?? []) if (s.status === 'running' && s.agent) running.add(s.agent);
  }
  const out: { hitl: HITLIntervention; inferred: boolean }[] = [];
  for (const h of pending) {
    if ((h.session_id && h.session_id === sessionId) || (plan && h.plan_id && h.plan_id === plan.plan_id)) {
      out.push({ hitl: h, inferred: false });
    } else if (!h.session_id && !h.plan_id && h.agent_id && running.has(h.agent_id)) {
      out.push({ hitl: h, inferred: true });
    }
  }
  return out;
}

/** Inline approval prompts for one run — the same decision the Inbox offers. */
export function RunApprovals({ sessionId, plan }: { sessionId: string; plan?: PlanInFlight | null }) {
  const pending = useStore(projectionStore, (s) => s.state?.pending_hitl ?? []);
  const gate = useCommandGate('decide');
  const resolve = useMutation(ipc.resolveHITL);
  const mine = useMemo(() => approvalsForRun(pending, sessionId, plan), [pending, sessionId, plan]);
  if (mine.length === 0) return null;

  const decide = async (id: string, approve: boolean, reason: string) => {
    await resolve.mutate({ intervention_id: id, approve, reason });
    refreshInbox();
  };

  return (
    <section aria-label="Waiting for your approval" className="flex max-w-[820px] flex-col gap-2">
      {mine.map(({ hitl, inferred }) => (
        <div key={hitl.intervention_id} className="flex flex-col gap-1">
          {inferred && (
            <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
              raised by {hitl.agent_id}, which is running a step of this plan
            </p>
          )}
          <HITLInline
            intervention={hitl}
            disabledReason={gate}
            busy={resolve.isLoading}
            onApprove={(id, reason) => void decide(id, true, reason)}
            onReject={(id, reason) => void decide(id, false, reason)}
          />
        </div>
      ))}
      {resolve.error && <ErrorState reason={resolve.error} />}
    </section>
  );
}
