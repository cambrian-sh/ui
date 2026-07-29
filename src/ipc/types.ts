

// ============================================================================
// Connection + role (the projection's outer shape).
// ============================================================================

export type Role = 'operator' | 'viewer';
export type ConnectionStatus = 'live' | 'reconnecting' | 'down';

export interface ConnectionState {
  status: ConnectionStatus;
  endpoint: string | null;
  last_known_state_at: string | null; // ISO 8601
  reason: string | null;
}

// ============================================================================
// Existing 9 Tauri commands — response types.
// ============================================================================

/** The endpoint + username saved in the OS keychain. Password is never returned. */
export interface SavedConnection {
  endpoint: string;
  username: string;
}

export interface LoginResponse {
  role: Role;
}

export interface CreateSessionResponse {
  session_id: string;
}

export interface CommandAck {
  deduped: boolean;
}

// ============================================================================
// New 2 Tauri commands (per technical document §3.1, §3.2).
// ============================================================================

export interface ScopeConfig {
  required_tags: string[];
  any_of_tags: string[];
  forbidden_tags: string[];
}

export interface EffectiveScope extends ScopeConfig {
  // Resolved at runtime; the kernel computes this from the intersection of
  // caller_scope ∩ agent_scope (kernel ADR-0034).
  resolved_required: string[];
  resolved_any_of: string[];
  resolved_forbidden: string[];
}

export type BlastRadiusMutation =
  | { kind: 'tag_memory'; doc_id: string; tag: string; add: boolean }
  | { kind: 'set_scope'; agent_id: string; scope: ScopeConfig; mode: 'widen' | 'narrow' }
  | { kind: 'set_write_tags'; agent_id: string; tags: string[]; mode: 'widen' | 'narrow' }
  | { kind: 'set_tool_grant'; agent_id: string; tool_name: string; granted: boolean };

export interface AgentImpact {
  agent_id: string;
  before_effective_scope: EffectiveScope;
  after_effective_scope: EffectiveScope;
  before_default_write_tags: string[];
  after_default_write_tags: string[];
  impact: 'widened' | 'narrowed' | 'unchanged';
}

export interface PlanImpact {
  plan_id: string;
  re_evaluation_required: boolean;
  reason: string;
}

export interface BlastRadiusPreviewResponse {
  affected_agents: AgentImpact[];
  affected_plans: PlanImpact[];
  computed_at: string; // ISO 8601
  cache_ttl_ms: number; // 5_000 default
}

export interface ConfigSchema {
  schema_version: string;
  schema_json: string; // JSON Schema (Draft 2020-12) as a string
  schema_hash: string;
  editable_keys: string[];
  kernel_only_keys: string[];
}

// ============================================================================
// Existing 9 Tauri commands — parameter types.
// ============================================================================

export interface CreateSessionParams {
  goal: string;
  reason: string;
}

export interface SendMessageParams {
  session_id: string;
  text: string;
  reason: string;
}

// ---- Conversations (ADR-0084 D9 OSS chat lane) -------------------------
// A conversation is NOT a task session: a turn is owned by one agent loop on the kernel's
// chat pool and never decomposed into a plan. Gated on the "chat" capability.

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  seq: number;
  role: 'user' | 'agent' | 'system';
  content: string;
  created_at: string;
}

/** A conversation summary for the sidebar (no messages). */
export interface ConversationSummary {
  id: string;
  title: string;
  status: 'open' | 'closed';
  profile: string;
  updated_at: string;
}

export interface ListConversationsParams {
  limit: number;
}

export interface OpenConversationParams {
  /** client-generated stable id (UUID) — makes open idempotent */
  conversation_id: string;
  title: string;
  /** "operator" | "employee" | "customer"; empty ⇒ operator */
  profile: string;
  policy: string;
  reason: string;
}

export interface SendTurnParams {
  conversation_id: string;
  text: string;
  reason: string;
}

export interface ListConversationMessagesParams {
  conversation_id: string;
  after_seq: number;
  limit: number;
}

export interface CloseConversationParams {
  conversation_id: string;
  reason: string;
}

