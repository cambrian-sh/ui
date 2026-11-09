/**
 * ADR-0142 stage 2 — the organisation editor's pure logic: the tree, what may
 * be edited where, the rule PREVIEW-then-save flow, "who approves what" and the
 * SCIM bearer's show-once lifecycle. No I/O here; screens/organisation renders
 * it and ipc/hierarchy-client speaks the org-directory plane.
 */
import type {
  ApprovalLimit,
  ApprovalSettings,
  MappingReport,
  MappingRule,
  OrgChain,
  OrgPerson,
  OrgUnit,
  ScimConnectionSecret,
} from '@/ipc/types-hierarchy';
import { describeRule } from '@/lib/approvalRules';

/** The capability the kernel advertises when the org-directory plugin is active. */
export const ORG_DIRECTORY_CAPABILITY = 'org-directory';

// ---- the tree ------------------------------------------------------------------

export interface TreeNode {
  unit: OrgUnit;
  head: OrgPerson | null;
  members: OrgPerson[];
  children: TreeNode[];
  depth: number;
}

export interface BuiltTree {
  roots: TreeNode[];
  /** People in no unit (or in a unit that no longer exists). */
  unassigned: OrgPerson[];
}

const byLabel = (a: { name?: string; display_name?: string }, b: { name?: string; display_name?: string }) =>
  (a.name ?? a.display_name ?? '').localeCompare(b.name ?? b.display_name ?? '');

/**
 * Build the unit tree. A unit whose parent is missing becomes a root rather
 * than vanishing, and a cycle in the data (which the kernel should never
 * produce) is cut at the first repeat instead of recursing forever.
 */
export function buildTree(units: readonly OrgUnit[], people: readonly OrgPerson[]): BuiltTree {
  const byId = new Map(units.map((u) => [u.id, u]));
  const persons = new Map(people.map((p) => [p.principal_id, p]));
  const childrenOf = new Map<string, OrgUnit[]>();
  for (const u of units) {
    const parent = u.parent_id && byId.has(u.parent_id) ? u.parent_id : '';
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), u]);
  }
  const seen = new Set<string>();
  const node = (u: OrgUnit, depth: number): TreeNode => {
    seen.add(u.id);
    return {
      unit: u,
      head: (u.head_id && persons.get(u.head_id)) || null,
      members: people.filter((p) => p.unit_id === u.id).slice().sort(byLabel),
      children: (childrenOf.get(u.id) ?? [])
        .filter((c) => !seen.has(c.id))
        .sort(byLabel)
        .map((c) => node(c, depth + 1)),
      depth,
    };
  };
  const roots = (childrenOf.get('') ?? []).sort(byLabel).map((u) => node(u, 0));
  for (const u of units) if (!seen.has(u.id)) roots.push(node(u, 0));
  const unassigned = people.filter((p) => !p.unit_id || !byId.has(p.unit_id)).slice().sort(byLabel);
  return { roots, unassigned };
}

/** Every unit id under `unitId` (excluding itself). */
export function descendants(units: readonly OrgUnit[], unitId: string): Set<string> {
  const out = new Set<string>();
  const stack = [unitId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const u of units) {
      if (u.parent_id === cur && !out.has(u.id) && u.id !== unitId) {
        out.add(u.id);
        stack.push(u.id);
      }
    }
  }
  return out;
}

/** Why `unitId` may not move under `parentId`, or '' when it may. */
export function canMoveUnit(units: readonly OrgUnit[], unitId: string, parentId: string): string {
  if (unitId === parentId) return 'a unit cannot be its own parent';
  if (parentId && !units.some((u) => u.id === parentId)) return 'the target unit does not exist';
  if (parentId && descendants(units, unitId).has(parentId)) return 'a unit cannot move under its own sub-unit';
  const u = units.find((x) => x.id === unitId);
  if (u && !u.editable) return editBlockedReason(u)!;
  return '';
}

