import { describe, expect, it } from 'vitest';
import {
  buildTree,
  canMoveUnit,
  editBlockedReason,
  emptyRule,
  explainApprovers,
  initialScimSecret,
  initialTreeView,
  managerCandidates,
  previewLines,
  privilegedMismatch,
  ruleDigest,
  ruleFlowReducer,
  saveBlockedReason,
  scimSecretReducer,
  treeReducer,
  type RuleFlow,
} from '@/lib/hierarchy';
import type { MappingReport, MappingRule, OrgPerson, OrgUnit, ScimConnectionSecret } from '@/ipc/types-hierarchy';
import { createHierarchyMock } from '@/ipc/hierarchy-mock';

const unit = (id: string, name: string, parent_id = '', o: Partial<OrgUnit> = {}): OrgUnit => ({
  id, name, parent_id, head_id: '', source: 'editor', connection_id: '', external_id: '', member_count: 0, editable: true, ...o,
});
const person = (principal_id: string, display_name: string, o: Partial<OrgPerson> = {}): OrgPerson => ({
  principal_id, display_name, email: '', status: 'active', source: 'editor', connection_id: '', external_id: '', user_name: '',
  unit_id: '', title: '', manager_id: '', department: '', directory_groups: [], attributes: {}, roles: [], rule_roles: [],
  rule_groups: [], rule_policy_links: [], approval_limits: [], editable: true, updated_at_unix_ms: 0, ...o,
});

const units = [
  unit('root', 'Org', '', { head_id: 'a' }),
  unit('fin', 'Finance', 'root', { head_id: 'b', source: 'scim', editable: false }),
  unit('pay', 'Payments', 'fin'),
  unit('orphan', 'Lost', 'gone'),
];
const people = [
  person('a', 'Ann', { unit_id: 'root' }),
  person('b', 'Bob', { unit_id: 'fin', manager_id: 'a', source: 'scim', editable: false }),
  person('c', 'Cem', { unit_id: 'pay', manager_id: 'b' }),
  person('d', 'Dee'),
];

describe('hierarchy tree state', () => {
  it('builds the tree with heads, members, orphans as roots and unassigned people', () => {
    const t = buildTree(units, people);
    expect(t.roots.map((r) => r.unit.name)).toEqual(['Lost', 'Org']);
    const org = t.roots.find((r) => r.unit.id === 'root')!;
    expect(org.head?.display_name).toBe('Ann');
    expect(org.children[0].unit.name).toBe('Finance');
    expect(org.children[0].children[0].members.map((m) => m.display_name)).toEqual(['Cem']);
    expect(org.children[0].children[0].depth).toBe(2);
    expect(t.unassigned.map((p) => p.display_name)).toEqual(['Dee']);
  });

  it('survives a cycle in the data instead of recursing forever', () => {
    const t = buildTree([unit('x', 'X', 'y'), unit('y', 'Y', 'x')], []);
    expect(t.roots.length).toBeGreaterThan(0);
  });

  it('refuses a move under itself, under its own sub-unit, or of a directory-owned unit', () => {
    expect(canMoveUnit(units, 'pay', 'pay')).toMatch(/own parent/);
    expect(canMoveUnit(units, 'root', 'pay')).toMatch(/sub-unit/);
    expect(canMoveUnit(units, 'pay', 'nope')).toMatch(/does not exist/);
    expect(canMoveUnit(units, 'fin', '')).toMatch(/directory \(SCIM\)/);
    expect(canMoveUnit(units, 'pay', 'root')).toBe('');
  });

  it('runs expand / select / move through the reducer, keeping an invalid move open with its reason', () => {
    let s = treeReducer(initialTreeView, { type: 'toggle', unitId: 'root' });
    expect(s.expanded.has('root')).toBe(true);
    s = treeReducer(s, { type: 'toggle', unitId: 'root' });
    expect(s.expanded.has('root')).toBe(false);
    s = treeReducer(s, { type: 'expandAll', unitIds: ['root', 'fin'] });
    expect([...s.expanded]).toEqual(['root', 'fin']);
    s = treeReducer(s, { type: 'collapseAll' });
    expect(s.expanded.size).toBe(0);
    s = treeReducer(s, { type: 'select', selection: { kind: 'person', id: 'c' } });
    expect(s.selected).toEqual({ kind: 'person', id: 'c' });
    s = treeReducer(s, { type: 'startMove', unitId: 'root' });
    s = treeReducer(s, { type: 'chooseTarget', parentId: 'pay', units });
    expect(s.moving).toBe('root');
    expect(s.error).toMatch(/sub-unit/);
    s = treeReducer(s, { type: 'chooseTarget', parentId: '', units });
    expect(s.error).toBeNull();
    s = treeReducer(s, { type: 'moved' });
    expect(s.moving).toBeNull();
  });

  it('shows directory-owned rows read-only and never offers a report as manager', () => {
    expect(editBlockedReason(people[1])).toMatch(/directory/);
    expect(editBlockedReason(people[0])).toBeUndefined();
    expect(managerCandidates(people, 'a').map((p) => p.principal_id)).toEqual(['d']);
    expect(managerCandidates(people, 'c').map((p) => p.principal_id)).toEqual(['a', 'b', 'd']);
  });
});

