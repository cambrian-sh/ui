/* Plans in Flight — the centre of gravity (PRD-02 §3.1).
 *
 * The ExecutionPlan DAG is the live working memory. When a plan runs, the
 * plan view is always visible (UI-IMPL-10) — chat and console are *around* it.
 *
 * Surfaces here:
 *  - Live DAG (Steps, status: WAIT/RUN/DONE/FAIL)
 *  - Active Step's winner + auction history
 *  - Pause / Inject / Replan controls
 *  - Cost ticker for the plan
 *
 * Per PRD story 12: "As an operator, I can watch a plan execute step by step."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Plans() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Plans in Flight</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          The Substrate's working memory. Each ExecutionPlan is a DAG of Steps;
          the Gatekeeper narrows the candidate set, the Auctioneer runs parallel
          Proposals, the winner's output becomes context for downstream Steps.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Live DAG</CardTitle>
            <CardDescription>Steps + edges; colour by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[var(--border-subtle)] text-xs text-[var(--fg-muted)]">
              Empty — no plan in flight
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active auction</CardTitle>
            <CardDescription>Bid panel: Confidence × Trust ÷ Latency</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[var(--border-subtle)] text-xs text-[var(--fg-muted)]">
              Awaiting next step
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan cost</CardTitle>
            <CardDescription>USD this run; per-Step breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">$0.00</div>
            <p className="text-xs text-[var(--fg-muted)] mt-1">
              Per-Step ledger lands in UI-IMPL-12
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-10 (plan) + UI-IMPL-12 (auction drawer).
      </p>
    </div>
  );
}
export default Plans;

export const Route = createFileRoute('/plans')({
  component: Plans,
});
