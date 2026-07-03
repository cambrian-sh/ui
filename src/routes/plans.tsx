/* Plans in Flight — the global plans console (PRD-06 §5).
 *
 * Every running plan across all sessions, sorted by start time. Click a row
 * to open the plan work surface (PRD-04) in the right inspector. The 1..9
 * hotkeys jump to the nth plan when the list has focus.
 */
import { createFileRoute } from '@tanstack/react-router';
import { PlansInFlight } from '@/screens/plans/PlansInFlight';

export const Route = createFileRoute('/plans')({
  component: PlansInFlight,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === 'string' ? search.focus : undefined,
  }),
});