describe('mapping rules: preview before save', () => {
  const rule = (o: Partial<MappingRule> = {}): MappingRule => ({
    ...emptyRule(),
    name: 'Payments',
    match: { ...emptyRule().match!, departments: ['Finance'] },
    assign: { roles: [], groups: ['treasury'], policy_links: [], approval_limits: [] },
    ...o,
  });
  const report: MappingReport = {
    changes: [
      {
        principal_id: 'c', display_name: 'Cem', add_roles: ['approver'], remove_roles: [], add_groups: ['treasury'], remove_groups: ['old'],
        add_policy_links: [], remove_policy_links: [], limits_before: [],
        limits_after: [{ class: 'payment', measure: 'amount', max: 5000, escalate_to: [], rule_id: 'r' }],
      },
    ],
    conflicts: [],
    errors: [],
    people_evaluated: 4,
    dry_run: true,
  };

  it('says what would change, per person', () => {
    expect(previewLines(report)).toEqual([
      'Cem: +role approver, +group treasury, −group old, limits none → payment/amount≤5000',
    ]);
  });

  it('saves only from a fresh preview of exactly this rule', () => {
    const r = rule();
    let f: RuleFlow = { step: 'editing' };
    expect(saveBlockedReason(f, r)).toMatch(/Preview the rule first/);
    expect(ruleFlowReducer(f, { type: 'save' }).step).toBe('editing');
    f = ruleFlowReducer(f, { type: 'preview' });
    f = ruleFlowReducer(f, { type: 'previewed', report, digest: ruleDigest(r) });
    expect(saveBlockedReason(f, r)).toBeUndefined();
    // Edited after the preview: save is withdrawn until it is previewed again.
    const edited = rule({ assign: { ...r.assign!, roles: ['records_officer'] } });
    expect(saveBlockedReason(f, edited)).toMatch(/changed since its preview/);
    // Order of list entries does not count as a change.
    expect(ruleDigest(rule({ match: { ...r.match!, departments: ['Finance'], titles: ['b', 'a'] } }))).toBe(
      ruleDigest(rule({ match: { ...r.match!, departments: ['Finance'], titles: ['a', 'b'] } })),
    );
    f = ruleFlowReducer(f, { type: 'save' });
    expect(f.step).toBe('saving');
    f = ruleFlowReducer(f, { type: 'saved', report });
    expect(f.step).toBe('saved');
    expect(ruleFlowReducer(f, { type: 'edit' }).step).toBe('editing');
  });

  it('a rule granting operator must be privileged, and must be named', () => {
    const op = rule({ assign: { roles: ['Operator'], groups: [], policy_links: [], approval_limits: [] } });
    expect(privilegedMismatch(op)).toBe(true);
    expect(privilegedMismatch({ ...op, privileged: true })).toBe(false);
    const f: RuleFlow = { step: 'previewed', report, digest: ruleDigest(op) };
    expect(saveBlockedReason(f, op)).toMatch(/privileged/);
    expect(saveBlockedReason(f, { ...op, name: ' ' })).toMatch(/Name/);
  });

  it('the mock plane: preview writes nothing, save applies', async () => {
    const m = createHierarchyMock();
    const r = rule({ name: 'Treasury' });
    const preview = await m.previewMappingRules(r);
    expect(preview.dry_run).toBe(true);
    expect(preview.changes.map((c) => c.display_name).sort()).toEqual(['Bob Yılmaz', 'Carol Demir']);
    // Nothing was written by the preview.
    expect((await m.previewMappingRules(r)).changes.length).toBe(2);
    await expect(m.saveMappingRule(r, '')).rejects.toBeTruthy();
    const saved = await m.saveMappingRule(r, 'treasury access');
    expect(saved.report?.dry_run).toBe(false);
    expect((await m.previewMappingRules(null)).changes.length).toBe(0);
  });
});