export interface InjectCorrectionParams {
  session_id: string;
  instruction: string;
  reason: string;
}

export interface PauseSessionParams {
  session_id: string;
  reason: string;
}

export interface ResumeSessionParams {
  session_id: string;
  reason: string;
}

export interface CompleteSessionParams {
  session_id: string;
  reason: string;
}

export interface ResolveHITLParams {
  intervention_id: string;
  approve: boolean;
  reason: string;
}

export interface SetToolGrantParams {
  agent_id: string;
  tool_name: string;
  granted: boolean;
  reason: string;
}

export interface SetScopeParams {
  command_id: string;
  reason: string;
  agent_id: string;
  required_tags: string[];
  any_of_tags: string[];
  forbidden_tags: string[];
}

export interface RegisterSkillParams {
  command_id: string;
  reason: string;
  name: string;
  description: string;
  instructions: string;
  tool_grants: string[];
  scope_tags: string[];
}

export interface RegisterMCPParams {
  command_id: string;
  reason: string;
  name: string;
  command: string;
  url: string;
}

export interface TriggerConsolidationParams {
  command_id: string;
  reason: string;
}

// ============================================================================
// StateOfRecord — the projection's shape (mirrors the kernel's StateOfRecord).
// Per ui/src-tauri/state.rs.
// ============================================================================

export type PlanStatus = 'forming' | 'running' | 'paused' | 'completed' | 'failed';
export type SessionState = 'active' | 'paused' | 'dormant' | 'completed';
export type HITLNature = 'destructive_command' | 'approval_request' | 'dangerous_tool';
export type AuditStatus = 'applied' | 'failed' | 'denied';
export type AuditKind = 'config' | 'data' | 'runtime';

// PlanStepNode is one node of a plan's DAG, as projected by the Rust core from the
// PlanState feed (field names match the serde serialization). Empty until the first
// PlanState event carries the graph (snapshots don't include it).
export interface PlanStepNode {
  index: number;
  label: string;
  depends_on: number[];
  is_thought: boolean;
  status: 'pending' | 'running' | 'done' | 'failed';
  agent: string | null;
}

export interface PlanInFlight {
  plan_id: string;
  session_id: string;
  subject: string;
  step_count: number;
  active_agent: string | null;
  status: PlanStatus;
  elapsed_ms: number;
  cost: number;
  started_at: string; // ISO 8601
  steps?: PlanStepNode[]; // the DAG; present on live PlanState folds, absent on snapshot-only plans
}

export interface SessionSummary {
  session_id: string;
  title: string;
  state: SessionState;
  created_at: string;
  last_activity_at: string;
  plan_count: number;
  agent_mix: string[];
  cost: number;
}

export interface HITLIntervention {
  intervention_id: string;
  plan_id: string;
  step_id: string;
  agent_id: string;
  nature: HITLNature;
  proposed_action: Record<string, unknown>;
  intended_action: Record<string, unknown> | null;
  reason: string;
  raised_at: string;
}

