/* Shared hook — find the focused plan from the URL search param.
 *
 * Used by the PlansInFlight page to resolve the plan that should be
 * displayed in the inspector. If `focus` is present and matches a plan,
 * return it; otherwise return the first plan (or null).
 */
import { useSearch } from '@tanstack/react-router';
import type { PlanInFlight } from '@/ipc/types';

export function useFocusedPlan(
  plans: PlanInFlight[],
): PlanInFlight | null {
  const search = useSearch({ strict: false }) as { focus?: string };
  const focus = search.focus;

  if (focus && plans.length > 0) {
    const found = plans.find((p) => p.plan_id === focus);
    if (found) return found;
  }

  return plans[0] ?? null;
}