describe('who approves what', () => {
  const bob = person('bob', 'Bob', {
    approval_limits: [{ class: 'payment', measure: 'amount', max: 5000, escalate_to: ['relationship:supervisor'], rule_id: 'r' }],
  });

  it('routes above-limit actions to the nearest manager', () => {
    const routes = explainApprovers({ person: bob, unit_path: [], managers: [person('carol', 'Carol')], unit_head: null }, null);
    expect(routes[0]).toMatchObject({ rule: 'self', approvers: ['Bob'] });
    expect(routes[1]).toMatchObject({ what: 'payment with amount above 5000', approvers: ['Carol'] });
  });

  it('uses the configured fallback, or says the request would end as needs_hierarchy', () => {
    const lone = { person: bob, unit_path: [], managers: [], unit_head: null };
    expect(explainApprovers(lone, null)[1]).toMatchObject({ approvers: [] });
    expect(explainApprovers(lone, null)[1].note).toMatch(/needs_hierarchy/);
    const withFallback = explainApprovers(lone, { measures: [], relationship_fallbacks: { supervisor: 'role:finance' } });
    expect(withFallback[1].approvers).toEqual(['anyone with the finance role']);
  });
});

describe('SCIM bearer: shown once', () => {
  const issued: ScimConnectionSecret = {
    connection: { id: 'scim-1', name: 'Okta', oidc_issuer: '', base_url: '', token_last4: 'WXYZ', created_at_unix_ms: 0, revoked: false, last_used_at_unix_ms: 0, users: 0, groups: 0 },
    token: 'scim_secret_WXYZ',
  };

  it('holds the bearer only until dismissed, then forgets it for good', () => {
    let s = scimSecretReducer(initialScimSecret, { type: 'issued', issued });
    expect(s.issued?.token).toBe('scim_secret_WXYZ');
    s = scimSecretReducer(s, { type: 'copied' });
    expect(s.copied).toBe(true);
    s = scimSecretReducer(s, { type: 'dismiss' });
    expect(s.issued).toBeNull();
    expect(JSON.stringify({ ...s, dismissed: [...s.dismissed] })).not.toContain('scim_secret');
    expect(s.dismissed.has('scim-1')).toBe(true);
    expect(scimSecretReducer(s, { type: 'copied' })).toBe(s);
  });

  it('the plane returns the bearer once; the listing carries only its last four', async () => {
    const m = createHierarchyMock();
    const created = await m.createScimConnection('Okta', '', 'connect Okta');
    expect(created.token.length).toBeGreaterThan(10);
    const listed = await m.listScimConnections();
    expect(JSON.stringify(listed)).not.toContain(created.token);
    const row = listed.find((c) => c.id === created.connection!.id)!;
    expect(row.token_last4).toBe(created.token.slice(-4));
    const rotated = await m.rotateScimToken(row.id, 'rotate');
    expect(rotated.token).not.toBe(created.token);
    await m.revokeScimConnection(row.id, 'gone');
    await expect(m.rotateScimToken(row.id, 'again')).rejects.toBeTruthy();
  });
});
