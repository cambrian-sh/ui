import { createFileRoute } from '@tanstack/react-router';
import { AgentsConsole } from '@/screens/agents/AgentsConsole';
import { RuntimeSection } from '@/screens/runtime/RuntimeSection';

export const Route = createFileRoute('/agents')({
  component: () => (
    <RuntimeSection>
      <AgentsConsole />
    </RuntimeSection>
  ),
  // Typed optional so linking here without a selection stays legal — the runtime
  // tabs and the rail both navigate with nothing focused.
  validateSearch: (search: Record<string, unknown>): { focus?: string } =>
    typeof search.focus === 'string' ? { focus: search.focus } : {},
});
