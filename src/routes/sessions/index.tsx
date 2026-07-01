/* Sessions console route — the global sessions list (PRD-06 §4).
 *
 * Per-session detail (the chat surface, PRD-03) lives at /sessions/$sessionId.
 * This route is the operator's home for the global view: filter, select, and
 * act on any session across the instance.
 */
import { createFileRoute } from '@tanstack/react-router';
import { SessionsConsole } from '@/screens/sessions/SessionsConsole';

export const Route = createFileRoute('/sessions/')({
  component: SessionsConsole,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === 'string' ? search.focus : undefined,
  }),
});
