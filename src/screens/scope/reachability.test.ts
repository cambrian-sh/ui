import { describe, expect, it } from 'vitest';
import { evaluateCell, agreesWithKernel, toDecision } from './reachability';
import type { AccessDecision, GroupSpec, LinkSpec, PolicySpec } from '@/ipc/types';

// This module re-implements the kernel's decision algebra client-side, so it is
// the highest-risk code in the console: a wrong "allowed" is a security-shaped
// bug. These cases pin the order of the algebra — forbidden wins absolutely,
// then required, then any_of, then closed-by-default — because that order is
// what would silently drift away from the kernel.

function policy(over: Partial<PolicySpec> = {}): PolicySpec {
  return {
    id: 'p1',
    name: 'Policy 1',
    version: 1,
    rule: {
      required_tags: [],
      any_of_tags: [],
      forbidden_tags: [],
      granted_tags: [], party_scoped_tags: [],
    },
    effects: { allow: [], deny: [] },
    mode: 'enforced',
    expires_at_unix_ms: 0,
    granted_by: '',
    updated_at_unix_ms: 0,
    ...over,
  };
}

function link(over: Partial<LinkSpec> = {}): LinkSpec {
  return {
    policy_id: 'p1',
    container_kind: 'surface',
    target_id: 'chat:telegram',
    enforced: false,
    order: 0,
    expires_at_unix_ms: 0,
    granted_by: '',
    ...over,
  };
}

const TELEGRAM = { id: 'surface:chat:telegram', label: 'telegram' };
const NO_GROUPS: GroupSpec[] = [];
const NOTHING_CLOSED = new Set<string>();

