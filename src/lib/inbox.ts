import type { HITLIntervention, SkillAccessRequest, SkillProposal } from '@/ipc/types';
import type { AccountInboxEntry } from './accounts';
import type { AttentionItem } from '@/ipc/types-accounts';

/**
 * Every pending human decision, in one list.
 *
 * Three sources, three transports, one queue:
 *  - `pending_hitl` on the feed — dangerous-tool approvals and live skill-access
 *    requests (ApprovalHub; resolved with ResolveHITL). Pushed.
 *  - ListSkillGrants(request_state=pending) — a skill-access request whose live
 *    approval timed out; it waits for GrantSkill. Read, not pushed.
 *  - ListSkillProposals(state=pending) — agent-proposed skills awaiting
 *    DecideSkillProposal. Read, not pushed.
 *  - ListMyAccounts (capability `accounts`, ADR-0141) — MY sign-ins awaiting
 *    confirmation (phishing defence) and MY accounts to reconnect before my
 *    agents can continue (lib/accounts.ts accountInboxEntries). Read.
 *  - ListMyAttention (capability `accounts`, ADR-0141 D3) — ingresses PAUSED
 *    because their account is unusable: my personal ingest, plus the
 *    organisation's for an Operator. Read; each resolves itself once the
 *    account works again (nothing to approve or deny here).
 *
 * The badge in the rail is `inboxCount(...)`, so the number on every screen and
 * the rows on this one cannot disagree.
 */

export type InboxKind =
  | 'tool_approval'
  | 'skill_access'
  | 'skill_access_request'
  | 'skill_proposal'
  | 'account_confirm'
  | 'account_reconnect'
  | 'ingress_paused'
  | 'schedule_approval'
  | 'machine_consent'
  | 'account_approval'
  | 'publish_approval';

export interface InboxItem {
  /** Stable across re-reads: `<kind>:<source id>`. */
  key: string;
  kind: InboxKind;
  /** What is being asked for, in a few words. */
  title: string;
  /** The agent asking (or proposing). */
  agent_id: string;
  /** Epoch ms the request was raised; 0 when the source did not say. */
  since_ms: number;
  /** Irreversible if approved — drawn louder. */
  destructive: boolean;
  /** Approving is impossible (dangerous scan verdict); the reason why. */
  approve_blocked?: string;
  /** Rejecting has no RPC (a timed-out access request can only be granted). */
  deny_unavailable?: string;
  /** A warning that does not block (stale proposal, suspicious scan). */
  warning?: string;
  /** ADR-0142 D11: who may answer ('self | operator', 'role:compliance'); '' = pre-hub kernel. */
  rule?: string;
  /** False = shown for audit; the logged-in person is not an addressee. */
  answerable?: boolean;
  hitl?: HITLIntervention;
  request?: SkillAccessRequest;
  proposal?: SkillProposal;
  /** A personal account that needs its owner (account_confirm / account_reconnect). */
  account?: AccountInboxEntry;
  /** An ingress paused for its account (ingress_paused). */
  attention?: AttentionItem;
}

export const KIND_LABEL: Record<InboxKind, string> = {
  tool_approval: 'Tool approval',
  skill_access: 'Skill access',
  skill_access_request: 'Skill access (timed out)',
  skill_proposal: 'Skill proposal',
  account_confirm: 'Confirm connected account',
  account_reconnect: 'Reconnect account',
  ingress_paused: 'Ingress paused',
  schedule_approval: 'Schedule approval',
  machine_consent: 'Run on your machine',
  account_approval: 'Confirm connected account',
  publish_approval: 'Share to team',
};

/** ADR-0142 D11: the inbox kind of a hub item, by its wire kind. */
const HUB_KIND: Record<string, InboxKind> = {
  skill_access: 'skill_access',
  schedule: 'schedule_approval',
  machine_consent: 'machine_consent',
  choose_machine: 'machine_consent',
  account_confirm: 'account_approval',
  publish: 'publish_approval',
};

