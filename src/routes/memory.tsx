/* Memory route — the Memory console entry (PRD-05 + UI-IMPL-11).
 *
 * Per PRD-02 §4.1, the "Memory" entry in the nav rail lands here. The
 * centre column carries the filter bar + list + detail. The inline graph
 * view (UI-012) and the bulk-select / compare / supersede are P3 (PRD-05
 * §6) — they land in UI-IMPL-19+.
 */
import { createFileRoute } from '@tanstack/react-router';
import { MemoryExplorer } from '@/screens/memory/MemoryExplorer';

export const Route = createFileRoute('/memory')({
  component: MemoryExplorer,
});