/**
 * ADR-0142 D6: the kernel marks a directory-owned row `editable: false`; the
 * editor shows it read-only so two masters never fight.
 */
export function editBlockedReason(row: { editable: boolean; source: string }): string | undefined {
  if (row.editable) return undefined;
  const from = row.source === 'scim' ? 'the directory (SCIM)' : row.source === 'oidc' ? 'sign-in claims' : `the ${row.source || 'directory'}`;
  return `Comes from ${from}. Change it there; the next sync updates it here.`;
}

/** Managers a person may be given: active people outside their own reporting line. */
export function managerCandidates(people: readonly OrgPerson[], personId: string): OrgPerson[] {
  const reports = new Set<string>([personId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of people) {
      if (p.manager_id && reports.has(p.manager_id) && !reports.has(p.principal_id)) {
        reports.add(p.principal_id);
        grew = true;
      }
    }
  }
  return people.filter((p) => !reports.has(p.principal_id) && p.status === 'active').slice().sort(byLabel);
}

// ---- tree view state ---------------------------------------------------------

export type Selection = { kind: 'unit' | 'person'; id: string } | null;

export interface TreeViewState {
  expanded: ReadonlySet<string>;
  selected: Selection;
  /** A unit being moved: the next unit chosen becomes its parent. */
  moving: string | null;
  error: string | null;
}

export type TreeAction =
  | { type: 'toggle'; unitId: string }
  | { type: 'expandAll'; unitIds: readonly string[] }
  | { type: 'collapseAll' }
  | { type: 'select'; selection: Selection }
  | { type: 'startMove'; unitId: string }
  | { type: 'cancelMove' }
  | { type: 'chooseTarget'; parentId: string; units: readonly OrgUnit[] }
  | { type: 'moved' };

export const initialTreeView: TreeViewState = { expanded: new Set(), selected: null, moving: null, error: null };

export function treeReducer(s: TreeViewState, a: TreeAction): TreeViewState {
  switch (a.type) {
    case 'toggle': {
      const e = new Set(s.expanded);
      if (e.has(a.unitId)) e.delete(a.unitId);
      else e.add(a.unitId);
      return { ...s, expanded: e };
    }
    case 'expandAll':
      return { ...s, expanded: new Set(a.unitIds) };
    case 'collapseAll':
      return { ...s, expanded: new Set() };
    case 'select':
      return { ...s, selected: a.selection, error: null };
    case 'startMove':
      return { ...s, moving: a.unitId, error: null };
    case 'cancelMove':
      return { ...s, moving: null, error: null };
    case 'chooseTarget': {
      if (!s.moving) return s;
      const why = canMoveUnit(a.units, s.moving, a.parentId);
      // An invalid target keeps the move open with the reason, so the person
      // can pick another one rather than start over.
      return { ...s, error: why || null };
    }
    case 'moved':
      return { ...s, moving: null, error: null };
  }
}

// ---- mapping rules -----------------------------------------------------------

export const emptyRule = (): MappingRule => ({
  id: '',
  name: '',
  priority: 0,
  enabled: true,
  privileged: false,
  match: { groups: [], departments: [], titles: [], units: [], attributes: {}, connections: [], match_all: false },
  assign: { roles: [], groups: [], policy_links: [], approval_limits: [] },
  version: 0,
  updated_by: '',
  updated_at_unix_ms: 0,
});

const PRIVILEGED_ROLES = ['operator', 'admin'];

/** The kernel refuses a rule that assigns operator/admin unless it says privileged. */
export function privilegedMismatch(r: MappingRule): boolean {
  return !r.privileged && (r.assign?.roles ?? []).some((x) => PRIVILEGED_ROLES.includes(x.trim().toLowerCase()));
}

const sorted = (xs: readonly string[] | undefined) => [...(xs ?? [])].map((x) => x.trim()).filter(Boolean).sort();

