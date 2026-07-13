
import { createFileRoute } from '@tanstack/react-router';
import { SessionsConsole } from '@/screens/sessions/SessionsConsole';

export const Route = createFileRoute('/sessions/')({
  component: SessionsConsole,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === 'string' ? search.focus : undefined,
  }),
});
