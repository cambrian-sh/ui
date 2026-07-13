

import { createFileRoute } from '@tanstack/react-router';
import { ToolsSkillsConsole } from '@/screens/tools/ToolsSkillsConsole';

export const Route = createFileRoute('/tools')({
  validateSearch: (search: Record<string, unknown>) => ({
    focus: search.focus as string | undefined,
    tab: search.tab as 'tools' | 'skills' | undefined,
  }),
  component: ToolsSkillsConsole,
});
