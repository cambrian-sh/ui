import { useCallback, useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { DecisionRecord, PolicySpec, SimulationResult } from '@/ipc/types';
import {
  Button,
  EmptyState,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { cn } from '@/design-system/lib/utils';

interface RolloutPaneProps {
  policies: PolicySpec[];
  onChanged: () => void | Promise<void>;
}

function when(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

/**
 * Rollout — the half of the product that is a trust story rather than a feature.
 *
 * The promise is "prove it before you switch it on": take a policy that is
 * currently report-only, replay REAL journalled traffic through it, see exactly
 * who stops being able to do what, and only then enforce.
 */
export function RolloutPane({ policies, onChanged }: RolloutPaneProps) {
  return (
    <Tabs defaultValue="whatif" className="flex h-full min-h-0 flex-col">
      <TabsList className="mx-4 mt-3 w-fit">
        <TabsTrigger value="whatif">What-if</TabsTrigger>
        <TabsTrigger value="audit">Decision log</TabsTrigger>
      </TabsList>
      <TabsContent value="whatif" className="min-h-0 flex-1">
        <WhatIf policies={policies} onChanged={onChanged} />
      </TabsContent>
      <TabsContent value="audit" className="min-h-0 flex-1">
        <AuditLog />
      </TabsContent>
    </Tabs>
  );
}

function WhatIf({ policies, onChanged }: RolloutPaneProps) {
  const [candidateId, setCandidateId] = useState<string>('');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const candidate = policies.find((p) => p.id === candidateId) ?? null;
  const reportOnly = policies.filter((p) => p.mode === 'report_only');

  const run = async () => {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    try {
      // Simulating a report-only policy means asking "what if this were
      // enforced" — so the draft is the same policy with the mode flipped.
      setResult(
        await ipc.simulatePolicy({
          draft_policies: [{ ...candidate, mode: 'enforced' }],
          limit: 500,
        }),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const enforce = async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      await ipc.savePolicy({ ...candidate, mode: 'enforced' });
      await onChanged();
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="max-w-3xl space-y-4 p-4">
        <p className="text-sm text-[var(--fg-secondary)]">
          Replay recent real decisions through a policy as if it were enforced. Nothing is
          changed and the simulation itself is not recorded — asking cannot be the thing that
          changes the answer.
        </p>

        {policies.length === 0 ? (
          <EmptyState
            title="No policies to simulate"
            body="Author a policy first, ideally in report-only mode, and let some traffic accumulate."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="whatif-policy" className="text-xs text-[var(--fg-muted)]">
                  Policy
                </label>
                <Select value={candidateId} onValueChange={setCandidateId}>
                  <SelectTrigger id="whatif-policy" className="mt-1 h-8 w-64 text-sm">
                    <SelectValue placeholder="pick a policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {policies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.id}
                        {p.mode === 'report_only' ? ' (report-only)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => void run()} disabled={!candidate || busy}>
                {busy ? 'Replaying…' : 'Replay history'}
              </Button>
            </div>

            {reportOnly.length > 0 && (
              <p className="text-xs text-[var(--color-status-warn)]">
                {reportOnly.length} polic{reportOnly.length === 1 ? 'y is' : 'ies are'} in
                report-only: evaluated on every decision, blocking nothing.
              </p>
            )}
          </>
        )}

        {error && (
          <ErrorState
            reason={error}
            whatToDo="The decision journal may be empty on a freshly started kernel. Let some traffic through, then replay."
          />
        )}

        {result && (
          <>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-md)] border border-[var(--card-border)] bg-[var(--border-subtle)]">
              <Figure
                n={result.newly_denied}
                label="newly denied"
                tone={result.newly_denied > 0 ? 'err' : 'muted'}
              />
              <Figure
                n={result.newly_allowed}
                label="newly allowed"
                tone={result.newly_allowed > 0 ? 'warn' : 'muted'}
              />
              <Figure n={result.unchanged} label="unchanged" tone="muted" />
            </div>

            {result.newly_denied === 0 && result.newly_allowed === 0 ? (
              <p className="text-sm text-[var(--color-status-ok)]">
                Nothing in the replayed history changes. Enforcing this policy would have been
                invisible to every request the kernel has actually seen.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--card-border)]">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="bg-[var(--bg-surface)] text-left text-[var(--fg-muted)]">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Principal</th>
                      <th className="px-3 py-2 font-medium">Resource</th>
                      <th className="px-3 py-2 font-medium">Change</th>
                      <th className="px-3 py-2 font-medium">Because</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.decisions
                      .filter((d) => d.allowed_now !== d.allowed_under_draft)
                      .map((d, i) => (
                        <tr key={i} className="border-t border-[var(--border-subtle)]">
                          <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[var(--fg-muted)]">
                            {when(d.at_unix_ms)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--fg-secondary)]">{d.principal}</td>
                          <td className="px-3 py-1.5 text-[var(--fg-secondary)]">{d.resource}</td>
                          <td
                            className={cn(
                              'whitespace-nowrap px-3 py-1.5',
                              d.allowed_now
                                ? 'text-[var(--color-status-err)]'
                                : 'text-[var(--color-status-warn)]',
                            )}
                          >
                            {d.allowed_now ? 'would be denied' : 'would be allowed'}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--fg-muted)]">
                            {d.detail_under_draft || d.reason_under_draft}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {candidate?.mode === 'report_only' && (
              <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] pt-3">
                <Button onClick={() => void enforce()} disabled={busy}>
                  Enforce this policy
                </Button>
                <span className="text-xs text-[var(--fg-muted)]">
                  Flips it out of report-only. The blast radius above is what changes.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function Figure({ n, label, tone }: { n: number; label: string; tone: 'err' | 'warn' | 'muted' }) {
  return (
    <div className="bg-[var(--card-bg)] p-3">
      <div
        className={cn(
          'text-2xl tabular-nums',
          tone === 'err' && 'text-[var(--color-status-err)]',
          tone === 'warn' && 'text-[var(--color-status-warn)]',
          tone === 'muted' && 'text-[var(--fg-secondary)]',
        )}
      >
        {n}
      </div>
      <div className="text-xs text-[var(--fg-muted)]">{label}</div>
    </div>
  );
}

function AuditLog() {
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [denialsOnly, setDenialsOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRecords(await ipc.exportDecisions({ limit: 200, denials_only: denialsOnly }));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [denialsOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-[var(--fg-secondary)]">
            <input
              type="checkbox"
              checked={denialsOnly}
              onChange={(e) => setDenialsOnly(e.target.checked)}
            />
            Denials only
          </label>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={busy}>
            Refresh
          </Button>
          <span className="text-xs text-[var(--fg-muted)]">
            Denials are never sampled, so this view is complete for them.
          </span>
        </div>

        {error && (
          <ErrorState
            reason={error}
            whatToDo="The decision journal lives with the policy plugin. If the kernel has no plugin there is nothing to export."
          />
        )}

        {!error && records.length === 0 && (
          <EmptyState
            title="Nothing recorded yet"
            body={
              denialsOnly
                ? 'No decision has been denied. Uncheck “denials only” to see permitted access too.'
                : 'No decisions have been journalled yet.'
            }
          />
        )}

        {records.length > 0 && (
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--card-border)]">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="bg-[var(--bg-surface)] text-left text-[var(--fg-muted)]">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Principal</th>
                  <th className="px-3 py-2 font-medium">Surface</th>
                  <th className="px-3 py-2 font-medium">Resource</th>
                  <th className="px-3 py-2 font-medium">Outcome</th>
                  <th className="px-3 py-2 font-medium">Because</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-[var(--border-subtle)]">
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[var(--fg-muted)]">
                      {when(r.at_unix_ms)}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--fg-secondary)]">{r.principal}</td>
                    <td className="px-3 py-1.5 text-[var(--fg-muted)]">{r.surface}</td>
                    <td className="px-3 py-1.5 text-[var(--fg-secondary)]">{r.resource}</td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-3 py-1.5',
                        r.would_have_denied
                          ? 'text-[var(--color-status-warn)]'
                          : r.allowed
                            ? 'text-[var(--color-status-ok)]'
                            : 'text-[var(--color-status-err)]',
                      )}
                    >
                      {r.would_have_denied ? 'would deny' : r.allowed ? 'allowed' : 'denied'}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--fg-muted)]">
                      {r.detail ? `${r.reason}: ${r.detail}` : r.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
