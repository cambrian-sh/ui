/* Scope route — agent scope + effective scope + k-anonymity.
 *
 * Each agent carries a Scope (required / any-of / forbidden tags) and a
 * k-anonymity floor. The kernel computes EffectiveScope = caller ∩ agent.
 * DefaultWriteTags is the agent's writing authority on LTM.
 *
 * Surfaces here:
 *  - Per-agent scope card: declared + effective side-by-side
 *  - Widen / narrow controls (operator-only, Tier-1, blast-radius preview)
 *  - Write-tag editor with the same preview guard
 *  - NegativeEdge ledger (constraints the LLM has been told NOT to cross)
 *
 * Per PRD story 20: "As an operator, I can widen or narrow an agent's scope
 * and see which active plans it would change."
 */

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/design-system/components";

export function Scope() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Scope</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Per-agent scope declarations and the kernel-computed EffectiveScope.
          Every widen / narrow is a Tier-1 mutation with a blast-radius preview
          before commit.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Agent scope</CardTitle>
          <CardDescription>
            Declared (the agent's manifest) vs. effective (caller ∩ agent,
            computed by the kernel). Diff is the live blast radius.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <div className="h-12 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)]" />
            <div className="h-12 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] opacity-60" />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--fg-muted)] mt-auto">
        Surface lands in UI-IMPL-15.
      </p>
    </div>
  );
}
export default Scope;

export const Route = createFileRoute('/scope')({
  component: Scope,
});
