/* Mock twin of ipc/hierarchy-client.ts (dev mock mode, tests, screenshots).
 * Models the kernel rules the console relies on: directory-owned rows are not
 * editable (FAILED_PRECONDITION), a rule assigning operator/admin must be
 * privileged, a preview writes nothing, a mutation needs a reason, and a SCIM
 * bearer is returned once and never again (the listing carries its last four).
 */

import type * as h from './types-hierarchy';
import { emptyRule } from '@/lib/hierarchy';

const H = 3_600_000;

export function createHierarchyMock() {
  const now = Date.now();
  const unit = (o: Partial<h.OrgUnit> & Pick<h.OrgUnit, 'id' | 'name'>): h.OrgUnit => ({
    parent_id: '', head_id: '', source: 'editor', connection_id: '', external_id: '', member_count: 0, editable: true, ...o,
  });
  const person = (o: Partial<h.OrgPerson> & Pick<h.OrgPerson, 'principal_id' | 'display_name'>): h.OrgPerson => ({
    email: '', status: 'active', source: 'editor', connection_id: '', external_id: '', user_name: '', unit_id: '', title: '',
    manager_id: '', department: '', directory_groups: [], attributes: {}, roles: [], rule_roles: [], rule_groups: [],
    rule_policy_links: [], approval_limits: [], editable: true, updated_at_unix_ms: now - 10 * H, ...o,
  });
  let units: h.OrgUnit[] = [
    unit({ id: 'municipality', name: 'Municipality', head_id: 'mayor' }),
    unit({ id: 'finance', name: 'Finance', parent_id: 'municipality', head_id: 'carol', source: 'scim', connection_id: 'scim-entra', editable: false }),
    unit({ id: 'records', name: 'Records', parent_id: 'municipality', head_id: 'rana' }),
    unit({ id: 'payments', name: 'Payments', parent_id: 'finance', source: 'scim', connection_id: 'scim-entra', editable: false }),
  ];
  let people: h.OrgPerson[] = [
    person({ principal_id: 'mayor', display_name: 'Deniz Kaya', unit_id: 'municipality', title: 'Mayor', roles: ['operator'] }),
    person({ principal_id: 'carol', display_name: 'Carol Demir', email: 'carol@belediye.example', unit_id: 'finance', manager_id: 'mayor', title: 'Head of Finance', department: 'Finance', source: 'scim', connection_id: 'scim-entra', editable: false, directory_groups: ['Finance'], rule_groups: ['finance'] }),
    person({
      principal_id: 'bob', display_name: 'Bob Yılmaz', email: 'bob@belediye.example', unit_id: 'payments', manager_id: 'carol', title: 'Clerk', department: 'Finance',
      source: 'scim', connection_id: 'scim-entra', editable: false, directory_groups: ['Finance', 'Payments'], rule_groups: ['finance'],
      approval_limits: [{ class: 'payment', measure: 'amount', max: 5000, escalate_to: ['relationship:supervisor'], rule_id: 'finance-dept' }],
    }),
    person({ principal_id: 'rana', display_name: 'Rana Aydın', unit_id: 'records', manager_id: 'mayor', title: 'Records officer', roles: ['records_officer'] }),
    person({ principal_id: 'eve', display_name: 'Eve Arslan', title: 'Intern', approval_limits: [{ class: 'payment', measure: 'amount', max: 500, escalate_to: [], rule_id: '' }] }),
  ];
  let rules: h.MappingRule[] = [
    {
      ...emptyRule(), id: 'finance-dept', name: 'Finance department', version: 3, updated_by: 'user:mayor', updated_at_unix_ms: now - 50 * H,
      match: { ...emptyRule().match!, departments: ['Finance'] },
      assign: { roles: [], groups: ['finance'], policy_links: [], approval_limits: [{ class: 'payment', measure: 'amount', max: 5000, escalate_to: ['relationship:supervisor'], rule_id: '' }] },
    },
  ];
  let scim: h.ScimConnection[] = [
    { id: 'scim-entra', name: 'Entra ID', oidc_issuer: 'https://login.microsoftonline.com/t/v2.0', base_url: 'https://kernel.belediye.example:8768/scim/v2', token_last4: 'q7Zx', created_at_unix_ms: now - 900 * H, revoked: false, last_used_at_unix_ms: now - 0.3 * H, users: 412, groups: 37 },
  ];
  let reconcile: h.ReconcileStatus = {
    enabled: true, provider: 'keycloak', base_url: 'https://id.belediye.example', realm: 'belediye', running: false,
    last_run_at_unix_ms: now - 0.5 * H, last_ok_at_unix_ms: now - 0.5 * H, next_run_at_unix_ms: now + 0.5 * H, last_error: '',
    users_seen: 418, groups_seen: 41, created: 0, updated: 2, suspended: 1,
  };
  const settings: h.ApprovalSettings = {
    measures: [{ tool: 'send_payment', measure: 'amount', arg: 'amount', count: false }],
    relationship_fallbacks: {},
  };
  let seq = 0;
  const needReason = (reason: string) => {
    if (!reason.trim()) throw 'InvalidArgument: a reason is required';
  };
  const ownedRefusal = 'FailedPrecondition: this record comes from a directory; edit it at the directory';

  const matches = (r: h.MappingRule, p: h.OrgPerson): boolean => {
    const m = r.match;
    if (!r.enabled || !m || p.status !== 'active') return false;
    const ci = (xs: string[], v: string[]) => xs.length === 0 || xs.some((x) => v.map((y) => y.toLowerCase()).includes(x.toLowerCase()));
    const any = m.groups.length + m.departments.length + m.titles.length + m.units.length + Object.keys(m.attributes).length + m.connections.length;
    if (!any) return m.match_all;
    const inUnits = m.units.length === 0 || m.units.some((u) => {
      let cur = units.find((x) => x.id === p.unit_id);
      while (cur) {
        if (cur.id === u) return true;
        cur = units.find((x) => x.id === cur!.parent_id);
      }
      return false;
    });
    return ci(m.groups, p.directory_groups) && ci(m.departments, [p.department]) && ci(m.titles, [p.title]) && inUnits &&
      Object.entries(m.attributes).every(([k, v]) => (p.attributes[k] ?? '').toLowerCase() === v.toLowerCase()) &&
      ci(m.connections, [p.connection_id]);
  };
  const report = (ruleSet: h.MappingRule[], dryRun: boolean): h.MappingReport => {
    const changes: h.PersonChange[] = [];
    for (const p of people) {
      const hit = ruleSet.filter((r) => matches(r, p));
      const roles = [...new Set(hit.flatMap((r) => r.assign?.roles ?? []))].sort();
      const groups = [...new Set(hit.flatMap((r) => r.assign?.groups ?? []))].sort();
      const limits = hit.flatMap((r) => (r.assign?.approval_limits ?? []).map((l) => ({ ...l, rule_id: r.id })));
      const add_roles = roles.filter((x) => !p.rule_roles.includes(x));
      const remove_roles = p.rule_roles.filter((x) => !roles.includes(x));
      const add_groups = groups.filter((x) => !p.rule_groups.includes(x));
      const remove_groups = p.rule_groups.filter((x) => !groups.includes(x));
      const limStr = (ls: h.ApprovalLimit[]) => JSON.stringify(ls.map((l) => [l.class, l.measure, l.max]).sort());
      const ruleLimits = p.approval_limits.filter((l) => l.rule_id);
      if (add_roles.length || remove_roles.length || add_groups.length || remove_groups.length || limStr(ruleLimits) !== limStr(limits)) {
        changes.push({
          principal_id: p.principal_id, display_name: p.display_name, add_roles, remove_roles, add_groups, remove_groups,
          add_policy_links: [], remove_policy_links: [], limits_before: ruleLimits, limits_after: limits,
        });
      }
      if (!dryRun) {
        p.rule_roles = roles;
        p.rule_groups = groups;
        p.approval_limits = [...p.approval_limits.filter((l) => !l.rule_id), ...limits];
      }
    }
    return { changes, conflicts: [], errors: [], people_evaluated: people.length, dry_run: dryRun };
  };
  const issue = (c: h.ScimConnection): h.ScimConnectionSecret => {
    const token = `scim_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const conn = { ...c, token_last4: token.slice(-4) };
    scim = scim.some((x) => x.id === c.id) ? scim.map((x) => (x.id === c.id ? conn : x)) : [...scim, conn];
    return { connection: { ...conn }, token };
  };

  return {
    async listOrgUnits(): Promise<h.OrgUnit[]> {
      return units.map((u) => ({ ...u, member_count: people.filter((p) => p.unit_id === u.id).length }));
    },
    async listOrgPeople(unitId = '', query = '', includeInactive = false): Promise<h.OrgPerson[]> {
      const q = query.toLowerCase();
      return structuredClone(
        people.filter(
          (p) =>
            (!unitId || p.unit_id === unitId) &&
            (includeInactive || p.status === 'active') &&
            (!q || [p.principal_id, p.display_name, p.email, p.user_name].some((x) => x.toLowerCase().includes(q))),
        ),
      );
    },
    async listDirectoryGroups(): Promise<h.DirectoryGroup[]> {
      return [{ id: 'g-fin', display_name: 'Finance', source: 'scim', connection_id: 'scim-entra', external_id: 'x', members: ['carol', 'bob'], editable: false }];
    },
    async getOrgChain(principalId: string): Promise<h.OrgChain> {
      const id = principalId || 'bob';
      const me = people.find((p) => p.principal_id === id) ?? null;
      const managers: h.OrgPerson[] = [];
      const seen = new Set<string>();
      let cur = me?.manager_id ?? '';
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const m = people.find((p) => p.principal_id === cur);
        if (!m) break;
        managers.push(structuredClone(m));
        cur = m.manager_id;
      }
      const path: h.OrgUnit[] = [];
      let u = units.find((x) => x.id === me?.unit_id);
      while (u) {
        path.unshift(u);
        u = units.find((x) => x.id === u!.parent_id);
      }
      const head = units.find((x) => x.id === me?.unit_id)?.head_id;
      return { person: me && structuredClone(me), unit_path: path, managers, unit_head: (head && people.find((p) => p.principal_id === head)) || null };
    },
    async listMappingRules(): Promise<h.MappingRule[]> {
      return structuredClone(rules);
    },
    async previewMappingRules(upsert: h.MappingRule | null, deleteId = ''): Promise<h.MappingReport> {
      let set = rules.filter((r) => r.id !== deleteId);
      if (upsert) set = [...set.filter((r) => !upsert.id || r.id !== upsert.id), upsert];
      const saved = structuredClone(people);
      const r = report(set, true);
      people = saved;
      return r;
    },
    async getApprovalSettings(): Promise<h.ApprovalSettings> {
      return structuredClone(settings);
    },
    async listScimConnections(): Promise<h.ScimConnection[]> {
      return structuredClone(scim);
    },
    async getReconcileStatus(): Promise<h.ReconcileStatus> {
      return { ...reconcile };
    },
    async saveOrgUnit(u: h.OrgUnit, reason: string): Promise<h.OrgUnit> {
      needReason(reason);
      const existing = units.find((x) => x.id === u.id);
      if (existing && !existing.editable) throw ownedRefusal;
      const saved = { ...u, id: u.id || u.name.toLowerCase().replace(/\W+/g, '-') || `unit-${++seq}`, source: existing?.source ?? 'editor', editable: true };
      units = existing ? units.map((x) => (x.id === saved.id ? saved : x)) : [...units, saved];
      return saved;
    },
    async deleteOrgUnit(id: string, reason: string): Promise<h.OrgAck> {
      needReason(reason);
      const u = units.find((x) => x.id === id);
      if (u && !u.editable) throw ownedRefusal;
      if (units.some((x) => x.parent_id === id)) throw 'FailedPrecondition: the unit still has sub-units';
      units = units.filter((x) => x.id !== id);
      return { ok: true, deduped: false };
    },
    async saveOrgPerson(p: h.OrgPerson, reason: string): Promise<h.OrgPerson> {
      needReason(reason);
      const existing = people.find((x) => x.principal_id === p.principal_id);
      if (existing && !existing.editable) throw ownedRefusal;
      if (p.manager_id && p.manager_id === p.principal_id) throw 'InvalidArgument: a person cannot manage themselves';
      const saved: h.OrgPerson = existing
        ? { ...existing, display_name: p.display_name, email: p.email, unit_id: p.unit_id, title: p.title, manager_id: p.manager_id, attributes: p.attributes }
        : { ...p, principal_id: p.principal_id || `person-${++seq}`, source: 'editor', editable: true, status: 'active' };
      people = existing ? people.map((x) => (x.principal_id === saved.principal_id ? saved : x)) : [...people, saved];
      return structuredClone(saved);
    },
    async setOrgPersonActive(principalId: string, active: boolean, reason: string): Promise<h.OrgPerson> {
      needReason(reason);
      const p = people.find((x) => x.principal_id === principalId);
      if (!p) throw 'NotFound';
      if (!p.editable) throw ownedRefusal;
      p.status = active ? 'active' : 'suspended';
      return structuredClone(p);
    },
    async saveMappingRule(rule: h.MappingRule, reason: string): Promise<h.SaveMappingRuleResponse> {
      needReason(reason);
      if (!rule.privileged && (rule.assign?.roles ?? []).some((r) => ['operator', 'admin'].includes(r))) {
        throw 'InvalidArgument: a rule that assigns operator or admin must be privileged';
      }
      const saved = { ...rule, id: rule.id || rule.name.toLowerCase().replace(/\W+/g, '-') || `rule-${++seq}`, version: rule.version + 1, updated_by: 'user:mayor', updated_at_unix_ms: Date.now() };
      rules = rules.some((r) => r.id === saved.id) ? rules.map((r) => (r.id === saved.id ? saved : r)) : [...rules, saved];
      return { rule: structuredClone(saved), report: report(rules, false) };
    },
    async deleteMappingRule(id: string, reason: string): Promise<h.MappingReport> {
      needReason(reason);
      rules = rules.filter((r) => r.id !== id);
      return report(rules, false);
    },
    async applyMappingRules(reason: string): Promise<h.MappingReport> {
      needReason(reason);
      return report(rules, false);
    },
    async createScimConnection(name: string, oidcIssuer: string, reason: string): Promise<h.ScimConnectionSecret> {
      needReason(reason);
      return issue({ id: `scim-${++seq}`, name, oidc_issuer: oidcIssuer, base_url: 'https://kernel.belediye.example:8768/scim/v2', token_last4: '', created_at_unix_ms: Date.now(), revoked: false, last_used_at_unix_ms: 0, users: 0, groups: 0 });
    },
    async rotateScimToken(id: string, reason: string): Promise<h.ScimConnectionSecret> {
      needReason(reason);
      const c = scim.find((x) => x.id === id);
      if (!c || c.revoked) throw 'FailedPrecondition: the connection is revoked';
      return issue(c);
    },
    async revokeScimConnection(id: string, reason: string): Promise<h.ScimConnection> {
      needReason(reason);
      scim = scim.map((x) => (x.id === id ? { ...x, revoked: true } : x));
      return structuredClone(scim.find((x) => x.id === id)!);
    },
    async runReconcileNow(reason: string): Promise<h.ReconcileStatus> {
      needReason(reason);
      reconcile = { ...reconcile, last_run_at_unix_ms: Date.now(), last_ok_at_unix_ms: Date.now(), updated: 0, suspended: 0 };
      return { ...reconcile };
    },
  };
}
