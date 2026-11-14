import { createFileRoute, redirect } from '@tanstack/react-router';
import { ToolsConsole } from '@/screens/tools/ToolsConsole';
import { RuntimeSection } from '@/screens/runtime/RuntimeSection';

export const Route = createFileRoute('/tools')({
  component: () => (
    <RuntimeSection>
      <ToolsConsole />
    </RuntimeSection>
  ),
  validateSearch: (search: Record<string, unknown>): { focus?: string; tab?: 'tools' | 'skills' } => {
    const out: { focus?: string; tab?: 'tools' | 'skills' } = {};
    if (typeof search.focus === 'string') out.focus = search.focus;
    if (search.tab === 'tools' || search.tab === 'skills') out.tab = search.tab;
    return out;
  },
  // The old "Skills" tab is gone; /skills is the one skills surface. Keep old
  // `/tools?tab=skills` links working by sending them there.
  beforeLoad: ({ search }) => {
    if (search.tab === 'skills') throw redirect({ to: '/skills' });
  },
});
