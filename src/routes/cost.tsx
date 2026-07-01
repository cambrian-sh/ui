/* Cost & Energy route.
 *
 * The spend ledger, the MaxEnergy cap, and the LLM health signals. The
 * circuit-breaker state is the first read when cost spikes.
 *
 * Surfaces here:
 *  - Spend by Session / by Step / by Agent (last 24h, 7d, 30d)
 *  - MaxEnergy per Step (cost cap; exceeding it defers to the cheapest
 *    available model or triggers HITL)
 *  - Circuit-breaker state (ok / warn / err)
 *  - LLMProvider health feed (LLMHealthOp events)
 *
 * Per PRD story 18: "As an operator, I can see where the money went and what
 * the cap is on the next step."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Cost() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Cost & Energy</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          The spend ledger, the per-Step MaxEnergy cap, and the LLMProvider
          health feed. Circuit-breaker state is the first read on a spike.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spend rate</CardTitle>
            <CardDescription>USD per hour, last 1h</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">$0.00</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Circuit breaker</CardTitle>
            <CardDescription>LlmProvider upstream health</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-ok)]" />
              <span className="text-sm">ok</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">MaxEnergy (default)</CardTitle>
            <CardDescription>Per-Step cost cap</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">$0.50</div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-15.
      </p>
    </div>
  );
}
export default Cost;

export const Route = createFileRoute('/cost')({
  component: Cost,
});
