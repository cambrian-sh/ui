import { useEffect, useMemo, useRef } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { queryClient } from './queryClient';
import { useKernelQuery } from './useKernelQuery';
import { buildInbox, type InboxItem } from './inbox';
import { ACCOUNTS_CAPABILITY, accountInboxEntries } from './accounts';

export const PROPOSALS_KEY = ['inbox', 'skill-proposals'] as const;
export const REQUESTS_KEY = ['inbox', 'skill-access-requests'] as const;
export const ATTENTION_KEY = ['inbox', 'attention'] as const;

/** Re-read the two non-feed inbox sources (after a decision, or on a signal). */
export function refreshInbox(): void {
  void queryClient.invalidateQueries({ queryKey: ['inbox'] });
  void queryClient.invalidateQueries({ queryKey: ['accounts', 'mine'] });
}

/**
 * The inbox, aggregated: feed HITL (pushed) + skill proposals and timed-out
 * skill-access requests (read). Used by BOTH the rail badge and the Inbox
 * screen, so the two always agree.
 *
 * Proposals and access requests have no feed event (RPC gap, see
 * investigations/2026-11-06-operator-console-redesign.md §3), so they are
 * re-read on: mount, a reconnect, window focus, any audit record whose action
 * names a skill, and after this console's own decisions. That is event-driven,
 * not a poll.
 */
export function useInbox(): {
  items: InboxItem[];
  count: number;
  loading: boolean;
  error: string | null;
} {
  const state = useStore(projectionStore, (s) => s.state);
  const caps = state?.capabilities ?? [];
  const live = state?.connection.status === 'live';
  const hasLifecycle = caps.includes('skills-lifecycle');
  const hasGrants = caps.includes('skill-grants');
  const hasAccounts = caps.includes(ACCOUNTS_CAPABILITY);

  const proposals = useKernelQuery(PROPOSALS_KEY, () => ipc.listSkillProposals('pending'), {
    enabled: live && hasLifecycle,
  });
  const requests = useKernelQuery(
    REQUESTS_KEY,
    async () => (await ipc.listSkillGrants({ request_state: 'pending' })).requests,
    { enabled: live && hasGrants },
  );

  // My accounts (ADR-0141): the system pages' key, so one read serves both.
  const myAccounts = useKernelQuery(['accounts', 'mine'], () => ipc.listMyAccounts(), { enabled: live && hasAccounts });
  // Ingresses paused for their account (ADR-0141 D3), addressed to me.
  const attention = useKernelQuery(ATTENTION_KEY, () => ipc.listMyAttention(), { enabled: live && hasAccounts });

  // Audit records that may change what is pending.
  const audit = state?.audit_tail ?? [];
  const skillAuditCount = useMemo(
    // consumer_paused / consumer_resumed: an ingress paused or resumed for its account.
    () => audit.filter((a) => /skill|grant|proposal|consumer_/i.test(a.action_type)).length,
    [audit],
  );
  const lastSeen = useRef(skillAuditCount);
  useEffect(() => {
    if (skillAuditCount !== lastSeen.current) {
      lastSeen.current = skillAuditCount;
      refreshInbox();
    }
  }, [skillAuditCount]);

  useEffect(() => {
    const onFocus = () => refreshInbox();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const hitl = state?.pending_hitl;
  const items = useMemo(
    () =>
      buildInbox({
        hitl: hitl ?? [],
        requests: hasGrants ? requests.data ?? [] : [],
        proposals: hasLifecycle ? proposals.data ?? [] : [],
        accounts: hasAccounts ? accountInboxEntries(myAccounts.data) : [],
        attention: hasAccounts ? attention.data ?? [] : [],
      }),
    [hitl, requests.data, proposals.data, myAccounts.data, attention.data, hasAccounts, hasGrants, hasLifecycle],
  );

  const error = myAccounts.error?.message ?? proposals.error?.message ?? requests.error?.message ?? null;
  return {
    items,
    // ADR-0142 D11: the badge counts decisions waiting on THIS person; items an
    // operator sees for audit but may not answer are listed, not counted.
    count: items.filter((i) => i.answerable !== false).length,
    loading: myAccounts.isLoading || proposals.isLoading || requests.isLoading,
    error,
  };
}
