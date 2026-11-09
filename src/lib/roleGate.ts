import { NAV_GROUPS } from '@/design-system/components/cambrian/nav-rail';
import type { Role } from '@/ipc/types';

/**
 * The route half of role gating (ADR-0142). The rail hides what a member cannot
 * reach (`entryAvailable(entry, caps, role)`); this stops a deep link, the
 * command palette or a stale tab from rendering an admin screen whose every
 * call would come back PermissionDenied. Same source of truth: the rail
 * entries marked `forMembers`, plus Settings (where a person signs out).
 */
const MEMBER_ROOTS: readonly string[] = [
  ...NAV_GROUPS.flatMap((g) => g.entries.filter((e) => e.forMembers).map((e) => e.path)),
  '/settings',
];

export function routeAllowedForRole(pathname: string, role: Role | null | undefined): boolean {
  if (role !== 'member') return true;
  if (pathname === '/' || pathname === '') return true;
  return MEMBER_ROOTS.some((root) => pathname === root || pathname.startsWith(root + '/'));
}

/** A one-line description of what the role may do, for the identity panel. */
export function roleSummary(role: Role | null | undefined): string {
  switch (role) {
    case 'operator':
      return 'Full console: reads and changes the deployment.';
    case 'viewer':
      return 'Read-only console: sees the deployment, cannot change it.';
    case 'member':
      return 'Your own chat, approvals and accounts. Ask an administrator for a console role to see more.';
    default:
      return '';
  }
}
