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
import { ScopeConsole } from '@/screens/scope/ScopeConsole';

export const Route = createFileRoute('/scope')({
  validateSearch: (search: Record<string, unknown>) => ({
    focus: search.focus as string | undefined,
  }),
  component: ScopeConsole,
});
