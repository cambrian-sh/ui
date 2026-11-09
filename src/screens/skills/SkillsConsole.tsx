import { useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  ScrollArea,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import { ipc } from '@/ipc';
import type { SkillGrant, SkillLedgerEntry, SkillRecord } from '@/ipc/types';
import { queryClient } from '@/lib/queryClient';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { ago, formatUnixMs, useCapability, useCommandGate } from '@/lib/useCommandGate';
import { buildInbox } from '@/lib/inbox';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { ConfirmMutationDialog } from '@/screens/tasks/ConfirmMutationDialog';
import { ProposalDecision } from '@/screens/inbox/InboxConsole';
import { refreshInbox } from '@/lib/useInbox';

export type SkillsTab = 'catalog' | 'proposals' | 'ledger' | 'grants';

const STATE_TONE: Record<string, string> = {
  active: 'var(--status-live)',
  stale: 'var(--status-warn)',
  archived: 'var(--status-idle)',
};

const SKILLS_KEY = ['skills', 'full'] as const;
const refreshSkills = () => void queryClient.invalidateQueries({ queryKey: ['skills'] });

/**
 * Skills (ADR-0139 D13 + skill grants).
 *
 * A skill IS its instructions, so the catalog leads with what each one says and
 * how it is doing (version, trust class, lifecycle state, use and success
 * counts, lock); proposals are reviewed as a diff against the current version
 * with the scan verdict beside it; the ledger is append-only and every
 * restorable entry can be rolled back to; grants are per agent.
 *
 * Capability-gated per tab: `skills-read` (catalog), `skills-lifecycle`
 * (proposals, ledger, lock, lifecycle fields) and `skill-grants` (grants).
 */
export function SkillsConsole({
  tab = 'catalog',
  onTab,
}: {
  tab?: SkillsTab;
  onTab?: (t: SkillsTab) => void;
}) {
  const [local, setLocal] = useState<SkillsTab>(tab);
  const current = onTab ? tab : local;
  const setTab = (t: SkillsTab) => (onTab ? onTab(t) : setLocal(t));
  const lifecycle = useCapability('skills-lifecycle');
  const grants = useCapability('skill-grants');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex-none px-[26px] pb-2 pt-4">
        <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">Skills</h1>
        <p className="mt-1 max-w-[720px] text-[12.5px] text-[var(--fg-muted)]">
          What agents know how to do. Agents can propose new skills and edits; nothing an agent proposes is
          active until someone approves it here or in the Inbox.
        </p>
      </header>
      <Tabs value={current} onValueChange={(v) => setTab(v as SkillsTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-[26px] w-fit">
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="grants">Grants</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="min-h-0 flex-1">
          <CatalogTab lifecycle={lifecycle} />
        </TabsContent>
        <TabsContent value="proposals" className="min-h-0 flex-1">
          {lifecycle ? <ProposalsTab /> : <Absent capability="skills-lifecycle" what="Agent-proposed skills" />}
        </TabsContent>
        <TabsContent value="ledger" className="min-h-0 flex-1">
          {lifecycle ? <LedgerTab skillName="" /> : <Absent capability="skills-lifecycle" what="The skill ledger" />}
        </TabsContent>
        <TabsContent value="grants" className="min-h-0 flex-1">
          {grants ? <GrantsTab /> : <Absent capability="skill-grants" what="Per-agent skill grants" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Absent({ capability, what }: { capability: string; what: string }) {
  return (
    <EmptyState
      title={`${what} are not served by this kernel`}
      body={`The kernel does not advertise "${capability}" — its store is not wired in this deployment. That is a valid configuration, not a fault.`}
    />
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] tint-fill tint-ring"
      style={{ '--tint': tone, color: tone } as React.CSSProperties}
    >
      {children}
    </span>
  );
}

// ── Catalog ────────────────────────────────────────────────────────────────

function CatalogTab({ lifecycle }: { lifecycle: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const skills = useKernelQuery([...SKILLS_KEY, showArchived], () => ipc.listSkillsFull(showArchived));

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (skills.data ?? []).filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [skills.data, query]);
  const chosen = list.find((s) => s.name === selected) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-none flex-wrap items-center gap-3 px-[26px] py-3">
          <Input
            aria-label="Filter skills"
            placeholder="Filter by name or description"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 max-w-[320px]"
          />
          {lifecycle && (
            <label className="flex items-center gap-2 text-[12px] text-[var(--fg-secondary)]">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Include archived
            </label>
          )}
          <span className="font-mono text-[11px] text-[var(--fg-muted)]">{list.length} skills</span>
        </div>
        {skills.error ? (
          <div className="px-[26px]">
            <ErrorState reason={skills.error.message} whatToDo="The catalog could not be read. It is retried when the kernel reconnects." />
          </div>
        ) : skills.isLoading ? (
          <div className="flex flex-col gap-2 px-[26px]">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="No skills" body="This kernel serves no skills matching that filter." />
        ) : (
          <ScrollArea className="flex-1">
            <ul className="flex flex-col px-[18px] pb-6" aria-label="Skills">
              {list.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.name === selected ? null : s.name)}
                    aria-pressed={s.name === selected}
                    className={cn(
                      'grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-2 text-left',
                      'hover:bg-[var(--list-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                      s.name === selected && 'bg-[color-mix(in_srgb,var(--accent-bg)_12%,transparent)]',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{s.name}</span>
                      {s.version && <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">v{s.version}</span>}
                      {s.locked && <Pill tone="var(--fg-secondary)">locked</Pill>}
                    </span>
                    <span className="flex items-center gap-2">
                      {s.lifecycle_state && (
                        <Pill tone={STATE_TONE[s.lifecycle_state] ?? 'var(--fg-muted)'}>{s.lifecycle_state}</Pill>
                      )}
                      {s.source && <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{s.source}</span>}
                    </span>
                    <span className="truncate text-[12px] text-[var(--fg-secondary)]">{s.description}</span>
                    {lifecycle && (
                      <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                        {s.use_count} uses · {s.use_count ? Math.round((s.success_count / s.use_count) * 100) : 0}% ok
                        {s.last_used_at_unix_ms ? ` · ${ago(s.last_used_at_unix_ms)} ago` : ''}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>
      {chosen && <SkillPanel skill={chosen} lifecycle={lifecycle} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SkillPanel({ skill, lifecycle, onClose }: { skill: SkillRecord; lifecycle: boolean; onClose: () => void }) {
  const gate = useCommandGate('lock a skill');
  const [confirm, setConfirm] = useState(false);
  const lock = useMutation(ipc.setSkillLock);
  return (
    <aside
      aria-label={`Skill ${skill.name}`}
      className="flex w-[min(460px,45%)] flex-none flex-col bg-[var(--bg-surface)] shadow-[inset_1px_0_0_var(--border-subtle)]"
    >
      <div className="flex items-center gap-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <h2 className="flex-1 truncate text-[15px] font-medium">{skill.name}</h2>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close skill detail">
          Close
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-[var(--fg-muted)]">Version</dt>
            <dd className="font-mono">{skill.version || '—'}</dd>
            <dt className="text-[var(--fg-muted)]">Source</dt>
            <dd>{skill.source || '—'}</dd>
            {lifecycle && (
              <>
                <dt className="text-[var(--fg-muted)]">State</dt>
                <dd>
                  {skill.lifecycle_state || '—'} since {formatUnixMs(skill.state_changed_at_unix_ms)}
                  {skill.exempt_reason && ` · exempt (${skill.exempt_reason})`}
                </dd>
                <dt className="text-[var(--fg-muted)]">Usage</dt>
                <dd>
                  {skill.use_count} loads, {skill.success_count} in completed runs · last {formatUnixMs(skill.last_used_at_unix_ms)}
                </dd>
              </>
            )}
            <dt className="text-[var(--fg-muted)]">Tools</dt>
            <dd>{skill.tool_grants.length ? skill.tool_grants.join(', ') : 'none'}</dd>
            {skill.source_path && (
              <>
                <dt className="text-[var(--fg-muted)]">File</dt>
                <dd className="break-all font-mono text-[11px]">{skill.source_path}</dd>
              </>
            )}
          </dl>
          {lifecycle && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" disabled={Boolean(gate) || lock.isLoading} onClick={() => setConfirm(true)}>
                {skill.locked ? 'Unlock' : 'Lock against agent edits'}
              </Button>
              {gate && <span className="text-[11.5px] text-[var(--fg-muted)]">{gate}</span>}
            </div>
          )}
          {lock.error && <ErrorState reason={lock.error} />}
          <section>
            <h3 className="mb-1 text-[12px] font-medium text-[var(--fg-secondary)]">Instructions</h3>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md bg-[var(--bg-canvas)] p-2 font-mono text-[11.5px] leading-[1.55] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
              {skill.body || '(the kernel sent no body)'}
            </pre>
          </section>
          {lifecycle && (
            <section>
              <h3 className="mb-1 text-[12px] font-medium text-[var(--fg-secondary)]">History</h3>
              <LedgerTab skillName={skill.name} compact />
            </section>
          )}
        </div>
      </ScrollArea>
      <ConfirmMutationDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={skill.locked ? `Unlock ${skill.name}` : `Lock ${skill.name}`}
        description={
          skill.locked
            ? 'Agents may propose edits to this skill again. Proposals still need approval.'
            : 'Agent proposals to edit this skill will be refused. Operators can still edit or roll it back.'
        }
        confirmLabel={skill.locked ? 'Unlock' : 'Lock'}
        onConfirm={async (reason) => {
          await lock.mutate({ skill_name: skill.name, locked: !skill.locked, reason });
          refreshSkills();
          setConfirm(false);
        }}
      />
    </aside>
  );
}

// ── Proposals ──────────────────────────────────────────────────────────────

function ProposalsTab() {
  const [state, setState] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const gate = useCommandGate('decide a proposal');
  const proposals = useKernelQuery(['inbox', 'skill-proposals', state], () => ipc.listSkillProposals(state));
  const items = useMemo(
    () => (state === 'pending' ? buildInbox({ hitl: [], proposals: proposals.data ?? [] }) : []),
    [proposals.data, state],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none gap-1 px-[26px] py-3" role="group" aria-label="Proposal state">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <Button key={s} size="sm" variant={s === state ? 'default' : 'ghost'} aria-pressed={s === state} onClick={() => setState(s)}>
            {s}
          </Button>
        ))}
      </div>
      {proposals.error && (
        <div className="px-[26px]">
          <ErrorState reason={proposals.error.message} />
        </div>
      )}
      <ScrollArea className="flex-1">
        <ul className="flex max-w-[860px] flex-col gap-3 px-[26px] pb-6">
          {state === 'pending'
            ? items.map((item) => (
                <li key={item.key}>
                  <ProposalDecision item={item} disabledReason={gate} />
                </li>
              ))
            : (proposals.data ?? []).map((p) => (
                <li key={p.id} className="rounded-md p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-medium">{p.name}</span>
                    <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                      {p.state} by {p.decided_by || '—'} · {formatUnixMs(p.decided_at_unix_ms)} · proposed by {p.proposer_agent_id}
                    </span>
                  </div>
                  {p.decision_note && <p className="mt-1 text-[12px] text-[var(--fg-secondary)]">“{p.decision_note}”</p>}
                </li>
              ))}
          {!proposals.isLoading && (proposals.data ?? []).length === 0 && (
            <li>
              <EmptyState title={`No ${state} proposals`} />
            </li>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}

// ── Ledger ─────────────────────────────────────────────────────────────────

const MUTATION_LABEL: Record<string, string> = {
  created: 'created',
  updated: 'edited',
  approved: 'proposal approved',
  rejected: 'proposal rejected',
  locked: 'locked',
  unlocked: 'unlocked',
  state_changed: 'state changed',
  rolled_back: 'rolled back',
};

function LedgerTab({ skillName, compact }: { skillName: string; compact?: boolean }) {
  const ledger = useKernelQuery(['skills', 'ledger', skillName], () => ipc.listSkillLedger(skillName));
  const gate = useCommandGate('roll back a skill');
  const [target, setTarget] = useState<SkillLedgerEntry | null>(null);
  const rollback = useMutation(ipc.rollbackSkill);

  const body = (
    <ul className={cn('flex flex-col', !compact && 'max-w-[860px] px-[26px] pb-6 pt-3')} aria-label="Skill ledger">
      {(ledger.data ?? []).map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 shadow-[inset_0_-1px_0_var(--border-subtle)]">
          <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{formatUnixMs(e.at_unix_ms)}</span>
          {!skillName && <span className="text-[12.5px] font-medium">{e.skill_name}</span>}
          <span className="text-[12.5px]">{MUTATION_LABEL[e.mutation] ?? e.mutation}</span>
          {(e.from_version || e.to_version) && (
            <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
              {e.from_version || '∅'} → {e.to_version || '∅'}
            </span>
          )}
          {e.from_state !== e.to_state && (
            <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
              {e.from_state || '∅'} → {e.to_state}
            </span>
          )}
          <span className="text-[11.5px] text-[var(--fg-muted)]">by {e.actor}</span>
          {e.restorable && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-[11px]"
              disabled={Boolean(gate)}
              title={gate}
              onClick={() => setTarget(e)}
            >
              Restore this
            </Button>
          )}
          {e.reason && <p className="basis-full text-[11.5px] text-[var(--fg-secondary)]">{e.reason}</p>}
        </li>
      ))}
      {!ledger.isLoading && (ledger.data ?? []).length === 0 && (
        <li className="py-2 text-[12px] text-[var(--fg-muted)]">No ledger entries.</li>
      )}
    </ul>
  );

  return (
    <>
      {ledger.error && <ErrorState reason={ledger.error.message} />}
      {rollback.error && <ErrorState reason={rollback.error} />}
      {compact ? body : <ScrollArea className="h-full">{body}</ScrollArea>}
      <ConfirmMutationDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `Restore ${target.skill_name} to ${target.to_version || 'this entry'}` : ''}
        description="The skill's content, version and lifecycle state are restored to what this entry recorded. The rollback is a new ledger entry; history is never rewritten."
        confirmLabel="Roll back"
        destructive
        onConfirm={async (reason) => {
          if (!target) return;
          await rollback.mutate({ skill_name: target.skill_name, ledger_entry_id: target.id, reason });
          refreshSkills();
          setTarget(null);
        }}
      />
    </>
  );
}

// ── Grants ─────────────────────────────────────────────────────────────────

function GrantsTab() {
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const gate = useCommandGate('change grants');
  const grants = useKernelQuery(['skills', 'grants', includeRevoked], () =>
    ipc.listSkillGrants({ include_revoked: includeRevoked, request_state: 'all' }),
  );
  const skills = useKernelQuery(SKILLS_KEY, () => ipc.listSkillsFull(false));
  const agents = useStore(projectionStore, (s) => s.state?.agents ?? []);
  const [agent, setAgent] = useState('');
  const [skill, setSkill] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'grant' | 'revoke'; agent: string; skill: string } | null>(null);
  const grant = useMutation(ipc.grantSkill);
  const revoke = useMutation(ipc.revokeSkillGrant);

  const byAgent = useMemo(() => {
    const m = new Map<string, SkillGrant[]>();
    for (const g of grants.data?.grants ?? []) m.set(g.agent_id, [...(m.get(g.agent_id) ?? []), g]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [grants.data]);

  return (
    <ScrollArea className="h-full">
      <div className="flex max-w-[860px] flex-col gap-5 px-[26px] pb-8 pt-3">
        <form
          className="flex flex-wrap items-end gap-2 rounded-md p-3 shadow-[inset_0_0_0_1px_var(--border-subtle)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (agent && skill) setConfirm({ kind: 'grant', agent, skill });
          }}
        >
          <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
            Agent
            <Input list="grant-agents" value={agent} onChange={(e) => setAgent(e.target.value)} className="h-8 w-[200px]" placeholder="agent id" />
            <datalist id="grant-agents">
              {agents.map((a) => (
                <option key={a.id} value={a.id} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] text-[var(--fg-secondary)]">
            Skill
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="h-8 w-[220px] rounded-md border border-[var(--button-secondary-border)] bg-[var(--bg-surface)] px-2 text-[12.5px]"
            >
              <option value="">Choose a skill…</option>
              {(skills.data ?? []).map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" type="submit" disabled={Boolean(gate) || !agent || !skill}>
            Grant
          </Button>
          {gate && <span className="text-[11.5px] text-[var(--fg-muted)]">{gate}</span>}
        </form>

        <label className="flex items-center gap-2 text-[12px] text-[var(--fg-secondary)]">
          <input type="checkbox" checked={includeRevoked} onChange={(e) => setIncludeRevoked(e.target.checked)} />
          Show revoked grants
        </label>

        {(grants.error || grant.error || revoke.error) && (
          <ErrorState reason={(grants.error?.message ?? grant.error ?? revoke.error) as string} />
        )}

        {byAgent.length === 0 && !grants.isLoading ? (
          <EmptyState
            title="No grants"
            body="An agent's skills are its profile's skills plus its grants. Grants come from approved access requests, approved proposals, or here."
          />
        ) : (
          byAgent.map(([agentId, list]) => (
            <section key={agentId} aria-label={`Grants for ${agentId}`}>
              <h2 className="mb-1 text-[13px] font-medium">{agentId}</h2>
              <ul className="flex flex-col">
                {list.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-baseline gap-2 py-1.5 shadow-[inset_0_-1px_0_var(--border-subtle)]">
                    <span className={cn('text-[12.5px]', g.revoked_at_unix_ms && 'text-[var(--fg-muted)] line-through')}>{g.skill_name}</span>
                    <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                      via {g.source} · {g.granted_by} · {formatUnixMs(g.granted_at_unix_ms)}
                      {g.revoked_at_unix_ms ? ` · revoked by ${g.revoked_by}` : ''}
                    </span>
                    {!g.revoked_at_unix_ms && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-2 text-[11px]"
                        disabled={Boolean(gate)}
                        onClick={() => setConfirm({ kind: 'revoke', agent: g.agent_id, skill: g.skill_name })}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {(grants.data?.requests ?? []).length > 0 && (
          <section aria-label="Access requests">
            <h2 className="mb-1 text-[13px] font-medium">Access requests</h2>
            <ul className="flex flex-col">
              {grants.data!.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-2 py-1.5 shadow-[inset_0_-1px_0_var(--border-subtle)]">
                  <span className="text-[12.5px]">
                    {r.agent_id} → {r.skill_name}
                  </span>
                  <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                    {r.state} · {formatUnixMs(r.requested_at_unix_ms)}
                    {r.decided_by ? ` · ${r.decided_by}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <ConfirmMutationDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `${confirm.kind === 'grant' ? 'Grant' : 'Revoke'} ${confirm.skill} ${confirm.kind === 'grant' ? 'to' : 'from'} ${confirm.agent}` : ''}
        description={
          confirm?.kind === 'grant'
            ? 'The agent can load this skill on every run until the grant is revoked.'
            : 'The grant ends. A skill the agent profile lists stays available through the profile.'
        }
        confirmLabel={confirm?.kind === 'grant' ? 'Grant' : 'Revoke'}
        destructive={confirm?.kind === 'revoke'}
        onConfirm={async (reason) => {
          if (!confirm) return;
          const p = { agent_id: confirm.agent, skill_name: confirm.skill, reason };
          await (confirm.kind === 'grant' ? grant.mutate(p) : revoke.mutate(p));
          void queryClient.invalidateQueries({ queryKey: ['skills', 'grants'] });
          refreshInbox();
          setConfirm(null);
          setAgent('');
          setSkill('');
        }}
      />
    </ScrollArea>
  );
}
