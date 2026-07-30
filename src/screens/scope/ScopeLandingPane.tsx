import { Button } from '@/design-system/components';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { cn } from '@/design-system/lib/utils';
import type { DecisionRecord, LinkSpec, PolicySpec } from '@/ipc/types';

export interface ScopeLandingPaneProps {
  /** Jump into another pane of this console. */
  onGo: (tab: string) => void;
}

/**
 * The Scope landing.
 *
 * The hero is **coverage**, not policy count. A policy count says how much
 * authoring has happened; coverage says whether the subsystem is doing anything.
 * Three facts, in the order that decides what the operator does next:
 *
 *  1. **Unlabelled documents.** No rule can reach a document that carries no
 *     label. This is the single most useful fact in the subsystem and it is
 *     currently nowhere in the UI.
 *  2. **Policies authored but never linked.** A policy linked to nothing applies
 *     to nobody, and today it looks identical to a working one.
 *  3. **The rollout split**, with journalled denials for the report-only ones —
 *     that count is the number that tells you it is safe to enforce.
 */
export function ScopeLandingPane({ onGo }: ScopeLandingPaneProps) {
  const corpus = useKernelQuery(['documents', 'total'], () =>
    ipc.listDocuments({ limit: 1 }),
  );
  const unlabelled = useKernelQuery(['documents', 'unlabelled'], () =>
    ipc.listDocuments({ limit: 1, unlabelled_only: true }),
  );
  const policies = useKernelQuery(['policies'], () => ipc.listPolicies());
  const links = useKernelQuery(['links'], () => ipc.listLinks());
  const denials = useKernelQuery(['decisions', 'denials'], () =>
    ipc.exportDecisions({ denials_only: true, limit: 500 }),
  );

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h2 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
          Scope &amp; Access
        </h2>
        <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
          Whether a boundary exists is a different question from whether it covers anything.
          These three answer the second one.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <CoverageCard
          total={corpus.data?.total_matching}
          unlabelled={unlabelled.data?.total_matching}
          loading={corpus.isLoading || unlabelled.isLoading}
          error={corpus.error ?? unlabelled.error}
          onGo={() => onGo('labels')}
        />
        <UnlinkedCard
          policies={policies.data}
          links={links.data}
          loading={policies.isLoading || links.isLoading}
          error={policies.error ?? links.error}
          onGo={() => onGo('policies')}
        />
        <RolloutCard
          policies={policies.data}
          denials={denials.data}
          loading={policies.isLoading || denials.isLoading}
          error={policies.error ?? denials.error}
          onGo={() => onGo('rollout')}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onGo('rule')}>
          Write a rule
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onGo('explain')}>
          Verify with Explain
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onGo('labels')}>
          Label documents
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onGo('ingress')}>
          Surfaces
        </Button>
      </div>
    </div>
  );
}

function CoverageCard({
  total,
  unlabelled,
  loading,
  error,
  onGo,
}: {
  total?: number;
  unlabelled?: number;
  loading: boolean;
  error: Error | null;
  onGo: () => void;
}) {
  const known = total != null && unlabelled != null;
  const bad = known && unlabelled > 0;

  return (
    <Card
      title="Unlabelled documents"
      tone={bad ? 'var(--status-warn)' : undefined}
      onGo={onGo}
      goLabel="Label them"
    >
      {loading ? (
        <Quiet>Counting…</Quiet>
      ) : error ? (
        <Quiet>
          The document listing is unavailable, so coverage is <strong>unknown</strong> — not
          zero.
        </Quiet>
      ) : !known ? (
        <Quiet>Unknown — this kernel does not serve the document listing.</Quiet>
      ) : (
        <>
          <Big tone={bad ? 'var(--status-warn)' : undefined}>
            {unlabelled.toLocaleString()}{' '}
            <span className="text-[14px] font-normal opacity-60">
              of {total.toLocaleString()}
            </span>
          </Big>
          <p className="text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
            {bad
              ? 'No rule can reach a document that carries no label. These are outside every boundary you have written — not denied, simply unreachable by policy.'
              : 'Every document carries at least one label, so every document is reachable by a rule.'}
          </p>
        </>
      )}
    </Card>
  );
}

