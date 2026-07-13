

import { createFileRoute } from '@tanstack/react-router';
import { ScopeConsole } from '@/screens/scope/ScopeConsole';

export const Route = createFileRoute('/scope')({
  validateSearch: (search: Record<string, unknown>) => ({
    focus: search.focus as string | undefined,
  }),
  component: ScopeConsole,
});
