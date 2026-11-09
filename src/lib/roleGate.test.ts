import { describe, expect, it } from 'vitest';
import { routeAllowedForRole, roleSummary } from '@/lib/roleGate';
import { NAV_GROUPS, entryAvailable } from '@/design-system/components/cambrian/nav-rail';

const ALL_CAPS = NAV_GROUPS.flatMap((g) => g.entries.flatMap((e) => [e.requires ?? '', ...(e.requiresAny ?? [])])).filter(
  Boolean,
);

const visible = (role: string | null) =>
  NAV_GROUPS.flatMap((g) => g.entries.filter((e) => entryAvailable(e, ALL_CAPS, role)).map((e) => e.path));

describe('role-based screen gating (ADR-0142)', () => {
  it('a member sees only their own surfaces in the rail', () => {
    expect(visible('member')).toEqual(['/chat', '/inbox', '/integrations']);
  });

  it('operators and viewers keep every capability-advertised entry', () => {
    const all = NAV_GROUPS.flatMap((g) => g.entries.map((e) => e.path));
    expect(visible('operator')).toEqual(all);
    expect(visible('viewer')).toEqual(all);
    expect(visible(null)).toEqual(all);
  });

  it('capability gating still applies to a member', () => {
    const chat = NAV_GROUPS[0].entries.find((e) => e.path === '/chat')!;
    expect(entryAvailable({ ...chat, requires: 'chat' }, [], 'member')).toBe(false);
    expect(entryAvailable({ ...chat, requires: 'chat' }, ['chat'], 'member')).toBe(true);
  });

  it('a deep link to an admin screen is refused for a member only', () => {
    for (const p of ['/audit', '/scope', '/organisation', '/agents', '/tasks/abc', '/memory']) {
      expect(routeAllowedForRole(p, 'member')).toBe(false);
      expect(routeAllowedForRole(p, 'operator')).toBe(true);
      expect(routeAllowedForRole(p, 'viewer')).toBe(true);
    }
    for (const p of ['/', '/chat', '/inbox', '/integrations/slack', '/settings']) {
      expect(routeAllowedForRole(p, 'member')).toBe(true);
    }
    // A prefix that merely starts with an allowed root is not allowed.
    expect(routeAllowedForRole('/chatops', 'member')).toBe(false);
  });

  it('says what each role may do', () => {
    expect(roleSummary('member')).toMatch(/own/);
    expect(roleSummary(null)).toBe('');
  });
});
