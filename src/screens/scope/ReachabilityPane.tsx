import { useMemo, useState } from 'react';
import { Button } from '@/design-system/components';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { cn } from '@/design-system/lib/utils';
import type { AccessDecision, GroupSpec, IngressSpec, LinkSpec, PolicySpec } from '@/ipc/types';
import { DecisionCard } from './DecisionCard';
import {
  agreesWithKernel,
  evaluateCell,
  toDecision,
  type CellState,
  type CellVerdict,
  type Principal,
} from './reachability';
import type { Vocabulary } from './useVocabulary';

const CELL: Record<CellState, { short: string; label: string; colour: string }> = {
  allowed: { short: '✓', label: 'allowed', colour: 'var(--status-live)' },
  denied: { short: '✕', label: 'denied', colour: 'var(--status-err)' },
  denied_by_default: {
    short: '●',
    label: 'denied by default',
    colour: 'var(--status-warn)',
  },
  allowed_via_grant: {
    short: '◐',
    label: 'allowed via grant',
    colour: 'var(--color-accent-400)',
  },
  report_only_would_deny: {
    short: '!',
    label: 'report-only would deny',
    colour: 'var(--status-warn)',
  },
};

export interface ReachabilityPaneProps {
  vocabulary: Vocabulary;
}

/**
 * The reachability matrix: surfaces and groups down the side, labels across the
 * top, every cell a verdict.
 *
 * Answering "is this what I think it is" costs one Explain query per question
 * today. This answers the whole grid at once, and it is the screen an auditor
 * asks for.
 *
 * **The verdicts are computed in this console, not by the kernel.** That is the
 * trade this pane makes, and it is stated on the pane rather than buried:
 * client-side evaluation can disagree with the kernel, and a wrong "allowed"
 * cell is a security-shaped bug. So every cell can be checked against the real
 * `explainAccess` RPC in one click, and a disagreement is rendered as a fault —
 * loudly, because it means this module has drifted from the algebra it mirrors.
 */
