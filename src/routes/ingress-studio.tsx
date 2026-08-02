import { createFileRoute } from '@tanstack/react-router';
import { IngressStudioConsole } from '@/screens/ingress-studio/IngressStudioConsole';

export const Route = createFileRoute('/ingress-studio')({
  component: IngressStudioConsole,
  /**
   * `ingress` selects the source, `tab` the surface — search params rather
   * than component state because both are things an operator sends someone:
   * "look at the dry-run preview for github-main" is a link or it is a
   * paragraph of instructions.
   */
  validateSearch: (search: Record<string, unknown>) => ({
    ingress: typeof search.ingress === 'string' ? search.ingress : undefined,
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
});