/** A stable digest of every rule field that changes what it does. */
export function ruleDigest(r: MappingRule): string {
  const m = r.match;
  const a = r.assign;
  const canon = JSON.stringify([
    r.id,
    r.priority,
    r.enabled,
    r.privileged,
    m
      ? [sorted(m.groups), sorted(m.departments), sorted(m.titles), sorted(m.units), Object.entries(m.attributes ?? {}).sort(), sorted(m.connections), m.match_all]
      : null,
    a
      ? [
          sorted(a.roles),
          sorted(a.groups),
          sorted(a.policy_links),
          (a.approval_limits ?? []).map((l) => [l.class, l.measure, l.max, sorted(l.escalate_to)]).sort(),
        ]
      : null,
  ]);
  let h = 5381;
  for (let i = 0; i < canon.length; i++) h = ((h * 33) ^ canon.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function formatLimit(l: ApprovalLimit): string {
  const cls = l.class === '*' ? 'any action' : l.class;
  return `${cls}: ${l.measure} above ${l.max} → ${
    l.escalate_to.length ? l.escalate_to.map(describeRule).join(' or ') : describeRule('relationship:supervisor')
  }`;
}

/** "This rule would change: …" one line per person. */
export function previewLines(report: MappingReport): string[] {
  return report.changes.map((c) => {
    const parts = [
      ...c.add_roles.map((x) => `+role ${x}`),
      ...c.remove_roles.map((x) => `−role ${x}`),
      ...c.add_groups.map((x) => `+group ${x}`),
      ...c.remove_groups.map((x) => `−group ${x}`),
      ...c.add_policy_links.map((x) => `+policy ${x}`),
      ...c.remove_policy_links.map((x) => `−policy ${x}`),
    ];
    const lim = (ls: ApprovalLimit[]) => ls.map((l) => `${l.class}/${l.measure}≤${l.max}`).sort().join(', ');
    if (lim(c.limits_before) !== lim(c.limits_after)) {
      parts.push(`limits ${lim(c.limits_before) || 'none'} → ${lim(c.limits_after) || 'none'}`);
    }
    return `${c.display_name || c.principal_id}: ${parts.join(', ') || 'no visible change'}`;
  });
}

/**
 * The rule editor's state machine. SaveMappingRule stores AND applies, so
 * Save is offered ONLY from `previewed`, and only while the rule is exactly
 * what was previewed: any edit drops back to `editing`, so nobody applies a
 * change they did not see.
 */
export type RuleFlow =
  | { step: 'editing' }
  | { step: 'previewing' }
  | { step: 'previewed'; report: MappingReport; digest: string }
  | { step: 'saving'; report: MappingReport; digest: string }
  | { step: 'saved'; report: MappingReport | null }
  | { step: 'error'; error: string };

export type RuleFlowAction =
  | { type: 'edit' }
  | { type: 'preview' }
  | { type: 'previewed'; report: MappingReport; digest: string }
  | { type: 'save' }
  | { type: 'saved'; report: MappingReport | null }
  | { type: 'failed'; error: string };

export function ruleFlowReducer(s: RuleFlow, a: RuleFlowAction): RuleFlow {
  switch (a.type) {
    case 'edit':
      return { step: 'editing' };
    case 'preview':
      return { step: 'previewing' };
    case 'previewed':
      return { step: 'previewed', report: a.report, digest: a.digest };
    case 'save':
      return s.step === 'previewed' ? { step: 'saving', report: s.report, digest: s.digest } : s;
    case 'saved':
      return s.step === 'saving' ? { step: 'saved', report: a.report } : s;
    case 'failed':
      return { step: 'error', error: a.error };
  }
}

/** Why Save is not offered for this rule now, or undefined when it is. */
export function saveBlockedReason(flow: RuleFlow, rule: MappingRule): string | undefined {
  if (!rule.name.trim()) return 'Name the rule.';
  if (privilegedMismatch(rule)) return 'This rule assigns operator/admin: mark it privileged.';
  if (flow.step !== 'previewed') return 'Preview the rule first: saving applies it to everyone it matches.';
  if (flow.digest !== ruleDigest(rule)) return 'The rule changed since its preview. Preview it again.';
  return undefined;
}

// ---- who approves what ----------------------------------------------------------

export interface ApproverRoute {
  what: string;
  rule: string;
  /** Resolved approvers now; [] = nobody (the request would end needs_hierarchy). */
  approvers: string[];
  note: string;
}

/**
 * For one person: their chain and which approval rules route to whom. The
 * kernel's hierarchy policy is the authority; this explains its data — the
 * person's limits (from rules), the manager chain and the relationship
 * fallbacks — in the same terms.
 */
export function explainApprovers(chain: OrgChain, settings: ApprovalSettings | null): ApproverRoute[] {
  const me = chain.person;
  const supervisor = chain.managers[0] ?? null;
  const fallback = settings?.relationship_fallbacks?.supervisor ?? '';
  const resolve = (rule: string): { approvers: string[]; note: string } => {
    const r = rule.trim();
    if (r === 'relationship:supervisor') {
      if (supervisor) return { approvers: [supervisor.display_name || supervisor.principal_id], note: 'then up the chain if they do not answer' };
      if (fallback) return { approvers: [describeRule(fallback)], note: `no manager: the configured fallback (${fallback}) is asked` };
      return { approvers: [], note: 'no manager and no fallback: the request ends as needs_hierarchy' };
    }
    if (r.startsWith('relationship:')) return { approvers: [describeRule(r)], note: '' };
    if (r === 'self') return { approvers: [me?.display_name || 'themselves'], note: '' };
    return { approvers: [describeRule(r)], note: '' };
  };
  const routes: ApproverRoute[] = [
    {
      what: 'Actions on their own resources',
      rule: 'self',
      approvers: [me?.display_name || 'themselves'],
      note: 'their own device, accounts, memory and schedules (some classes are never self-approvable)',
    },
  ];
  for (const l of me?.approval_limits ?? []) {
    const rules = l.escalate_to.length ? l.escalate_to : ['relationship:supervisor'];
    const resolved = rules.map(resolve);
    routes.push({
      what: `${l.class === '*' ? 'Any action' : l.class} with ${l.measure} above ${l.max}`,
      rule: rules.join(' | '),
      approvers: resolved.flatMap((x) => x.approvers),
      note: resolved.map((x) => x.note).filter(Boolean).join('; '),
    });
  }
  return routes;
}

// ---- SCIM bearer: shown once ----------------------------------------------------

/**
 * A SCIM bearer exists in the webview for exactly one dialog: from the
 * create/rotate answer until the person dismisses it. It is never stored in a
 * cache, a store or localStorage, and once dismissed nothing can show it again
 * — the kernel keeps only its last four.
 */
export interface ScimSecretState {
  issued: ScimConnectionSecret | null;
  copied: boolean;
  /** Connection ids whose bearer has been shown and dismissed in this session. */
  dismissed: ReadonlySet<string>;
}

export type ScimSecretAction = { type: 'issued'; issued: ScimConnectionSecret } | { type: 'copied' } | { type: 'dismiss' };

export const initialScimSecret: ScimSecretState = { issued: null, copied: false, dismissed: new Set() };

export function scimSecretReducer(s: ScimSecretState, a: ScimSecretAction): ScimSecretState {
  switch (a.type) {
    case 'issued':
      return { ...s, issued: a.issued, copied: false };
    case 'copied':
      return s.issued ? { ...s, copied: true } : s;
    case 'dismiss': {
      if (!s.issued) return s;
      const d = new Set(s.dismissed);
      if (s.issued.connection) d.add(s.issued.connection.id);
      return { issued: null, copied: false, dismissed: d };
    }
  }
}
