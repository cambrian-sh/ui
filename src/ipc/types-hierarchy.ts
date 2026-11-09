/*
 * ADR-0142 stage 2 (premium, capability `org-directory`): the organisation
 * hierarchy plane, `cambrian.premium.org.OrgDirectoryAdmin`
 * (proto/org/org_directory.proto). The Rust core passes the generated messages
 * through unchanged (serde-derived in src-tauri/build.rs), so these mirror the
 * proto field for field. Optional message fields arrive as null.
 */

/** Who owns a row (ADR-0142 D6). `editable` on the row is the kernel's verdict. */
export type OrgSource = 'editor' | 'scim' | 'directory' | 'oidc' | string;

export interface OrgAck {
  ok: boolean;
  deduped: boolean;
}

export interface OrgUnit {
  id: string;
  name: string;
  parent_id: string;
  head_id: string;
  source: OrgSource;
  connection_id: string;
  external_id: string;
  member_count: number;
  editable: boolean;
}

export interface ApprovalLimit {
  /** The approval action class ("payment", "tool", "*" = any). */
  class: string;
  /** What is measured ("amount", "recipients", …). */
  measure: string;
  /** Requests whose measure is ABOVE max escalate. */
  max: number;
  /** Approver rules (any-of) above the limit; default relationship:supervisor. */
  escalate_to: string[];
  rule_id: string;
}

export interface OrgPerson {
  principal_id: string;
  display_name: string;
  email: string;
  status: 'active' | 'suspended' | 'deprovisioned' | string;
  source: OrgSource;
  connection_id: string;
  external_id: string;
  user_name: string;
  unit_id: string;
  title: string;
  manager_id: string;
  department: string;
  directory_groups: string[];
  attributes: Record<string, string>;
  roles: string[];
  rule_roles: string[];
  rule_groups: string[];
  rule_policy_links: string[];
  approval_limits: ApprovalLimit[];
  editable: boolean;
  updated_at_unix_ms: number;
}

export interface DirectoryGroup {
  id: string;
  display_name: string;
  source: OrgSource;
  connection_id: string;
  external_id: string;
  members: string[];
  editable: boolean;
}

export interface OrgChain {
  person: OrgPerson | null;
  /** Root first, the person's own unit last. */
  unit_path: OrgUnit[];
  /** Nearest first (manager, skip-level, …). */
  managers: OrgPerson[];
  unit_head: OrgPerson | null;
}

export interface RuleMatch {
  groups: string[];
  departments: string[];
  titles: string[];
  /** Unit ids; a unit matches its descendants too. */
  units: string[];
  attributes: Record<string, string>;
  connections: string[];
  match_all: boolean;
}

export interface RuleAssign {
  roles: string[];
  groups: string[];
  policy_links: string[];
  approval_limits: ApprovalLimit[];
}

export interface MappingRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  /** Must be true for a rule that assigns operator or admin, or the kernel refuses it. */
  privileged: boolean;
  match: RuleMatch | null;
  assign: RuleAssign | null;
  version: number;
  updated_by: string;
  updated_at_unix_ms: number;
}

export interface PersonChange {
  principal_id: string;
  display_name: string;
  add_roles: string[];
  remove_roles: string[];
  add_groups: string[];
  remove_groups: string[];
  add_policy_links: string[];
  remove_policy_links: string[];
  limits_before: ApprovalLimit[];
  limits_after: ApprovalLimit[];
}

export interface MappingReport {
  changes: PersonChange[];
  conflicts: string[];
  errors: string[];
  people_evaluated: number;
  dry_run: boolean;
}

export interface SaveMappingRuleResponse {
  rule: MappingRule | null;
  report: MappingReport | null;
}

export interface ApprovalMeasure {
  tool: string;
  measure: string;
  arg: string;
  count: boolean;
}

export interface ApprovalSettings {
  measures: ApprovalMeasure[];
  /** relation → approver rule used ONLY when the relation resolves to nobody. */
  relationship_fallbacks: Record<string, string>;
}

export interface ScimConnection {
  id: string;
  name: string;
  oidc_issuer: string;
  base_url: string;
  token_last4: string;
  created_at_unix_ms: number;
  revoked: boolean;
  last_used_at_unix_ms: number;
  users: number;
  groups: number;
}

/** The ONLY message that ever carries a SCIM bearer: create and rotate answers. */
export interface ScimConnectionSecret {
  connection: ScimConnection | null;
  token: string;
}

export interface ReconcileStatus {
  enabled: boolean;
  provider: string;
  base_url: string;
  realm: string;
  running: boolean;
  last_run_at_unix_ms: number;
  last_ok_at_unix_ms: number;
  next_run_at_unix_ms: number;
  last_error: string;
  users_seen: number;
  groups_seen: number;
  created: number;
  updated: number;
  suspended: number;
}