export interface AuditEntry {
  entry_id: string;
  timestamp: string;
  actor_id: string;
  actor_role: Role;
  target_kind: string;
  target_id: string;
  action_type: string;
  status: AuditStatus;
  reason: string;
  kind: AuditKind;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/// How a kernel plugin's version compares to what this console was built against
/// (ADR-0089). Three states, not a boolean: collapsing a patch difference and a
/// breaking one either cries wolf on every release or stays silent through a
/// breaking one. Computed in the Rust core, because the pinned table is a
/// property of the compiled client.
export type PluginSkew = 'aligned' | 'minor' | 'major' | 'unknown';

export interface PluginPanelSpec {
  id: string;
  title: string;
  capability: string;
}

/// One plugin the kernel declared, as the console sees it (ADR-0089). Present
/// even when the plugin did NOT register, so the console can say why a surface
/// is missing instead of simply not showing it.
export interface PluginState {
  id: string;
  display_name: string;
  version: string;
  /// active | deps_unmet | not_entitled | expired (ADR-0082 D9)
  state: string;
  capabilities: string[];
  panels: PluginPanelSpec[];
  reason: string;
  missing: string[];
  expires_at: string;
  skew: PluginSkew;
  /// The version this console was built against; empty when nothing is pinned.
  pinned_version: string;
}

export interface StateOfRecord {
  connection: ConnectionState;
  role: Role | null;
  kernel_version: string;
  contract_version: string;
  capabilities: string[];
  contract_skew: number; // 0 = aligned
  plugins: PluginState[];
  cursor: number; // the last folded seq
  plans: PlanInFlight[];
  sessions: SessionSummary[];
  audit_tail: AuditEntry[];
  pending_hitl: HITLIntervention[];
  // UI-IMPL-21a: subsystem entity caches (projected from snapshots/events)
  agents: AgentSummary[];
  tools: ToolSummary[];
  skills: SkillSummary[];
  mcp_servers: MCPServerSummary[];
  scope: Record<string, ScopeSummary>;
  watch_configs: WatchConfigSummary[];
  lifecycle: LifecycleState;
  verifier_pool: VerifierPoolState;
  cost_dashboard: CostDashboard;
  /**
   * Bounded tail of MemoryWrittenOps. Optional because a core predating the
   * memory page omits it entirely — read sites must tolerate `undefined` rather
   * than assume an empty array means "nothing was ingested".
   */
  memory_written?: MemoryWrittenEvent[];
}

// ============================================================================
// UI-IMPL-21a: subsystem entity types (mirrors proto UI-IMPL-21a addition)
// ============================================================================

export interface AgentSummary {
  id: string;
  trait: string; // "Cognitive" | "Model" | "Daemon"
  scope_summary: string;
  trust_score: number;
  last_activity_at: string; // ISO 8601
  last_state: string;
}

export interface AgentDetail extends AgentSummary {
  manifest_version: string;
  manifest_json: string;
  cognitive_fingerprint: string; // TraitCognitive only
  scope: ScopeConfig;
  trust_score_ewma: number;
  recent_verification_outcomes: string[];
  last_error: string;
  last_successful_plan_id: string;
}

export interface ToolSummary {
  id: string;
  description: string;
  danger: boolean;
  granted_agent_count: number;
  recent_invocation_count: number;
  last_cost: number;
  /** What domain the tool touches — `crm`, `filesystem`, `payments` (ADR-0085 D2). */
  classification_tags?: string[];
  /** The closed verb classes it exercises (ADR-0086). */
  effects?: string[];
  /**
   * True when effects were DERIVED from the manifest rather than declared. The
   * strict-mode migration checklist: an operator flips
   * `execution.tool_effects_strict` once nothing is inferred.
   */
  effects_inferred?: boolean;
}

export interface ToolDetail extends ToolSummary {
  manifest_version: string;
  schema_json: string;
  granted_agents: string[];
}

export interface SkillSummary {
  id: string;
  description: string;
  scope_tags: string[];
  loaded_in_count: number;
  last_loaded_at: string; // ISO 8601
}

export interface SkillDetail extends SkillSummary {
  skill_md: string;
  bundled_tool_grants: string[];
  where_loaded: string[];
}

export interface MCPServerSummary {
  id: string;
  connection_state: string; // "Up" | "Reconnecting" | "Down"
  tool_count: number;
  last_health_check_at: string; // ISO 8601
  default_price: number;
}

export interface MCPServerDetail extends MCPServerSummary {
  health_check_history: string[];
  discovered_tools: string[];
}

export interface ScopeSummary {
  agent_id: string;
  effective_scope_summary: string;
  default_write_tags: string[];
  last_scope_change_at: string; // ISO 8601
}

export interface ScopeDetail {
  agent_id: string;
  effective_scope: ScopeConfig;
  default_write_tags: string[];
  caller_scope: ScopeConfig;
  k_anonymity_floor: number;
  scope_change_history: string[];
}

// ============================================================================
// P2: Watch & Reactive (PRD-06 §11)
// ============================================================================

export interface WatchConfigSummary {
  id: string;
  target_streams: string[];
  last_fire_at: string | null; // ISO 8601
  last_fire_status: string; // "ok" | "error" | "pending"
  error_count: number;
}

export interface WatchConfigDetail extends WatchConfigSummary {
  rule: string; // YAML or structured
  last_fires: WatchFire[];
  errors: string[];
}

export interface WatchFire {
  status: string;
  duration_ms: number;
  output: string;
  fired_at: string; // ISO 8601
}

// ============================================================================
// P2: Lifecycle (PRD-06 §12)
// ============================================================================

export interface LifecycleState {
  scheduler_state: string; // "idle" | "consolidating" | "dormant"
  pending_jobs: number;
  last_consolidation: ConsolidationJob | null;
  dormancy_events: DormancyEvent[];
}

export interface ConsolidationJob {
  timestamp: string; // ISO 8601
  duration_ms: number;
  status: string; // "running" | "completed" | "failed"
}

export interface DormancyEvent {
  agent_id: string;
  event_type: string; // "dormant" | "reactivated"
  timestamp: string; // ISO 8601
}

// ============================================================================
// P2: Verifier Pool (PRD-06 §13)
// ============================================================================

export interface VerifierPoolState {
  pool_agents: VerifierPoolAgent[];
  recent_rounds: VerifierRound[];
  surveillance_triggers: SurveillanceTrigger[];
}

export interface VerifierPoolAgent {
  agent_id: string;
  merit_score: number;
}

export interface VerifierRound {
  task_id: string;
  verifier_id: string;
  target_agent: string;
  quality_score: number;
  cross_verification_status: string; // "pending" | "passed" | "failed"
}

export interface SurveillanceTrigger {
  agent_id: string;
  reason: string;
  fired_at: string; // ISO 8601
}

// ============================================================================
// P2: Cost & Energy (PRD-06 §14, UI-014)
// ============================================================================

export interface CostDashboard {
  spend_rate_usd: number;
  circuit_breakers: CircuitBreaker[];
  max_energy_per_step: number;
  price_ledger: PriceLedgerEntry[];
  recent_acquires: AcquireOutcome[];
}

export interface CircuitBreaker {
  model_id: string;
  state: string; // "ok" | "warn" | "err"
  reason: string;
}

export interface PriceLedgerEntry {
  model_id: string;
  cost_per_token: number;
  currency: string;
}

export interface AcquireOutcome {
  model_id: string;
  acquired: boolean;
  latency_ms: number;
  timestamp: string; // ISO 8601
}

// ============================================================================
// Token chunks (live-only lane; per EC-4 + ADR-0018).
// Never replayed; live-only.
// ============================================================================

export interface TokenChunk {
  session_id: string;
  step_index: number;
  text: string;
}

// ============================================================================
// Memory (ADR-0047 A2.4; kernel contract 0057).
// ============================================================================

/** One retrieval hit. */
export interface MemoryHit {
  doc_id: string;
  /** <=200-char preview. NOT quotable — use `text` for a citation. */
  summary: string;
  /** The verbatim chunk body: what a source card quotes. */
  text: string;
  /** ADR-0060 structural breadcrumb ("Ops Review > 3.2 Incidents"). Empty for flat docs. */
  section_path: string;
  score: number;
  source: string;
  importance: number;
  tags: string[];
}

/**
 * Ingest params. Exactly one body lane:
 *   - text lane:   `text` set, `content` empty.
 *   - binary lane: `content` set (raw bytes -> docling structure parse) + `filename`.
 * The kernel rejects both-or-neither, and rejects `content` without `filename`
 * (the extension is what routes the chunker).
 */
export interface IngestMemoryParams {
  text: string;
  /** Raw file bytes. Marshalled to a JS number[] over the Tauri IPC bridge. */
  content: number[];
  /** Original filename, e.g. "2026-W29-ops-review.pdf". Required with `content`. */
  filename: string;
  content_type: string;
  /** Operator note; folded into the body by the kernel so it is chunked + embedded. */
  context: string;
  /** Narrow-only classification hint. Empty = readable by any principal. */
  tags: string[];
  importance: number;
  source: string;
  session_id: string;
  reason: string;
}

/** `[doc_id, deduped]`. `deduped` = replayed command_id, NOT a content duplicate. */
export type IngestMemoryResponse = [string, boolean];

/** File lane: the core reads bytes from this local `path`; no bytes cross IPC. */
export interface IngestFileParams {
  path: string;
  context: string;
  tags: string[];
  importance: number;
  reason: string;
}

/** Name + size of a picked file (bytes not read). */
export interface FileStat {
  name: string;
  size: number;
}

export interface QueryMemoryParams {
  query: string;
  top_k: number;
  source: string;
  session: string;
  min_importance: number;
}

/** One citation the answer's [n] markers resolve to (ADR-0081). */
export interface Citation {
  /** The [n] used inline in `answer`. */
  marker: number;
  doc_id: string;
  /** The verbatim chunk — what this citation quotes. */
  text: string;
  section_path: string;
  source: string;
  score: number;
  importance: number;
  tags: string[];
}

/**
 * A ranked recall, plus the kernel's explanation when access policy shaped it.
 *
 * `policy_note` is empty whenever policy played no part, so it can be rendered
 * unconditionally. It matters most when `hits` is EMPTY: a fail-closed model
 * turns a misconfiguration into zero rows and no error, which reads exactly like
 * an empty corpus (ADR-0085 INV-3).
 */
export interface MemoryQueryResult {
  hits: MemoryHit[];
  policy_note: string;
}

/**
 * One row of the document listing (contract 0070).
 *
 * A listing row, not a document: no body, no chunks. Enough to decide what to label
 * and nothing more, so paging a large corpus stays cheap.
 */
export interface DocumentSummary {
  id: string;
  title: string;
  source_type: string;
  /** Empty means NO RULE CAN REACH THIS DOCUMENT — the state this listing exists to surface. */
  tags: string[];
  chunk_count: number;
  created_at_unix_ms: number;
}

export interface ListDocumentsParams {
  limit?: number;
  /** Keyset cursor: the `next_cursor` of the previous page. Opaque. */
  cursor?: string;
  unlabelled_only?: boolean;
  id_prefix?: string;
}

/** One page of the listing, plus the size of the whole matching set. */
export interface DocumentPage {
  documents: DocumentSummary[];
  /** Empty when the listing is exhausted. */
  next_cursor: string;
  /**
   * Total matching the filter, ignoring paging. "422 of 1163" is what tells an
   * operator how much of the corpus no rule can reach; "50 shown" does not.
   */
  total_matching: number;
}

/** A grounded, cited answer (ADR-0081). `status` = answer | abstention | clarification. */
export interface AnswerMemory {
  status: string;
  /** Grounded prose with inline 1-based [n] markers resolving to `citations`. */
  answer: string;
  citations: Citation[];
  /**
   * Set when access policy CAUSED this abstention, rather than the corpus.
   * Empty when policy played no part (ADR-0085 INV-3).
   *
   * "The corpus does not answer that" and "you are not permitted to see the
   * answer" are very different statements. Without this they render identically.
   */
  policy_note?: string;
}

/**
 * One `MemoryWrittenOp` off the feed — the ingest queue's status lane (no polling).
 * A document emits one event per chunk, so the count for a `doc_id` is its chunk
 * count. `seq` is the dedup key: the op carries no id of its own.
 */
export interface MemoryWrittenEvent {
  seq: number;
  doc_id: string;
  doc_type: string;
  session_id: string;
  source: string;
  summary: string;
  written_at: string;
}

// ============================================================================
// Access policy (ADR-0085 / 0086 / 0087) — the first premium UI surface.
//
// Two planes back these types. `explainAccess` and `listClassificationTags` ride
// the pinned OSS contract, so they work against any kernel serving 0066. The
// rest ride premium's own AccessPolicyAdmin plane (ADR-0073/0088) and exist only
// when the kernel advertises the `access-policy` capability — gate on it the way
// the memory page gates `memory-answer`, and render an empty state that names
// what to enable rather than surfacing an Unimplemented error.
// ============================================================================

/** The controlled reason vocabulary a decision can carry. */
export type DecisionReason =
  | 'allowed'
  | 'bypass'
  | 'forbidden_tag'
  | 'missing_required_tag'
  | 'anyof_unsatisfied'
  | 'effect_not_permitted'
  | 'unsatisfiable_policy'
  | 'no_principal'
  | 'skill_grant_clipped'
  | 'not_authorized';

/** The closed set of tool effect classes (ADR-0086). */
export type ToolEffect = 'read' | 'write' | 'egress' | 'spend' | 'admin';

export const TOOL_EFFECTS: ToolEffect[] = ['read', 'write', 'egress', 'spend', 'admin'];

/** Container kinds, in application order — broadest first. This IS the precedence order. */
export type ContainerKind = 'organisation' | 'group' | 'principal' | 'surface';

export const CONTAINER_KINDS: ContainerKind[] = [
  'organisation',
  'group',
  'principal',
  'surface',
];

/**
 * One policy, linked at one container, contributing one term — what turns a
 * denial from "no" into "because policy P, linked at L, contributed tag T".
 */
export interface PolicyContribution {
  policy_id: string;
  policy_name: string;
  /** `organisation` | `group:<id>` | `principal:<id>` | `surface:<id>` */
  linked_at: string;
  /** `required` | `any_of` | `forbidden` | `effect` */
  term: string;
  values: string[];
  /** A downstream Block Inheritance does not apply to this link. */
  enforced: boolean;
}

/** A structured, explainable access decision. */
export interface AccessDecision {
  allowed: boolean;
  reason: DecisionReason | string;
  /** The SPECIFIC tag, clause, or effect responsible. */
  detail: string;
  decided_by: PolicyContribution[];
  policy_version: string;
  report_only: boolean;
  would_have_denied: boolean;
  /** One administrator-readable sentence, rendered kernel-side. */
  explain: string;
}

export interface ScopeRule {
  required_tags: string[];
  any_of_tags: string[];
  forbidden_tags: string[];
  /**
   * Reopens a CLOSED tag (ADR-0091) — the only term that adds access rather than
   * removing it. The kernel refuses a grant on an open tag, so an editor must
   * offer closed tags only; otherwise the author gets a rejection they cannot
   * explain from the form they just filled in.
   */
  granted_tags: string[];
}

/**
 * One classification tag and whether it is deny-by-default (ADR-0091).
 *
 * Closed-ness changes what every other term in a policy means, so it is shown
 * wherever a tag is shown. A closed tag in a Forbidden field is redundant; one in
 * a Required field with no matching grant is a boundary that matches nothing.
 */
export interface TagSpec {
  tag: string;
  closed: boolean;
}

/** One registered ingress — a point where the outside world enters (ADR-0090). */
export interface IngressSpec {
  agent_id: string;
  surface_kind: string;
  surface_id: string;
  /** Prefixes of external ids this ingress may speak for. Empty = unrestricted. */
  namespace: string[];
}

/**
 * Everything the console knows about the Telegram ingress.
 *
 * There is deliberately no token field. The credential is write-only across the whole
 * surface: a panel that can display it leaks it to whoever is looking at the screen, to a
 * screen recording, and to anything that logs the response. `token_configured` and
 * `bot_username` are what an operator actually needs — one says a credential exists, the
 * other confirms it works, and neither reveals it.
 */
export interface TelegramStatus {
  /** The operator's intent: should the ingress be running. */
  enabled: boolean;
  /** Whether a credential is stored. Never the credential itself. */
  token_configured: boolean;
  /** Public bot handle from the Bot API, e.g. "@Cambrian1_bot". Empty until verified. */
  bot_username: string;
  /** Whether the daemon is actually polling — not the same as `enabled`. */
  running: boolean;
  /** Registered ingress identity, so the applicable policy is visible. */
  surface: string;
  namespace: string[];
  /** 'off' | 'no_token' | 'starting' | 'running' | 'error' */
  state: string;
  /** Human sentence explaining `state` when it is not self-evident. */
  detail: string;
  /** Telegram's own setting: when true the bot only sees messages that mention it. */
  privacy_mode: boolean;
}

/** Result of a write on the Telegram surface. `error` is a sentence for the operator. */
export interface TelegramAck {
  ok: boolean;
  error: string;
}

export interface EffectRule {
  /** Empty means every effect (subject to `deny`). */
  allow: string[];
  /** Always wins, consistent with forbidden tags being absolute. */
  deny: string[];
}

export interface GroupSpec {
  id: string;
  name: string;
  members: string[];
  subgroups: string[];
  /** Stops policy accumulating from above — except denies, and except Enforced links. */
  block_inheritance: boolean;
}

export interface PolicySpec {
  id: string;
  name: string;
  version: number;
  rule: ScopeRule;
  effects: EffectRule;
  /** `enforced` | `report_only` */
  mode: string;
  expires_at_unix_ms: number;
  granted_by: string;
  updated_at_unix_ms: number;
}

export interface LinkSpec {
  policy_id: string;
  container_kind: ContainerKind | string;
  target_id: string;
  enforced: boolean;
  order: number;
  expires_at_unix_ms: number;
  granted_by: string;
}

/** `gpresult` for a principal: the effective predicate AND its attribution. */
export interface ResultantPolicy {
  effective: ScopeRule;
  /** CNF: each clause is an OR-set, all clauses ANDed. */
  any_of_clauses: string[][];
  contributions: PolicyContribution[];
  effects: EffectRule;
  policy_version: string;
  /**
   * Set when the effective predicate can never match anything. A SAFE state
   * (zero rows) and therefore the easiest to mistake for "there is no data",
   * so it must be shown, not implied.
   */
  unsatisfiable_reason: string;
  /** The containers the principal resolved into, outermost first. */
  groups: string[];
}

export interface SimulatedDecision {
  principal: string;
  surface: string;
  resource: string;
  tags: string[];
  allowed_now: boolean;
  allowed_under_draft: boolean;
  reason_under_draft: string;
  detail_under_draft: string;
  at_unix_ms: number;
}

/** The blast radius of a draft policy set. */
export interface SimulationResult {
  decisions: SimulatedDecision[];
  /** Allowed today, denied under the draft — the number that matters. */
  newly_denied: number;
  newly_allowed: number;
  unchanged: number;
}

/**
 * One reason a proposal is not safe to apply as it stands. Severity is data
 * rather than prose so the console can sort and colour without reading sentences.
 */
export interface ProposalProblem {
  /** `blocking` | `warning` */
  severity: string;
  message: string;
}

/**
 * A policy drafted from a description in English (ADR-0092).
 *
 * Nothing here is applied. Approving means calling savePolicy and linkPolicy —
 * the same two calls used for hand-authored policy — so approval cannot route
 * around a validation or an audit record.
 */
export interface PolicyProposal {
  /** The model's explanation, shown as CONTEXT. Not the thing being approved. */
  rationale: string;
  policy: PolicySpec;
  links: LinkSpec[];
  problems: ProposalProblem[];
  simulation: SimulationResult;
  /**
   * How many journalled decisions the simulation replayed. Zero counts over an
   * empty journal mean "nothing to compare", NOT "no effect" — the pane must say
   * which of the two it is showing.
   */
  simulation_basis: number;
  /** Server-computed, so the client cannot disagree about what is safe. */
  blocking: boolean;
}

export interface DecisionRecord {
  at_unix_ms: number;
  principal: string;
  surface: string;
  resource: string;
  allowed: boolean;
  reason: string;
  detail: string;
  policy_version: string;
  report_only: boolean;
  would_have_denied: boolean;
  decided_by: PolicyContribution[];
}

/**
 * An authoring outcome that is NOT an error: a group cycle, an unsatisfiable
 * rule, a coined tag. Rendered next to the field rather than as a failure toast.
 */
export interface SaveOutcome {
  ok: boolean;
  error: string;
  version: number;
}

export interface ExplainAccessParams {
  principal_id: string;
  principal_kind?: string;
  surface_kind?: string;
  surface_id?: string;
  resource_kind?: string;
  resource_id?: string;
  tags?: string[];
  effects?: string[];
}
