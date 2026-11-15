// ADR-0139 operator surfaces (contract 0101): skill lifecycle (D13, capability
// "skills-lifecycle"), per-agent skill grants (capability "skill-grants") and
// principal memory notes (D14, capability "memory-notes"). Mirrors
// src-tauri/src/skills.rs and notes.rs. Times are unix milliseconds, 0 = unset.
// Re-exported from types.ts so call sites keep importing `@/ipc/types`.

export interface SkillRecord {
  name: string;
  description: string;
  tool_grants: string[];
  scope_tags: string[];
  body: string;
  source_path: string;
  version: string;
  /** builtin | official | hub | agent-proposed — rendered as-is. */
  source: string;
  /** active | stale | archived — '' on a kernel without skills-lifecycle. */
  lifecycle_state: string;
  state_changed_at_unix_ms: number;
  locked: boolean;
  /** pinned | pipeline | schedule | '' */
  exempt_reason: string;
  use_count: number;
  success_count: number;
  last_used_at_unix_ms: number;
  ledger_entry_id: string;
}

export interface SkillProposal {
  id: string;
  name: string;
  skill_md: string;
  rationale: string;
  /** pending | approved | rejected */
  state: string;
  proposer_agent_id: string;
  principal_id: string;
  source_run_id: string;
  evidence_cids: string[];
  base_version: string;
  current_version: string;
  /** clean | suspicious | dangerous — a dangerous proposal can never be approved. */
  scan_verdict: string;
  scan_findings: string[];
  created_at_unix_ms: number;
  decided_at_unix_ms: number;
  decided_by: string;
  decision_note: string;
}

export interface SkillProposalDecision {
  deduped: boolean;
  skill_version: string;
  ledger_entry_id: string;
}

export interface SkillLedgerEntry {
  id: string;
  skill_name: string;
  mutation: string;
  from_version: string;
  to_version: string;
  from_state: string;
  to_state: string;
  actor: string;
  reason: string;
  at_unix_ms: number;
  proposal_id: string;
  rollback_of: string;
  restorable: boolean;
}

export interface SkillRollback {
  deduped: boolean;
  ledger_entry_id: string;
  skill_version: string;
}

export interface SkillGrant {
  id: string;
  agent_id: string;
  skill_name: string;
  /** request | proposal | operator */
  source: string;
  granted_by: string;
  granted_at_unix_ms: number;
  reason: string;
  /** 0 = active */
  revoked_at_unix_ms: number;
  revoked_by: string;
  revoke_reason: string;
}

export interface SkillAccessRequest {
  id: string;
  agent_id: string;
  skill_name: string;
  run_id: string;
  rationale: string;
  /** pending | granted | denied */
  state: string;
  requested_at_unix_ms: number;
  decided_at_unix_ms: number;
  decided_by: string;
}

export interface SkillGrants {
  grants: SkillGrant[];
  requests: SkillAccessRequest[];
}

export type NotesScope = 'personal' | 'org';

export interface NotesSummary {
  scope: string;
  owner_id: string;
  size_chars: number;
  budget_chars: number;
  etag: string;
  updated_at_unix_ms: number;
  updated_by: string;
  over_budget: boolean;
}

export interface NotesDocument {
  scope: string;
  owner_id: string;
  content: string;
  size_chars: number;
  budget_chars: number;
  etag: string;
  updated_at_unix_ms: number;
  updated_by: string;
  budget_overridden: boolean;
}

export interface NotesWriteResult {
  deduped: boolean;
  accepted: boolean;
  /** '' | over_budget | injection_flagged | scope_denied | conflict */
  rejection: string;
  detail: string;
  etag: string;
  size_chars: number;
  budget_chars: number;
}

export interface DecideSkillProposalParams {
  proposal_id: string;
  approve: boolean;
  lock_after_approve?: boolean;
  reason: string;
}

export interface ListSkillGrantsParams {
  agent_id?: string;
  skill_name?: string;
  include_revoked?: boolean;
  /** pending (default) | granted | denied | all */
  request_state?: string;
}

export interface SkillGrantParams {
  agent_id: string;
  skill_name: string;
  reason: string;
}

export interface SetMemoryNotesParams {
  scope: string;
  owner_id: string;
  content: string;
  if_match?: string;
  override_injection_flag?: boolean;
  reason: string;
}

export interface SetMemoryNotesBudgetParams {
  scope: string;
  /** empty = the scope default */
  owner_id?: string;
  budget_chars: number;
  clear_override?: boolean;
  reason: string;
}

