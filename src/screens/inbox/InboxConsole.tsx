import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Button,
  Badge,
  EmptyState,
  PageHeader,
  ErrorState,
  HITLInline,
  ReasonField,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetTitle,
  useReasonGate,
} from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { ago, formatUnixMs, useCommandGate } from '@/lib/useCommandGate';
import { KIND_LABEL, ontologyDraftIdOf, type InboxItem } from '@/lib/inbox';
import { refreshInbox, useInbox } from '@/lib/useInbox';
import { SkillDiff, ScanVerdict } from '@/screens/skills/SkillDiff';
import { FullScreenApproval } from './FullScreenApproval';
import { OntologyDraftPanel, ONTOLOGY_DRAFT_CAPABILITY } from './OntologyDraftPanel';
import { AccountItem } from './AccountItem';
import { AttentionItem } from './AttentionItem';
import { UnroutedApprovals } from './UnroutedApprovals';
import { DeliveryIntentsPanel } from './DeliveryIntentsPanel';
import { EscalationChain } from './EscalationChain';
import { describeRule, needsHierarchy } from '@/lib/approvalRules';

/**
 * The Inbox — every pending human decision in one place.
 *
 * Tool approvals and live skill-access requests arrive on the feed; skill
 * proposals and timed-out skill-access requests are read (they have no feed
 * event). `useInbox` merges them, and the rail badge is the same count.
 * Longest-waiting first: a run blocked on an approval is burning wall-clock time.
 */
const EMPTY_UNROUTED: never[] = [];

