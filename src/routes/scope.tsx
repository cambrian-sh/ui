import { createFileRoute } from '@tanstack/react-router';
import { AccessPolicyConsole } from '@/screens/scope/AccessPolicyConsole';

// Access Policy (ADR-0085/0086/0087) — the UI's first premium surface.
//
// The route keeps its `/scope` path: it is the same subject, deep links in the
// wild still resolve, and the screen itself decides which panes exist based on
// the `access-policy` capability. `tab` is in the URL so an operator can send a
// colleague straight to the explanation they are looking at.
export const Route = createFileRoute('/scope')({
  validateSearch: (search: Record<string, unknown>) => ({
    focus: search.focus as string | undefined,
    tab: search.tab as string | undefined,
  }),
  component: AccessPolicyConsole,
});
