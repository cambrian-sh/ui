import { createFileRoute } from '@tanstack/react-router';
import { SkillsConsole, type SkillsTab } from '@/screens/skills/SkillsConsole';

const TABS: readonly SkillsTab[] = ['catalog', 'proposals', 'ledger', 'grants'];

function SkillsRoute() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <SkillsConsole tab={tab ?? 'catalog'} onTab={(t) => void navigate({ search: { tab: t }, replace: true })} />;
}

// ADR-0139 D13 + skill grants. Tabs gate themselves on skills-lifecycle /
// skill-grants; the rail entry needs any one of skills-read / those two.
export const Route = createFileRoute('/skills')({
  component: SkillsRoute,
  validateSearch: (search: Record<string, unknown>): { tab?: SkillsTab } =>
    TABS.includes(search.tab as SkillsTab) ? { tab: search.tab as SkillsTab } : {},
});
