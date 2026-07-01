/* Agents route — the Audience.
 *
 * All registered AgentDefinitions. Trait determines the Gatekeeper path and
 * the Auction bid strategy. Merit (SuccessRate × TrustScore × 1/Latency)
 * drives selection; the ProfileAggregator updates it every 5 minutes.
 *
 * Surfaces here:
 *  - Trait filter (Cognitive / Model / Daemon)
 *  - Per-agent card: id, capabilities, manifest formats, TrustScore, live
 *  - Provisional banner (cold-start, 0.6× Merit)
 *  - Tier-1 / Tier-2 disclosure per agent
 *
 * Per PRD story 22: "As an operator, I can see every agent and its current
 * merit."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Agents() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          The Audience — every registered <code className="font-mono text-xs">AgentDefinition</code>.
          TraitCognitive bids dynamically via gRPC Proposal; TraitTool injects
          a static bid on capability match; TraitModel adds a cost penalty.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(["Cognitive", "Tool", "Model", "Daemon"] as const).map((trait) => (
          <Card key={trait}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Trait{trait}</span>
                <span className="rounded-sm bg-[var(--bg-elevated)] px-2 py-0.5 text-xs font-normal text-[var(--fg-muted)]">
                  0
                </span>
              </CardTitle>
              <CardDescription>
                {trait === "Cognitive" && "Full 3-layer Gatekeeper; dynamic bidding."}
                {trait === "Tool" && "Layer 1 only; static Confidence=1.0, Latency=5ms."}
                {trait === "Model" && "Layer 1 + Layer 3 with cost-penalty Merit."}
                {trait === "Daemon" && "Long-running reactive agent; Watch-triggered."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5 text-xs text-[var(--fg-muted)]">
                <div className="flex justify-between">
                  <span>TrustScore</span>
                  <span className="font-mono tabular-nums text-[var(--fg-secondary)]">—</span>
                </div>
                <div className="flex justify-between">
                  <span>SuccessRate</span>
                  <span className="font-mono tabular-nums text-[var(--fg-secondary)]">—</span>
                </div>
                <div className="flex justify-between">
                  <span>Latency median</span>
                  <span className="font-mono tabular-nums text-[var(--fg-secondary)]">—</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-14.
      </p>
    </div>
  );
}
export default Agents;

export const Route = createFileRoute('/agents')({
  component: Agents,
});
