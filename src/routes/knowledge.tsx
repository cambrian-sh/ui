import { createFileRoute } from '@tanstack/react-router';
import { KnowledgeConsole } from '@/screens/knowledge/KnowledgeConsole';

export const Route = createFileRoute('/knowledge')({
  component: KnowledgeConsole,
  /**
   * `tab` selects the surface, `entity` the explorer's centre, `receipt` the
   * open evidence drawer.
   *
   * All three are search params rather than component state because each is a
   * thing an operator SENDS someone: "look at purchase_order/PO-800's
   * neighborhood" or "here is the receipt behind that number" is a link or it
   * is a paragraph of instructions — the same pattern as `?alert=` on /drift.
   */
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
    entity: typeof search.entity === 'string' ? search.entity : undefined,
    receipt: typeof search.receipt === 'string' ? search.receipt : undefined,
  }),
});
