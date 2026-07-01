/* Cambrian Web UI — the root layout route.
 *
 * Per UI-003 (TanStack Router file-based). The Shell (PRD-02) is the
 * root layout; all surface routes render inside its central column via
 * the <Outlet /> inside Shell.
 */
import { createRootRoute } from '@tanstack/react-router';
import { Shell } from '@/components/Shell';

export const Route = createRootRoute({
  component: Shell,
});
