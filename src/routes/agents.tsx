/* Agents console route — the global agents list (PRD-06 §6).
 *
 * Every registered agent. Trait determines the Gatekeeper path and
 * the Auction bid strategy. Detail shows genotype + history + mutating
 * actions (operator-only, gated behind the Blast-Radius panel).
 */
import { createFileRoute } from '@tanstack/react-router';
import { AgentsConsole } from '@/screens/agents/AgentsConsole';

export const Route = createFileRoute('/agents')({
  component: AgentsConsole,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === 'string' ? search.focus : undefined,
  }),
});
