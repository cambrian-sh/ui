import type { UnroutedApproval } from '@/ipc/types';

/**
 * Plain-language rendering of an ADR-0142 D11 approver rule. The kernel renders
 * rules any-of with " | " ("self | operator", "relationship:supervisor",
 * "role:compliance", "person:carol"); the console explains, never re-decides.
 */
export function describeRule(rule: string): string {
  if (!rule) return '';
  return rule
    .split('|')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      if (r === 'self') return 'the person it is for';
      if (r === 'operator') return 'any operator';
      const [kind, value] = r.split(/:(.*)/s);
      switch (kind) {
        case 'relationship':
          return value === 'supervisor' ? 'their supervisor (from the organisation hierarchy)' : `their ${value}`;
        case 'role':
          return `anyone with the ${value} role`;
        case 'person':
          return value;
        default:
          return r;
      }
    })
    .join(' or ');
}

/** True when the rule needs the organisation hierarchy to resolve. */
export function needsHierarchy(rule: string): boolean {
  return rule.split('|').some((r) => r.trim().startsWith('relationship:'));
}

/** What an unrouted approval means and what can be done about it. */
export function unroutedExplanation(u: UnroutedApproval): { title: string; body: string; fix: string } {
  if (u.outcome === 'needs_hierarchy') {
    return {
      title: 'Needs the organisation hierarchy',
      body:
        'This action must be approved by the requester’s supervisor, but the organisation hierarchy names no manager for ' +
        (u.beneficiary || 'them') +
        ', so nobody could be asked. It was NOT approved and did not run.',
      fix: 'An administrator can add a manager (Organisation › people, or in the directory that provisions this person); the agent can then ask again.',
    };
  }
  return {
    title: 'No approver could be reached',
    body:
      'Nobody who may approve this was connected to any surface (console, chat or desktop app), so the request ended without an answer. It did not run.',
    fix: 'Ask again when an approver is signed in, or ask an administrator to change who approves this kind of action.',
  };
}
