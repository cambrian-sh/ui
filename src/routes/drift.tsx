import { createFileRoute } from '@tanstack/react-router';
import { DriftConsole } from '@/screens/drift/DriftConsole';

export const Route = createFileRoute('/drift')({
  component: DriftConsole,
  /**
   * `tab` selects the surface, `alert` selects the evidence.
   *
   * Both are search params rather than component state because both are things
   * an operator SENDS someone. An alert is the artifact most likely to be
   * forwarded, and "the 11-day slip on PO-4471" is a link or it is a paragraph
   * of instructions — and the inspector's existence is driven by `alert`, the
   * same pattern the rest of the console uses for `?step=` and `?focus=`.
   */
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
    alert: typeof search.alert === 'string' ? search.alert : undefined,
  }),
});