function UnlinkedCard({
  policies,
  links,
  loading,
  error,
  onGo,
}: {
  policies?: PolicySpec[];
  links?: LinkSpec[];
  loading: boolean;
  error: Error | null;
  onGo: () => void;
}) {
  const linked = new Set((links ?? []).map((l) => l.policy_id));
  const unlinked = (policies ?? []).filter((p) => !linked.has(p.id));
  const bad = unlinked.length > 0;

  return (
    <Card
      title="Authored but not linked"
      tone={bad ? 'var(--status-warn)' : undefined}
      onGo={onGo}
      goLabel="Open policies"
    >
      {loading ? (
        <Quiet>Loading…</Quiet>
      ) : error ? (
        <Quiet>The policy set is unavailable, so this is unknown.</Quiet>
      ) : (
        <>
          <Big tone={bad ? 'var(--status-warn)' : undefined}>
            {unlinked.length}{' '}
            <span className="text-[14px] font-normal opacity-60">
              of {(policies ?? []).length}
            </span>
          </Big>
          <p className="text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
            {bad
              ? 'A policy linked to nothing applies to nobody. These are not boundaries — they are drafts that look exactly like working rules.'
              : 'Every policy is linked to at least one container.'}
          </p>
          {bad && (
            <ul className="flex flex-col gap-0.5">
              {unlinked.slice(0, 4).map((p) => (
                <li key={p.id} className="truncate font-mono text-[11px] text-[var(--fg-muted)]">
                  {p.name || p.id}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function RolloutCard({
  policies,
  denials,
  loading,
  error,
  onGo,
}: {
  policies?: PolicySpec[];
  denials?: DecisionRecord[];
  loading: boolean;
  error: Error | null;
  onGo: () => void;
}) {
  const reportOnly = (policies ?? []).filter((p) => p.mode === 'report_only');
  const enforcing = (policies ?? []).filter((p) => p.mode !== 'report_only');
  // The number that says whether enforcing is safe: how often a report-only
  // policy WOULD have denied something real.
  const wouldHaveDenied = (denials ?? []).filter((d) => d.report_only && d.would_have_denied);

  return (
    <Card title="Rollout" onGo={onGo} goLabel="Open rollout">
      {loading ? (
        <Quiet>Loading…</Quiet>
      ) : error ? (
        <Quiet>The policy set is unavailable, so this is unknown.</Quiet>
      ) : (
        <>
          <Big>
            {enforcing.length}
            <span className="text-[14px] font-normal opacity-60"> enforcing</span>
            <span className="mx-1.5 text-[14px] font-normal opacity-40">·</span>
            {reportOnly.length}
            <span className="text-[14px] font-normal opacity-60"> report-only</span>
          </Big>
          <p className="text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
            {denials == null ? (
              <>The decision journal is unavailable, so the report-only impact is unknown.</>
            ) : denials.length === 0 ? (
              <>
                The journal is empty, so there is nothing to replay. That is{' '}
                <strong>unknown</strong>, not <em>no impact</em>.
              </>
            ) : (
              <>
                {wouldHaveDenied.length} journalled decision
                {wouldHaveDenied.length === 1 ? '' : 's'} would have been denied by a report-only
                policy. That is the number that tells you whether enforcing is safe.
              </>
            )}
          </p>
        </>
      )}
    </Card>
  );
}

function Card({
  title,
  tone,
  children,
  onGo,
  goLabel,
}: {
  title: string;
  tone?: string;
  children: React.ReactNode;
  onGo: () => void;
  goLabel: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]',
        tone && 'tint-wash tint-ring',
      )}
      style={tone ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {title}
      </div>
      {children}
      <button
        type="button"
        onClick={onGo}
        className="mt-auto self-start text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
      >
        {goLabel} →
      </button>
    </div>
  );
}

function Big({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <div
      className="text-[23px] font-medium leading-[1.2] tracking-[-0.02em]"
      style={tone ? { color: tone } : undefined}
    >
      {children}
    </div>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] leading-[1.5] text-[var(--fg-muted)]">{children}</p>;
}
