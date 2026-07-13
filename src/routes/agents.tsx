
import { createFileRoute } from '@tanstack/react-router';
import { AgentsConsole } from '@/screens/agents/AgentsConsole';

export const Route = createFileRoute('/agents')({
  component: AgentsConsole,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === 'string' ? search.focus : undefined,
  }),
});