export function skillOfApproval(h: HITLIntervention): string {
  const raw = (h.proposed_action?.tool_name as string | undefined) ?? h.reason;
  return raw.startsWith('skill:') ? raw.slice('skill:'.length) : raw;
}

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function buildInbox(input: {
  hitl: readonly HITLIntervention[];
  requests?: readonly SkillAccessRequest[];
  proposals?: readonly SkillProposal[];
  accounts?: readonly AccountInboxEntry[];
  attention?: readonly AttentionItem[];
}): InboxItem[] {
  const items: InboxItem[] = [];
  const liveAccess = new Set<string>();

  for (const h of input.hitl) {
    const isSkill = h.kind === 'skill_access';
    // An assistant proposing a recurring task for the person it serves
    // (kernel capability "scheduled-tasks"); approving creates it, owned by them.
    const isSchedule = h.kind === 'schedule';
    if (isSkill) liveAccess.add(`${h.agent_id}\u0000${skillOfApproval(h)}`);
    // A pre-hub kernel sends no rule: every item was the operator's to answer.
    const answerable = !h.rule || h.answerable !== false;
    items.push({
      key: `hitl:${h.intervention_id}`,
      kind: HUB_KIND[h.kind ?? ''] ?? 'tool_approval',
      rule: h.rule ?? '',
      answerable,
      approve_blocked: answerable ? undefined : `Addressed to ${h.rule}; you can see it but not answer it.`,
      deny_unavailable: answerable ? undefined : `Addressed to ${h.rule}.`,
      title: isSkill
        ? `Use skill ${skillOfApproval(h)}`
        : isSchedule
          ? 'Set up a recurring task'
          : (h.proposed_action?.tool_name as string) || h.reason || 'Approval',
      agent_id: h.agent_id,
      since_ms: parseTime(h.raised_at),
      destructive: !isSkill && !isSchedule && h.nature === 'destructive_command',
      hitl: h,
    });
  }

  for (const r of input.requests ?? []) {
    if (r.state !== 'pending') continue;
    // The same ask is still live on the hub: one row, the actionable one.
    if (liveAccess.has(`${r.agent_id}\u0000${r.skill_name}`)) continue;
    items.push({
      key: `request:${r.id}`,
      kind: 'skill_access_request',
      title: `Use skill ${r.skill_name}`,
      agent_id: r.agent_id,
      since_ms: r.requested_at_unix_ms,
      destructive: false,
      deny_unavailable:
        'The kernel has no RPC to deny a timed-out request; it stays pending until granted.',
      request: r,
    });
  }

  for (const p of input.proposals ?? []) {
    if (p.state !== 'pending') continue;
    const stale = p.base_version !== '' && p.current_version !== '' && p.base_version !== p.current_version;
    items.push({
      key: `proposal:${p.id}`,
      kind: 'skill_proposal',
      title: p.base_version ? `Edit skill ${p.name}` : `New skill ${p.name}`,
      agent_id: p.proposer_agent_id,
      since_ms: p.created_at_unix_ms,
      destructive: false,
      approve_blocked:
        p.scan_verdict === 'dangerous'
          ? 'The scan marked this proposal dangerous; the kernel never approves it.'
          : stale
            ? `Proposed against ${p.base_version}, but the skill is now ${p.current_version}. The kernel will refuse the approval.`
            : undefined,
      warning: p.scan_verdict === 'suspicious' ? 'The scan flagged this proposal as suspicious.' : undefined,
      proposal: p,
    });
  }

  for (const a of input.attention ?? []) {
    items.push({
      key: `attention:${a.id}`,
      kind: 'ingress_paused',
      title: a.title || `Ingress ${a.consumer_name || a.consumer_id} paused (${a.reason})`,
      agent_id: '',
      since_ms: a.since_unix_ms,
      destructive: false,
      approve_blocked: 'Resolves by itself once the account is usable again; fix the account, not the ingress.',
      deny_unavailable: 'Nothing to deny: the ingress resumes when its account works.',
      attention: a,
    });
  }

  for (const e of input.accounts ?? []) {
    items.push({ key: e.key, kind: e.kind, title: e.title, agent_id: '', since_ms: e.since_ms, destructive: false, account: e });
  }

  // Longest-waiting first; unknown times last, then by key for stability.
  return items.sort((a, b) => {
    if (a.since_ms === 0 || b.since_ms === 0) return (a.since_ms === 0 ? 1 : 0) - (b.since_ms === 0 ? 1 : 0) || a.key.localeCompare(b.key);
    return a.since_ms - b.since_ms || a.key.localeCompare(b.key);
  });
}

/** The badge: decisions waiting on THIS person (audit-only items are not theirs). */
export function inboxCount(input: Parameters<typeof buildInbox>[0]): number {
  return buildInbox(input).filter((i) => i.answerable !== false).length;
}
