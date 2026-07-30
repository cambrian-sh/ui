import { createFileRoute } from '@tanstack/react-router';
import { ToolsSkillsConsole } from '@/screens/tools/ToolsSkillsConsole';
import { RuntimeSection } from '@/screens/runtime/RuntimeSection';

export const Route = createFileRoute('/tools')({
  component: () => (
    <RuntimeSection>
      <ToolsSkillsConsole />
    </RuntimeSection>
  ),
  validateSearch: (
    search: Record<string, unknown>,
  ): { focus?: string; tab?: 'tools' | 'skills' } => {
    const out: { focus?: string; tab?: 'tools' | 'skills' } = {};
    if (typeof search.focus === 'string') out.focus = search.focus;
    if (search.tab === 'tools' || search.tab === 'skills') out.tab = search.tab;
    return out;
  },
});