export function InboxConsole() {
  const inbox = useInbox();
  const isMobile = useBreakpoint() === 'mobile';
  const gate = useCommandGate('decide');
  const [open, setOpen] = useState<string | null>(null);

  const resolve = useMutation(ipc.resolveHITL);
  const answer = useMutation(ipc.answerApproval);
  const [refusal, setRefusal] = useState<string | null>(null);
  // ADR-0142: per-item "approve always" (a standing approval) choice.
  const [standing, setStanding] = useState<Record<string, boolean>>({});
  const caps = useStore(projectionStore, (s) => s.state?.capabilities ?? []);
  const addressed = caps.includes('addressed-approvals');
  const unrouted = useStore(projectionStore, (s) => s.state?.unrouted_approvals ?? EMPTY_UNROUTED);
  const selected = inbox.items.find((i) => i.key === open && i.hitl) ?? null;
  // ADR-0149 D2: the full draft behind an ontology_change approval. Read over the
  // substrate plane (capability-gated) and Operator-only on the kernel, so the
  // control exists only for an Operator on a kernel that advertises the plane.
  const role = useStore(projectionStore, (s) => s.state?.role ?? null);
  const canReadDrafts = role === 'operator' && caps.includes(ONTOLOGY_DRAFT_CAPABILITY);
  const [draftOpen, setDraftOpen] = useState<string | null>(null);
  const draftItem = canReadDrafts ? (inbox.items.find((i) => i.key === draftOpen && i.hitl) ?? null) : null;
  const draftButton = (item: InboxItem) => {
    const draftId = item.hitl ? ontologyDraftIdOf(item.hitl) : '';
    if (!canReadDrafts || !draftId) return null;
    return (
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setDraftOpen(item.key)}>
        Read the full draft
      </Button>
    );
  };

  const decideHitl = async (id: string, approve: boolean, reason: string) => {
    setRefusal(null);
    if (addressed) {
      // The kernel authorises the answer against the item's rule (ADR-0142 D11).
      const r = await answer.mutate({
        id,
        approve,
        standing: approve && Boolean(standing[id]),
        standing_ttl_seconds: 0,
        reason,
      });
      if (r && !r.ok) setRefusal(r.refusal || 'The kernel refused the answer.');
    } else {
      await resolve.mutate({ intervention_id: id, approve, reason });
    }
    setOpen(null);
    refreshInbox(); // an approved skill_access also resolves its request row
  };
  const busy = resolve.isLoading || answer.isLoading;
  const standingToggle = (item: InboxItem) =>
    item.hitl?.allow_standing && item.answerable !== false ? (
      <label className="flex items-center gap-2 text-[12px] text-[var(--fg-secondary)]">
        <input
          type="checkbox"
          checked={Boolean(standing[item.hitl.intervention_id])}
          onChange={(e) => setStanding((s) => ({ ...s, [item.hitl!.intervention_id]: e.target.checked }))}
        />
        Approve always: pre-approve this kind of action until I revoke it
      </label>
    ) : null;

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className={COLUMN}>
      <div aria-live="polite">
        <PageHeader
          className="px-0 pt-0"
          title="Inbox"
          meta={inbox.count > 0 ? <Badge variant="warn">{inbox.count} waiting</Badge> : undefined}
          description={
            inbox.count === 0
              ? 'Nothing is waiting on a decision.'
              : `${inbox.count} decision${inbox.count === 1 ? '' : 's'} waiting · longest waiting first`
          }
        />
      </div>

      {(resolve.error || answer.error || refusal || inbox.error) && (
        <div className="pb-3">
          <ErrorState
            reason={(resolve.error ?? answer.error ?? refusal ?? inbox.error) as string}
            whatToDo="Nothing was decided. Try again; the item stays here until the kernel confirms it."
          />
        </div>
      )}

      {inbox.count === 0 ? (
        <EmptyState
          className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)]"
          title="Nothing is waiting on you"
          body="Tool approvals, skill-access requests and skill proposals appear here as soon as an agent raises them."
        />
      ) : (
          <ul className="flex flex-col gap-5">
            {inbox.items.map((item) => (
              <li key={item.key}>
                {item.hitl ? (
                  isMobile ? (
                    <MobileHitlCard item={item} onOpen={() => setOpen(item.key)} />
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <ItemMeta item={item} />
                      {item.rule && item.hitl?.beneficiary && (
                        <EscalationChain rule={item.rule} beneficiary={item.hitl.beneficiary} />
                      )}
                      {standingToggle(item)}
                      {draftButton(item)}
                      <HITLInline
                        intervention={item.hitl}
                        disabledReason={gate ?? item.approve_blocked}
                        busy={busy}
                        onApprove={(id, reason) => void decideHitl(id, true, reason)}
                        onReject={(id, reason) => void decideHitl(id, false, reason)}
                      />
                    </div>
                  )
                ) : item.account ? (
                  <AccountItem item={item} />
                ) : item.attention ? (
                  <AttentionItem item={item} />
                ) : item.proposal ? (
                  <ProposalDecision item={item} disabledReason={gate} />
                ) : (
                  <AccessRequestDecision item={item} disabledReason={gate} />
                )}
              </li>
            ))}
          </ul>
      )}

      <UnroutedApprovals items={unrouted} />

      {/* ENG-1657: replies whose delivery is unknown or failed (contract 0118). */}
      {caps.includes('delivery-intents') && <DeliveryIntentsPanel />}

      {addressed && <StandingApprovals />}
        </div>
      </ScrollArea>

      {/* Irreversible actions get the whole screen and a slide on a phone. */}
      {selected?.hitl && selected.hitl.nature === 'destructive_command' && (
        <FullScreenApproval
          intervention={selected.hitl}
          disabledReason={gate ?? selected.approve_blocked}
          busy={busy}
          onApprove={(reason) => void decideHitl(selected.hitl!.intervention_id, true, reason)}
          onReject={(reason) => void decideHitl(selected.hitl!.intervention_id, false, reason)}
          onClose={() => setOpen(null)}
        />
      )}
      {draftItem?.hitl && (
        <OntologyDraftPanel
          draftId={ontologyDraftIdOf(draftItem.hitl)}
          interventionId={draftItem.hitl.intervention_id}
          disabledReason={gate ?? draftItem.approve_blocked}
          busy={busy}
          onApprove={(reason) => {
            setDraftOpen(null);
            void decideHitl(draftItem.hitl!.intervention_id, true, reason);
          }}
          onReject={(reason) => {
            setDraftOpen(null);
            void decideHitl(draftItem.hitl!.intervention_id, false, reason);
          }}
          onClose={() => setDraftOpen(null)}
        />
      )}
      <Sheet
        open={Boolean(selected?.hitl) && selected?.hitl?.nature !== 'destructive_command' && !draftItem}
        onOpenChange={(o) => !o && setOpen(null)}
      >
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto p-4">
          {selected?.hitl && (
            <>
              <SheetTitle className="sr-only">Decide {selected.title}</SheetTitle>
              {standingToggle(selected)}
              {draftButton(selected)}
              <HITLInline
                intervention={selected.hitl}
                disabledReason={gate ?? selected.approve_blocked}
                busy={busy}
                onApprove={(id, reason) => void decideHitl(id, true, reason)}
                onReject={(id, reason) => void decideHitl(id, false, reason)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Reading screens sit in one centred column (Studio redesign). */
const COLUMN = 'mx-auto flex w-full max-w-[880px] flex-col px-[var(--page-gutter)] pb-12 pt-7';

function ItemMeta({ item }: { item: InboxItem }) {
  const session = item.hitl?.session_id;
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-[var(--fg-muted)]">
      <span className="uppercase tracking-[0.08em]">{KIND_LABEL[item.kind]}</span>
      {item.rule && (
        <>
          <span aria-hidden="true">·</span>
          <span title={`Who may answer this approval (ADR-0142): ${describeRule(item.rule)}`}>
            answered by {describeRule(item.rule)}
            {needsHierarchy(item.rule) && ' — resolved from the organisation hierarchy'}
          </span>
        </>
      )}
      {item.agent_id && (
        <>
          <span aria-hidden="true">·</span>
          <span>{item.agent_id}</span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span>waiting {ago(item.since_ms)}</span>
      {session && (
        <>
          <span aria-hidden="true">·</span>
          <Link to="/tasks/$taskId" params={{ taskId: session }} className="hover:text-[var(--fg-primary)]">
            open the task
          </Link>
        </>
      )}
    </div>
  );
}

function CardShell({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-2.5 rounded-[var(--radius-xl)] p-[13px_14px] tint-wash tint-ring"
      style={{ '--tint': tone } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** Approve / deny with a mandatory reason. `extra` renders above the reason. */
function DecisionControls({
  id,
  disabledReason,
  approveBlocked,
  denyUnavailable,
  busy,
  approveLabel = 'Approve',
  denyLabel = 'Reject',
  onDecide,
  extra,
}: {
  id: string;
  disabledReason?: string;
  approveBlocked?: string;
  denyUnavailable?: string;
  busy: boolean;
  approveLabel?: string;
  denyLabel?: string;
  onDecide: (approve: boolean, reason: string) => void;
  extra?: React.ReactNode;
}) {
  const gate = useReasonGate();
  const blocked = Boolean(disabledReason);
  return (
    <div className="flex flex-col gap-2">
      {extra}
      <ReasonField gate={gate} id={`reason-${id}`} disabled={blocked || busy} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={blocked || busy || !gate.satisfied || Boolean(approveBlocked)}
          onClick={() => onDecide(true, gate.reason.trim())}
        >
          {approveLabel}
        </Button>
        {!denyUnavailable && (
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked || busy || !gate.satisfied}
            onClick={() => onDecide(false, gate.reason.trim())}
          >
            {denyLabel}
          </Button>
        )}
        {(disabledReason || approveBlocked || denyUnavailable) && (
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            {disabledReason ?? approveBlocked ?? denyUnavailable}
          </span>
        )}
      </div>
    </div>
  );
}

export function ProposalDecision({ item, disabledReason }: { item: InboxItem; disabledReason?: string }) {
  const p = item.proposal!;
  const [showDiff, setShowDiff] = useState(false);
  const [lock, setLock] = useState(false);
  const skills = useKernelQuery(['skills', 'full', true], () => ipc.listSkillsFull(true), { enabled: showDiff });
  const current = skills.data?.find((s) => s.name === p.name)?.body ?? '';
  const decide = useMutation(ipc.decideSkillProposal);

  return (
    <div className="flex flex-col gap-1.5">
      <ItemMeta item={item} />
      <CardShell tone={item.approve_blocked ? 'var(--status-err)' : 'var(--status-warn)'}>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-[15px] font-medium">{item.title}</h2>
          {p.base_version && (
            <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
              base {p.base_version} · current {p.current_version || '—'}
            </span>
          )}
        </div>
        {p.rationale && <p className="text-[12.5px] leading-[1.55] text-[var(--fg-secondary)]">{p.rationale}</p>}
        <ScanVerdict verdict={p.scan_verdict} findings={p.scan_findings} />
        {item.warning && <p className="text-[12px] text-[var(--status-warn)]">{item.warning}</p>}
        <button
          type="button"
          aria-expanded={showDiff}
          onClick={() => setShowDiff((v) => !v)}
          className="w-fit text-[12px] text-[var(--accent-bg)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {showDiff ? 'Hide the change' : 'Review the change'}
        </button>
        {showDiff &&
          (skills.isLoading ? (
            <p className="text-[12px] text-[var(--fg-muted)]">Loading the current version…</p>
          ) : (
            <SkillDiff before={p.base_version ? current : ''} after={p.skill_md} />
          ))}
        {decide.error && <ErrorState reason={decide.error} />}
        <DecisionControls
          id={p.id}
          busy={decide.isLoading}
          disabledReason={disabledReason}
          approveBlocked={item.approve_blocked}
          onDecide={async (approve, reason) => {
            const r = await decide.mutate({ proposal_id: p.id, approve, reason, lock_after_approve: lock });
            if (r) refreshInbox();
          }}
          extra={
            <label className="flex items-center gap-2 text-[12px] text-[var(--fg-secondary)]">
              <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
              Lock the skill against further agent edits after approving
            </label>
          }
        />
      </CardShell>
    </div>
  );
}

export function AccessRequestDecision({ item, disabledReason }: { item: InboxItem; disabledReason?: string }) {
  const r = item.request!;
  const grant = useMutation(ipc.grantSkill);
  return (
    <div className="flex flex-col gap-1.5">
      <ItemMeta item={item} />
      <CardShell tone="var(--status-warn)">
        <h2 className="text-[15px] font-medium">
          {r.agent_id} asks to use the skill {r.skill_name}
        </h2>
        {r.rationale && <p className="text-[12.5px] leading-[1.55] text-[var(--fg-secondary)]">{r.rationale}</p>}
        <p className="text-[11.5px] text-[var(--fg-muted)]">
          The live approval timed out at {formatUnixMs(r.requested_at_unix_ms)}
          {r.run_id ? ` (run ${r.run_id})` : ''}. Granting lasts until revoked.
        </p>
        {grant.error && <ErrorState reason={grant.error} />}
        <DecisionControls
          id={r.id}
          busy={grant.isLoading}
          disabledReason={disabledReason}
          denyUnavailable={item.deny_unavailable}
          approveLabel="Grant"
          onDecide={async (_approve, reason) => {
            const ok = await grant.mutate({ agent_id: r.agent_id, skill_name: r.skill_name, reason });
            if (ok) refreshInbox();
          }}
        />
      </CardShell>
    </div>
  );
}

function MobileHitlCard({ item, onOpen }: { item: InboxItem; onOpen: () => void }) {
  const tone = item.destructive ? 'var(--status-err)' : 'var(--status-warn)';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full flex-col gap-2 rounded-[var(--radius-xl)] p-[13px_14px] text-left',
        'tint-wash tint-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
      )}
      style={{ '--tint': tone } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: tone }}>
          {KIND_LABEL[item.kind]}
        </span>
        <span className="font-mono text-[10px] text-[var(--fg-muted)]">{ago(item.since_ms)}</span>
      </div>
      <p className="text-[15px] leading-[1.4] text-[var(--fg-primary)]">{item.title}</p>
      <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{item.agent_id}</span>
    </button>
  );
}

/**
 * ADR-0142: my standing approvals — "approve once, pre-approved until revoked
 * or expired". Listed and revocable here; every revoke is audited by the kernel.
 */
export function StandingApprovals() {
  const list = useKernelQuery(['inbox', 'standing-approvals'], () => ipc.listStandingApprovals(false));
  const revoke = useMutation(ipc.revokeStandingApproval);
  const rows = list.data ?? [];
  if (list.error || rows.length === 0) return null;
  return (
    <section aria-labelledby="standing-h" className="pt-6">
      <h2 id="standing-h" className="mb-2 text-[13px] font-medium">
        Standing approvals
      </h2>
      {revoke.error && <ErrorState reason={revoke.error} />}
      <ul className="flex flex-col gap-1.5">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-mono">{s.action_class}</span>
            <span className="text-[var(--fg-secondary)]">{s.resource}</span>
            <span className="text-[var(--fg-muted)]">
              granted by {s.granted_by} · used {s.use_count}× ·{' '}
              {s.expires_at_unix_ms ? `until ${formatUnixMs(s.expires_at_unix_ms)}` : 'until revoked'}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={revoke.isLoading}
              onClick={async () => {
                await revoke.mutate(s.id, 'revoked from the inbox');
                refreshInbox();
              }}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
