/* Lifecycle route — agent lifecycle states.
 *
 * AgentDefinition is the Genotype (static identity); Instance is the
 * Phenotype (running process). Instances boot, bind a UDS .sock, are
 * reactive to liveness (failure detected on RPC), and evict gracefully.
 *
 * Surfaces here:
 *  - Live Instance list per Genotype
 *  - Boot / shutdown controls
 *  - MaxEnergy per Step (per-step cost cap)
 *  - Daemon crash feed (premium)
 *
 * Per PRD story 23: "As an operator, I can see the live Instances of every
 * agent and their energy state."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Lifecycle() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Lifecycle</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          The Phenotype view. Each Instance is a running OS process (or A2A
          session) bound to a UDS <code className="font-mono text-xs">.sock</code>.
          Liveness is reactive — a failed RPC is a death.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(["Provisional", "Active", "Evicted"] as const).map((state) => (
          <Card key={state}>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{state}</CardTitle>
              <CardDescription>
                {state === "Provisional" && "Declaration passed, Interview pending."}
                {state === "Active" && "Interviewed; full Gatekeeper path."}
                {state === "Evicted" && "Gracefully shutdown or RPC-failed."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">0</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-15.
      </p>
    </div>
  );
}
export default Lifecycle;

export const Route = createFileRoute('/lifecycle')({
  component: Lifecycle,
});