// ============================================================================
// Integrations (capability "integrations"; src-tauri/src/integrations.rs).
// Secrets are write-only: nothing here ever carries a secret value back.
// ============================================================================

export interface IntegrationField {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  help: string;
  /** env | token */
  kind: string;
  default_value: string;
  placeholder: string;
}

export interface IntegrationToolPolicy {
  name: string;
  dangerous: boolean;
  effects: string[];
}

export interface IntegrationCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  publisher: string;
  license: string;
  /** official | community */
  trust_tier: string;
  docs_url: string;
  version: string;
  transport: string;
  command: string;
  args: string[];
  url: string;
  runtimes: string[];
  platforms: string[];
  platform_supported: boolean;
  fields: IntegrationField[];
  tool_policies: IntegrationToolPolicy[];
  has_default_policy: boolean;
  default_policy: IntegrationToolPolicy | null;
  policy_summary: string;
  probe_tool: string;
  notes: string;
  source: string;
  multi_instance: boolean;
  /** ADR-0140: shared | per_user | either — known before install. */
  credential_scope: string;
  /** The account provider each person connects (empty for shared). */
  provider: string;
  scopes: string[];
}

export interface IntegrationCatalog {
  entries: IntegrationCatalogEntry[];
  categories: string[];
}

export interface IntegrationSecretState {
  name: string;
  label: string;
  set: boolean;
  /** store | env:<VAR> | '' */
  source: string;
  updated_at_unix_ms: number;
  required: boolean;
  kind: string;
}

export interface IntegrationHealth {
  server_id: string;
  /** stopped | starting | ready | error */
  state: string;
  last_handshake_unix_ms: number;
  tool_count: number;
  last_error: string;
  restart_count: number;
  changed_at_unix_ms: number;
}

export interface Integration {
  id: string;
  catalog_id: string;
  name: string;
  category: string;
  /** store | file | plugin */
  source: string;
  overrides_file: boolean;
  editable: boolean;
  enabled: boolean;
  transport: string;
  command: string;
  args: string[];
  url: string;
  settings: Record<string, string>;
  secrets: IntegrationSecretState[];
  health: IntegrationHealth | null;
  installed_version: string;
  update_available: boolean;
  missing_required: string[];
  tool_policies: IntegrationToolPolicy[];
  has_default_policy: boolean;
  default_policy: IntegrationToolPolicy | null;
  policy_summary: string;
  classification_tags: string[];
  trust_tier: string;
  passthrough_env: string[];
  /** ADR-0139 D8: a stdio server's effective containment; null for http/sse. */
  containment: IntegrationContainment | null;
}

/** IntegrationContainmentOp: one stdio server's effective process containment. */
export interface IntegrationContainment {
  tier: string;
  tier_source: string;
  runner: string;
  mechanisms: string[];
  enforced: string[];
  /** "control: reason" for wanted controls this platform could not enforce. */
  missing: string[];
  notes: string[];
  refused: boolean;
  disabled: boolean;
  /** The one-line rendering; policy_summary ends with "; " + this text. */
  summary: string;
}

export interface Integrations {
  integrations: Integration[];
  configured: boolean;
}

export interface IntegrationWriteOutcome {
  key: string;
  stored: boolean;
  /** live | restart_required | shadowed | rejected */
  effect: string;
  shadowed_by: string;
  error: string;
}

export interface IntegrationMutation {
  deduped: boolean;
  outcome: IntegrationWriteOutcome | null;
  integration: Integration | null;
}

export interface IntegrationTool {
  name: string;
  description: string;
  dangerous: boolean;
  effects: string[];
  /** tool | default | fail_closed */
  policy_source: string;
}

export interface IntegrationTestResult {
  ok: boolean;
  latency_ms: number;
  error: string;
  used_live_session: boolean;
  tools: IntegrationTool[];
  probe_tool: string;
  probe_ok: boolean;
  probe_output: string;
  probe_skipped_reason: string;
}

export interface IntegrationCustomSpec {
  name: string;
  category: string;
  /** stdio | http | sse */
  transport: string;
  /** command (stdio) or URL (http/sse) */
  endpoint: string;
  args?: string[];
  auth_type?: string;
  auth_header?: string;
  secret_names?: string[];
  passthrough_env?: string[];
}

export interface InstallIntegrationParams {
  catalog_id?: string;
  id?: string;
  settings?: Record<string, string>;
  /** write-only */
  secrets?: Record<string, string>;
  enabled: boolean;
  custom?: IntegrationCustomSpec;
  reason: string;
}