export function ReachabilityPane({ vocabulary }: ReachabilityPaneProps) {
  const policies = useKernelQuery(['policies'], () => ipc.listPolicies());
  const links = useKernelQuery(['links'], () => ipc.listLinks());
  const groups = useKernelQuery(['groups'], () => ipc.listGroups());
  const ingresses = useKernelQuery(['ingresses'], () => ipc.listIngresses());

  const [selected, setSelected] = useState<{
    principal: Principal;
    tag: string;
    verdict: CellVerdict;
  } | null>(null);

  const principals: Principal[] = useMemo(() => {
    const fromSurfaces = (ingresses.data ?? []).map((i: IngressSpec) => ({
      id: `surface:${i.surface_kind}:${i.surface_id}`,
      label: `${i.surface_kind}:${i.surface_id}`,
    }));
    const fromGroups = (groups.data ?? []).map((g: GroupSpec) => ({
      id: `group:${g.id}`,
      label: g.name || g.id,
      groups: [g.id],
    }));
    return [...fromSurfaces, ...fromGroups];
  }, [ingresses.data, groups.data]);

  const labels = vocabulary.tags;

  const loading =
    policies.isLoading || links.isLoading || groups.isLoading || ingresses.isLoading;

  const verdictFor = (principal: Principal, tag: string) =>
    evaluateCell(
      principal,
      [tag],
      (policies.data ?? []) as PolicySpec[],
      (links.data ?? []) as LinkSpec[],
      (groups.data ?? []) as GroupSpec[],
      vocabulary.closed,
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div>
        <h2 className="text-[17px] font-medium leading-[1.25] tracking-[-0.01em]">
          Reachability
        </h2>
        {/* Never buried. A cell here is a prediction, not a decision. */}
        <p
          className="mt-1.5 rounded-md p-2.5 text-[12px] leading-[1.55] tint-wash tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">
            These verdicts are computed in this console, not by the kernel.
          </span>{' '}
          <span className="text-[var(--fg-secondary)]">
            The kernel enforces; this predicts. Click any cell and press{' '}
            <em>Check against the kernel</em> to confirm one for real — a disagreement is a
            bug in this console, and the kernel is right.
          </span>
        </p>
      </div>

      <Legend />

      {loading ? (
        <p className="text-[12.5px] text-[var(--fg-muted)]">Loading the policy set…</p>
      ) : principals.length === 0 || labels.length === 0 ? (
        <p className="text-[12.5px] text-[var(--fg-muted)]">
          {principals.length === 0
            ? 'No surfaces or groups are registered, so there is nothing to put down the side.'
            : 'The label vocabulary is empty, so there is nothing to put across the top.'}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="border-separate border-spacing-0 text-[11.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--bg-canvas)] p-2 text-left font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                  Reaches →
                </th>
                {labels.map((tag) => (
                  <th
                    key={tag}
                    className="p-2 text-left font-mono text-[10.5px] font-normal text-[var(--fg-secondary)]"
                  >
                    {vocabulary.closed.has(tag) && (
                      <span className="text-[var(--status-warn)]">● </span>
                    )}
                    {tag}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {principals.map((principal) => (
                <tr key={principal.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[220px] truncate bg-[var(--bg-canvas)] p-2 text-left font-mono text-[11px] font-normal text-[var(--fg-primary)]"
                  >
                    {principal.label}
                  </th>
                  {labels.map((tag) => {
                    const verdict = verdictFor(principal, tag);
                    const cell = CELL[verdict.state];
                    const isSelected =
                      selected?.principal.id === principal.id && selected?.tag === tag;
                    return (
                      <td key={tag} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => setSelected({ principal, tag, verdict })}
                          aria-label={`${principal.label} → ${tag}: ${cell.label}`}
                          className={cn(
                            'flex size-7 items-center justify-center rounded-sm font-mono text-[12px] transition-colors',
                            'hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                            isSelected && 'ring-2 ring-[var(--accent-bg)]',
                          )}
                          style={{
                            color: cell.colour,
                            background: `color-mix(in srgb, ${cell.colour} 12%, transparent)`,
                          }}
                        >
                          {cell.short}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <CellTrace
          principal={selected.principal}
          tag={selected.tag}
          verdict={selected.verdict}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--fg-muted)]">
      {/* Five states, so the legend is not optional. */}
      {(Object.keys(CELL) as CellState[]).map((state) => (
        <span key={state} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="flex size-4 items-center justify-center rounded-sm font-mono text-[10px]"
            style={{
              color: CELL[state].colour,
              background: `color-mix(in srgb, ${CELL[state].colour} 12%, transparent)`,
            }}
          >
            {CELL[state].short}
          </span>
          {CELL[state].label}
        </span>
      ))}
    </div>
  );
}

/**
 * One cell, traced — and checkable.
 *
 * The trace reuses `DecisionCard`, which is the same renderer Explain uses, so
 * a decision reads identically wherever it appears.
 */
function CellTrace({
  principal,
  tag,
  verdict,
  onClose,
}: {
  principal: Principal;
  tag: string;
  verdict: CellVerdict;
  onClose: () => void;
}) {
  const [kernel, setKernel] = useState<AccessDecision | null>(null);

  const check = useMutation(async () => {
    const decision = await ipc.explainAccess({
      principal_id: principal.id,
      resource_kind: 'memory',
      tags: [tag],
      effects: ['read'],
    });
    setKernel(decision);
    return decision;
  });

  const agrees = kernel ? agreesWithKernel(verdict, kernel) : null;

  return (
    <div className="flex-none rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11.5px] text-[var(--fg-secondary)]">
          {principal.label} → {tag}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          Close
        </button>
      </div>

      <DecisionCard decision={kernel ?? toDecision(verdict)} />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void check.mutate()}
          disabled={check.isLoading}
        >
          {check.isLoading ? 'Asking the kernel…' : 'Check against the kernel'}
        </Button>

        {check.error && (
          <span className="text-[11.5px] text-[var(--status-err)]">{check.error}</span>
        )}

        {agrees === true && (
          <span className="text-[11.5px] text-[var(--status-live)]">
            The kernel agrees — this cell is showing the real decision.
          </span>
        )}

        {/* A disagreement is not a warning, it is a defect in this console. */}
        {agrees === false && (
          <span className="text-[11.5px] text-[var(--status-err)]">
            The kernel DISAGREES. It is right and this matrix is wrong — treat every cell in
            this grid as unreliable until the evaluator is fixed.
          </span>
        )}
      </div>
    </div>
  );
}