describe('evaluateCell', () => {
  it('denies when a forbidden tag is present', () => {
    const p = policy({ rule: { required_tags: [], any_of_tags: [], forbidden_tags: ['customer-pii'], granted_tags: [], party_scoped_tags: [] } });
    const v = evaluateCell(TELEGRAM, ['customer-pii'], [p], [link()], NO_GROUPS, NOTHING_CLOSED);

    expect(v.state).toBe('denied');
    expect(v.detail).toBe('customer-pii');
    expect(v.decidedBy[0].term).toBe('forbidden');
  });

  it('allows when nothing applies', () => {
    const v = evaluateCell(TELEGRAM, ['public'], [], [], NO_GROUPS, NOTHING_CLOSED);
    expect(v.state).toBe('allowed');
  });

  it('denies when a required tag is missing', () => {
    const p = policy({ rule: { required_tags: ['reviewed'], any_of_tags: [], forbidden_tags: [], granted_tags: [], party_scoped_tags: [] } });
    const v = evaluateCell(TELEGRAM, ['public'], [p], [link()], NO_GROUPS, NOTHING_CLOSED);

    expect(v.state).toBe('denied');
    expect(v.detail).toContain('reviewed');
  });

  it('denies when no member of an any_of clause is present', () => {
    const p = policy({ rule: { required_tags: [], any_of_tags: ['a', 'b'], forbidden_tags: [], granted_tags: [], party_scoped_tags: [] } });
    const v = evaluateCell(TELEGRAM, ['c'], [p], [link()], NO_GROUPS, NOTHING_CLOSED);
    expect(v.state).toBe('denied');
  });

  it('satisfies an any_of clause with a single member', () => {
    const p = policy({ rule: { required_tags: [], any_of_tags: ['a', 'b'], forbidden_tags: [], granted_tags: [], party_scoped_tags: [] } });
    const v = evaluateCell(TELEGRAM, ['b'], [p], [link()], NO_GROUPS, NOTHING_CLOSED);
    expect(v.state).toBe('allowed');
  });

  it('denies a closed label by default, with no policy involved at all', () => {
    // The whole point of a closed label: nobody reaches it unless something
    // grants it. An empty policy set must NOT read as "allowed".
    const v = evaluateCell(TELEGRAM, ['finance'], [], [], NO_GROUPS, new Set(['finance']));
    expect(v.state).toBe('denied_by_default');
    expect(v.detail).toBe('finance');
  });

  it('allows a closed label once a grant reopens it, and says that is why', () => {
    const p = policy({ rule: { required_tags: [], any_of_tags: [], forbidden_tags: [], granted_tags: ['finance'], party_scoped_tags: [] } });
    const v = evaluateCell(TELEGRAM, ['finance'], [p], [link()], NO_GROUPS, new Set(['finance']));

    expect(v.state).toBe('allowed_via_grant');
    expect(v.decidedBy.some((c) => c.term === 'granted')).toBe(true);
  });

  it('does not let a grant override a forbidden tag', () => {
    // Deny wins absolutely. If a grant could beat it, every boundary in the
    // system would be one policy away from being switched off.
    const deny = policy({
      id: 'deny',
      rule: { required_tags: [], any_of_tags: [], forbidden_tags: ['finance'], granted_tags: [], party_scoped_tags: [] },
    });
    const grant = policy({
      id: 'grant',
      rule: { required_tags: [], any_of_tags: [], forbidden_tags: [], granted_tags: ['finance'], party_scoped_tags: [] },
    });
    const v = evaluateCell(
      TELEGRAM,
      ['finance'],
      [deny, grant],
      [link({ policy_id: 'deny' }), link({ policy_id: 'grant' })],
      NO_GROUPS,
      new Set(['finance']),
    );

    expect(v.state).toBe('denied');
  });

  it('reports a report-only denial as would-deny rather than as a denial', () => {
    // A report-only policy ALLOWED the request. Rendering it as a denial would
    // be a lie; rendering it as a plain allow would hide the whole point.
    const p = policy({
      mode: 'report_only',
      rule: { required_tags: [], any_of_tags: [], forbidden_tags: ['customer-pii'], granted_tags: [], party_scoped_tags: [] },
    });
    const v = evaluateCell(TELEGRAM, ['customer-pii'], [p], [link()], NO_GROUPS, NOTHING_CLOSED);

    expect(v.state).toBe('report_only_would_deny');
    expect(v.reportOnly).toBe(true);
  });

  it('ignores a policy linked to a container the principal is not in', () => {
    const p = policy({ rule: { required_tags: [], any_of_tags: [], forbidden_tags: ['x'], granted_tags: [], party_scoped_tags: [] } });
    const v = evaluateCell(
      TELEGRAM,
      ['x'],
      [p],
      [link({ container_kind: 'surface', target_id: 'chat:slack' })],
      NO_GROUPS,
      NOTHING_CLOSED,
    );
    expect(v.state).toBe('allowed');
  });

  it('applies an organisation-wide link to everyone', () => {
    const p = policy({ rule: { required_tags: [], any_of_tags: [], forbidden_tags: ['x'], granted_tags: [], party_scoped_tags: [] } });
    const v = evaluateCell(
      TELEGRAM,
      ['x'],
      [p],
      [link({ container_kind: 'organisation', target_id: '' })],
      NO_GROUPS,
      NOTHING_CLOSED,
    );
    expect(v.state).toBe('denied');
  });

  it('keeps an inherited DENY even when the group blocks inheritance', () => {
    // Block-inheritance stops policy accumulating from above — except denies,
    // and except enforced links. A blocked group that could shed a deny would
    // be a way to opt out of a boundary.
    const deny = policy({
      rule: { required_tags: [], any_of_tags: [], forbidden_tags: ['x'], granted_tags: [], party_scoped_tags: [] },
    });
    const group: GroupSpec = {
      id: 'support-team',
      name: 'Support',
      members: [],
      subgroups: [],
      block_inheritance: true,
    };
    const principal = { id: 'group:support-team', label: 'Support', groups: ['support-team'] };

    const v = evaluateCell(
      principal,
      ['x'],
      [deny],
      [link({ container_kind: 'organisation', target_id: '' })],
      [group],
      NOTHING_CLOSED,
    );

    expect(v.state).toBe('denied');
  });
});

describe('agreesWithKernel', () => {
  const kernel = (allowed: boolean): AccessDecision => ({
    allowed,
    reason: allowed ? 'allowed' : 'forbidden_tag',
    detail: '',
    decided_by: [],
    policy_version: 'v1',
    report_only: false,
    would_have_denied: false,
    explain: '',
  });

  it('agrees when both allow', () => {
    const v = evaluateCell(TELEGRAM, ['public'], [], [], NO_GROUPS, NOTHING_CLOSED);
    expect(agreesWithKernel(v, kernel(true))).toBe(true);
  });

  it('flags a disagreement when the console allows and the kernel denies', () => {
    // The case that matters: a wrong "allowed" here is the security-shaped bug,
    // and this is the check that catches it.
    const v = evaluateCell(TELEGRAM, ['public'], [], [], NO_GROUPS, NOTHING_CLOSED);
    expect(agreesWithKernel(v, kernel(false))).toBe(false);
  });
});

describe('toDecision', () => {
  it('marks the policy version as locally computed, never as a kernel snapshot', () => {
    // A trace that claimed a real policy_version would look like the kernel had
    // answered. It has not.
    const v = evaluateCell(TELEGRAM, ['public'], [], [], NO_GROUPS, NOTHING_CLOSED);
    expect(toDecision(v).policy_version).toBe('computed in this console');
  });
});
