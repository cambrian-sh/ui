
import { createFileRoute } from '@tanstack/react-router';
import { PlansInFlight } from '@/screens/plans/PlansInFlight';

export const Route = createFileRoute('/plans')({
  component: PlansInFlight,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === 'string' ? search.focus : undefined,
  }),
});
