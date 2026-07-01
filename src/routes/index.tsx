/* Cambrian Web UI — the index route.
 *
 * Redirects / to /sessions (the default landing per PRD-02 §7).
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/sessions', search: { focus: undefined } });
  },
});
