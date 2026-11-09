import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useCapability } from '@/lib/useCommandGate';
import { needsHierarchy } from '@/lib/approvalRules';
import { ORG_DIRECTORY_CAPABILITY } from '@/lib/hierarchy';

/** "user:bob" → "bob" (the org plane takes the registry id). */
export function principalIdOf(ref: string): string {
  return ref.startsWith('user:') ? ref.slice(5) : ref;
}

/**
 * ADR-0142 D11 stage 2: for an approval routed by a relationship rule
 * (supervisor), the requester's manager chain — who is asked first and who it
 * escalates to on timeout. Read from the org-directory plane; rendered only
 * when that plane exists and the caller may read the chain (a member may read
 * only their own, so for them this stays silent rather than erroring).
 */
export function EscalationChain({ rule, beneficiary }: { rule: string; beneficiary: string }) {
  const org = useCapability(ORG_DIRECTORY_CAPABILITY);
  const id = principalIdOf(beneficiary);
  const enabled = org && Boolean(id) && needsHierarchy(rule);
  const chain = useKernelQuery(['org', 'chain', id], () => ipc.getOrgChain(id), { enabled, retry: false });
  if (!enabled || !chain.data) return null;
  const managers = chain.data.managers;
  if (managers.length === 0) {
    return <p className="text-[11px] text-[var(--status-warn)]">No manager in the hierarchy for {beneficiary}.</p>;
  }
  return (
    <p className="text-[11px] text-[var(--fg-muted)]">
      Escalation chain: {managers.map((m) => m.display_name || m.principal_id).join(' → ')}
    </p>
  );
}
