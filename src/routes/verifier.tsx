/* Verifier Pool route.
 *
 * High-merit agents that independently score task completions. ~10% random
 * sample + 100% surveillance when TrustScore is below threshold. 5% of
 * verifier outputs are themselves re-verified (cross-verification).
 *
 * Surfaces here:
 *  - VerifierPool roster (those above the verifier_pool_threshold)
 *  - Live VerifierRound feed (task_id, winner, quality_score, critique)
 *  - TrustScore update trace (EWMA visualisation)
 *
 * Per PRD story 17: "As an operator, I can see who is verifying what and how
 * trust scores are moving."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Verifier() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Verifier Pool</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          High-Merit agents who independently score task completions. The
          sampling decision is FNV-1a hashed (~10% baseline) + 100% under
          surveillance. 5% cross-verification rate.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Live rounds</CardTitle>
          <CardDescription>
            Each <code className="font-mono text-xs">verifier_round</code> event:
            task, winner, quality score, bid confidence, critique text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[var(--border-subtle)] text-xs text-[var(--fg-muted)]">
            No rounds yet
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-15.
      </p>
    </div>
  );
}
export default Verifier;

export const Route = createFileRoute('/verifier')({
  component: Verifier,
});
