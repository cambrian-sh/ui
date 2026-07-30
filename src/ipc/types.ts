

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
  /**
   * The LIVE values, keyed exactly as `setRuntimeConfig` keys them, so read and
   * write agree on shape and booleans travel as 1/0 in both directions.
   */
  current_values: Record<string, number>;
  /**
   * key -> "default" | "tuning.json" | "config.json" | "store" | "runtime" |
   * "env:CAMBRIAN_...".
   *
   * This is the field that closes "I changed it, it saved, and nothing
   * happened": an `env:` source means a write to that key is SHADOWED, so the
   * field must render read-only NAMING the pin rather than accepting an edit
   * that silently does nothing.
   */
  value_source: Record<string, string>;
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
  /**
   * The capability contract this step requires (ADR-0100).
   *
   * Optional because the field arrives with the P6 contract bump that retires
   * `AuctionEventOp`. Until then the kernel sends nothing here and the UI says
   * so rather than inventing a capability — see `DispatchTrace`.
   */
  required_capabilities?: string[];
  dispatch?: DispatchTrace;
}

/**
 * Which rung of the D5 resolution ladder matched a step's capability contract.
 *
 * `failed` is not an error state to hide — the ladder exhausting is a real,
 * measured outcome, and it is the one the operator has to be able to act on.
 */
export type CapabilityResolution = 'exact' | 'alias' | 'generalist' | 'failed';

/** One agent considered for a step, after the L1 eligibility gate. */
export interface DispatchCandidate {
  agent_id: string;
  /** Merit ranking, not a bid. Nobody was asked to quote for this work. */
  merit: number;
  dispatched: boolean;
}

/**
 * How a step found its agent, under capability-typed dispatch (ADR-0100).
 *
 * This replaces the auction bid chart. The important difference is not cosmetic:
 * the old path booted up to five agents per step and discarded four, so the
 * headline pair `rpcs` / `speculative_boots` is the most operator-visible thing
 * the change did and belongs at the top of the panel.
 */
export interface DispatchTrace {
  required_capabilities: string[];
  resolution: CapabilityResolution;
  /** What actually matched, once normalisation and the alias map ran. */
  matched_capability?: string;
  /** How many agents survived the L1 capability gate. */
  eligible_after_gate: number;
  /** Merit ranking, best first. The dispatched one is flagged. */
  ranked: DispatchCandidate[];
  rpcs: number;
  speculative_boots: number;
  /**
   * Set when `resolution === 'failed'`: the tag that matched nothing, verbatim.
   * Rendering a generic "no agents available" here loses the only fact that
   * makes the failure fixable.
   */
  unmatched_capability?: string;
  /** The live vocabulary the unmatched tag was compared against. */
  vocabulary?: string[];
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
  /**
   * Plans that have gone terminal, newest first, bounded.
   *
   * `plans` is Plans in Flight and drops a plan the moment it finishes. Without
   * this, a finished plan and a plan that never reported are the same
   * observation — absent — so nothing can tell "done" from "still waiting".
   */
  completed_plans?: PlanInFlight[];
  /**
   * Latest ADR-0098 progress line per conversation id (contract 0079).
   *
   * Live-only: the kernel emits these on the ephemeral lane, so they are never
   * replayed on resume and the map is cleared on resync. Absent key = no work
   * in flight for that conversation.
   */
  conversation_progress?: Record<string, ConversationProgress>;
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
  /**
   * The agent's DECLARED capabilities (contract 0072/0074).
   *
   * This is what makes route preview answerable in the UI at zero cost: the L1
   * eligibility gate is set containment over declared capabilities, so the
   * eligible set is computable exactly. Merit RANKING is not reproducible here
   * and must not be approximated — a fabricated ordering presented as the
   * kernel's would disagree with the real dispatch invisibly.
   */
  capabilities?: string[];
  /**
   * Detail fields contract 0057 removed and 0074 restored. Optional because a
   * kernel older than 0074 does not send them, and absent must stay
   * distinguishable from empty — a missing capability list is "not reported",
   * not "this agent declares nothing".
   */
  description?: string;
  runtime?: string;
  exec_path?: string;
  manifest_version?: string;
  /** Capability claims not yet verified by an interview. Routing differs. */
  provisional?: boolean;
  system?: boolean;
  classification_tags?: string[];
  /** Most recent reported failure — a failing agent must not look merely idle. */
  last_error?: string;
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

/** One arm's action — what a pipeline arm does when the gate passes. */
export interface WatchAction {
  /** `start_plan` | `dispatch_agent` | `emit_event` | `ingest` */
  type: string;
  /** `agent_id` | `capability` — required for `dispatch_agent`. */
  target_type: string;
  target: string;
  /** Template with `{field}` interpolation from the signal payload. */
  payload: string;
}

/**
 * The whole `WatchConfigOp`.
 *
 * `WatchConfigSummary` keeps only what the old list rendered; this carries the
 * condition, the action, the throttle and the schedule fields the pipeline
 * builder edits.
 *
 * Note `action` is **singular**: the kernel stores one action per watch, so a
 * multi-armed pipeline cannot be persisted yet (report.md §4.14a). Arms beyond
 * the first are marked `needs fan-out` rather than silently collapsed.
 */
export interface WatchConfigFull {
  id: string;
  name: string;
  description: string;
  /** `daemon` | `filesystem` | `webhook` | `signal_stream` | `schedule` */
  source_type: string;
  source_stream_id: string;
  condition: string;
  /** `deterministic` | `pattern` | `llm` | `always` */
  condition_type: string;
  daemon_params: Record<string, string>;
  action: WatchAction;
  active: boolean;
  response_mode: string;
  max_concurrent_plans: number;
  /** Coalesce at most once per T seconds. 0 = off. */
  debounce_seconds: number;
  /** REACT-03: the payload keys an llm condition may see. */
  condition_payload_keys: string[];
  /** REACT-03: operator ack for a high-risk llm condition. Reset on any edit. */
  approved: boolean;
  /** REACT-05: evaluate and record, never act. */
  dry_run: boolean;
  source_cron: string;
  source_timezone: string;
  /** `fire_once` | `skip` across a restart. */
  missed_fire_policy: string;
}

export interface WatchMetrics {
  watch_id: string;
  signals_seen: number;
  condition_fired: number;
  condition_suppressed: number;
  dry_run_would_fire: number;
  action_failed: number;
  dead_lettered: number;
  mean_condition_latency_ms: number;
}

export interface WatchDeadLetter {
  id: string;
  watch_id: string;
  action_type: string;
  /** Idempotency key; empty for queue-full or expired drops. */
  key: string;
  reason: string;
  signal_stream_id: string;
  signal_raw_text: string;
  failed_at_unix_ms: number;
}

/** One replayed signal. A backtest never executes an arm. */
export interface WatchBacktestVerdict {
  seq: number;
  stream_id: string;
  raw_text: string;
  would_fire: boolean;
  eval_error: string;
}

/**
 * A candidate profile handed to `PreviewRoute`.
 *
 * The RPC scores caller-supplied profiles so the preview is deterministic and
 * needs no live fleet — which is why the DAG builder cannot yet answer "who
 * would take this step" against the real registry. See report.md §4.12.
 */
export interface PreviewCandidate {
  agent_id: string;
  trait_name: string;
  success_rate: number;
  trust_score: number;
  network_latency_ms: number;
  computation_latency_ms: number;
  context_growth_bytes: number;
  provisional: boolean;
  avg_cost_per_task: number;
}

export interface PreviewRanked {
  agent_id: string;
  score: number;
  success_rate: number;
  trust_score: number;
  latency_term: number;
  cost_term: number;
  provisional: boolean;
}

export interface PreviewRouteResult {
  ranked: PreviewRanked[];
  /** `hand_weights` | `learned_scorer` — which scorer produced this. */
  arm: string;
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
/** One ADR-0098 progress snapshot. These supersede — never accumulate. */
export interface ConversationProgress {
  conversation_id: string;
  /** The rendered line. The kernel clears by sending empty text, and the fold
   *  removes the entry, so a present entry always has something to say. */
  text: string;
  phase: string;
  step: number;
  total_steps: number;
  final: boolean;
  updated_at_unix_ms: number;
}

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
/** One configured bot (contract 0081). */
export interface TelegramBot {
  id: string;
  label: string;
  surface: string;
  agent_id: string;
  token_configured: boolean;
  enabled: boolean;
  running: boolean;
  bot_username: string;
  /** 'off' | 'no_token' | 'starting' | 'running' | 'error' */
  state: string;
  detail: string;
  /** False ⇒ traffic arrives with no policy on the door it came through. */
  surface_registered: boolean;
}

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
  /** Which bot this status is for (contract 0081). */
  bot_id: string;
  label: string;
  /**
   * The principal this bot's daemon runs as — the id the ingress registry maps to
   * this bot's surface. Distinct per bot, which is what makes a per-bot surface
   * possible at all.
   */
  agent_id: string;
  /**
   * Whether an ingress registration exists for this bot's surface.
   *
   * False means traffic arrives with NO POLICY attached to the door it came
   * through. The bot still polls, receives and answers — which is exactly why it
   * must not render as healthy.
   */
  surface_registered: boolean;
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
  /**
   * Where each filled blank came from — what the operator actually said versus
   * what the model inferred (additive; absent on kernels that predate it).
   *
   * The inferred ones are the ones that deserve a second read, and without this
   * they are indistinguishable from the stated ones. Keyed by the `ScopeRule`
   * field name, plus `container`.
   */
  provenance?: Record<string, 'stated' | 'inferred'>;
  /**
   * Phrases in the request that produced no term at all.
   *
   * Silently dropping half a request is how an operator comes away believing
   * they asked for something they did not. Said out loud, with the reason.
   */
  unmapped_phrases?: string[];
  /**
   * PROPOSED (`8b`): the assistant asking instead of drafting.
   *
   * Today an unresolvable phrase becomes a blocking problem *after* drafting.
   * It should be a question asked while the operator still has the intent in
   * mind. When this is present the pane renders the question rather than a
   * draft — one call returns either, which keeps the state machine simple.
   */
  questions?: ProposalQuestion[];
}

/**
 * A candidate resolution for an unresolved phrase, and what choosing it costs.
 *
 * The cost is the point. "Did you mean `finance`?" is not answerable; "`finance`
 * is closed and currently granted to support-team, so restricting it revokes
 * that grant" is.
 */
export interface ResolutionCandidate {
  tag: string;
  closed: boolean;
  /** How many documents carry it — `internal` being broad is a real objection. */
  document_count: number;
  /** One sentence naming what choosing this would change. */
  cost: string;
}

/** One phrase the assistant could not resolve, asked as a question. */
export interface ProposalQuestion {
  /** The operator's words, verbatim. */
  phrase: string;
  candidates: ResolutionCandidate[];
  /** What DID resolve, so the operator sees the question is narrow. */
  resolved_context: { phrase: string; resolved_to: string }[];
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

// ============================================================================
// Models & providers (turn 9 `9b`/`9c`).
//
// PROPOSED SHAPE — nothing in the pinned contract serves this yet. The console
// renders these panes fully when the kernel sends them and says "not reported
// by this kernel" when it does not, so the surface can be reviewed now and the
// kernel team has a concrete target rather than a description.
//
// See operator_ui_refactor/report.md for the contract request.
// ============================================================================

/** Live breaker state for one generator. */
export type BreakerState = 'closed' | 'half_open' | 'open';

/**
 * A generator is a thing with a pulse, not a config entry.
 *
 * Every field here exists because a card has to answer "is this healthy, is it
 * being used, and would I notice if it stopped" without a second navigation.
 */
export interface GeneratorSpec {
  /** Permanent — roles refer to it, so it is not editable after creation. */
  id: string;
  /** `openai` | `anthropic` | `ollama` | … the wire protocol, not the vendor. */
  protocol: string;
  endpoint: string;
  model: string;
  timeout_ms: number;
  /** Work it will be offered. A tag it lacks is work it never sees. */
  capability_tags: string[];
  native_tools: boolean;
  disable_thinking: boolean;

  breaker: BreakerState;
  /** Consecutive failures, against `health.failure_threshold`. */
  recent_failures: number;
  p50_latency_ms: number;
  p99_latency_ms: number;
  /** Token volume today. Never money — see `formatTokens`. */
  tokens_today: number;
  calls_today: number;
  /** Recent per-call latency, oldest first, for the sparkline. */
  latency_samples: number[];

  /** Whether a credential is stored. NEVER the credential. */
  key_configured: boolean;
  /** Enough to tell which key this is, not enough to leak it. */
  key_last_four: string;
  key_added_at: string;
  key_last_used_at: string;

  last_tested_at: string;
  last_test_ok: boolean;
}

/** The roles a generator can be pointed at. */
export type GeneratorRole = 'planner' | 'verifier' | 'router' | 'interview' | 'memory';

export const GENERATOR_ROLES: GeneratorRole[] = [
  'planner',
  'verifier',
  'router',
  'interview',
  'memory',
];

/** Which generator serves each organ, plus the live fallback when one is open. */
export interface RoleAssignment {
  role: GeneratorRole;
  generator_id: string;
  /** Set when the assigned generator's breaker is open and work is falling back. */
  falling_back_to?: string;
}

/**
 * One real call against the live endpoint, reporting what the endpoint *did*.
 *
 * `model_served` is the check that matters: an endpoint answering happily with
 * a different build is the most common misconfiguration in this space, and
 * nothing else in the console would ever reveal it.
 */
export interface GeneratorTestResult {
  reachable: boolean;
  round_trip_ms: number;
  authenticated: boolean;
  /** What the endpoint echoed back. Compared against the configured model. */
  model_served: string;
  model_matches: boolean;
  native_tools_ok: boolean;
  tokens_in: number;
  tokens_out: number;
  tokens_cached: number;
  error: string;
}

// ============================================================================
// Part 3 PROPOSED SHAPES — nothing on the contract serves these yet.
//
// Each screen renders fully when the kernel sends the data and says "not
// reported by this kernel" when it does not. See report.md §4.8–§4.15 for the
// contract requests, with the reasoning for each field.
// ============================================================================

/** `10c` Langfuse. The three switches are separate disclosure decisions. */
export interface TelemetryConfig {
  host: string;
  project: string;
  public_key_configured: boolean;
  public_key_last_four: string;
  /** Whether a secret is stored. NEVER the secret. */
  secret_key_configured: boolean;
  sample_rate: number;
  /** Plan/step shape, latency, token counts. No content. */
  send_structure_and_timings: boolean;
  /** The actual text — prompts and model outputs leave the box. */
  send_prompts_and_outputs: boolean;
  /** Traces from surfaces with an enforcing policy. Off by default. */
  send_from_enforcing_surfaces: boolean;
}

export interface TestTraceResult {
  ok: boolean;
  round_trip_ms: number;
  error: string;
}

/**
 * `11` The three things a binding can point at.
 *
 * `room_group` is a DELEGATION and is its own kind on purpose: membership of
 * that room is the platform's to change, not yours, so anyone an admin adds
 * inherits the group the moment they mention the bot. An audit has to be able to
 * tell a delegated room from a named person.
 */
export type BindingKind = 'principal' | 'group' | 'room_group';

/**
 * One principal this deployment actually has.
 *
 * DERIVED, never registered: there is no principal table, so the set is assembled
 * from the agent registry, group membership, policy links and identity bindings.
 * `sources` says which of those each row came from — a derived list that cannot
 * say where a row came from is one an operator has to take on faith.
 */
export interface PrincipalSpec {
  id: string;
  /** 'agent' | 'user' | 'daemon' | 'system' | 'unknown' */
  kind: string;
  display_name: string;
  /** 'agent_registry' | 'group:<id>' | 'policy_link:<id>' | 'identity_binding:<surface>' */
  sources: string[];
  group_ids: string[];
  has_direct_policy: boolean;
  /**
   * A policy or group REFERS to this principal but nothing registers it, so that
   * policy applies to nobody — and looks identical to a working boundary
   * everywhere else in the console.
   */
  orphaned: boolean;
}

/** `11` One bound identity. Bound on the numeric id, never the username. */
export interface IdentityBinding {
  surface: string;
  /** The stable numeric id. A username changes; a phone is rarely present. */
  external_id: string;
  /** A label so a human recognises the row. Never matched on. */
  username: string;
  display_name: string;
  bound_to_kind: BindingKind;
  bound_to_id: string;
  bound_at_unix_ms: number;
  /** Set when the username changed — the binding held, because it is on the id. */
  username_changed_from: string;
  blocked: boolean;
}

/**
 * Someone who has messaged and is not yet anybody. The actual worklist.
 *
 * Note what is absent: what they asked about, and how often policy denied them.
 * The kernel journals access DECISIONS, not request bodies, so neither is on the
 * wire — and a console that invented them would be fabricating the evidence an
 * operator uses to decide who gets reach.
 */
export interface UnboundSender {
  surface: string;
  external_id: string;
  /**
   * Labels relayed from the platform, never matched on. EMPTY when more than one
   * person speaks through this external id — see `speaker_ids`. A shared entry
   * point has no single name, and labelling it after whoever spoke first would
   * let an operator bind a room believing they had bound the person they saw.
   */
  username: string;
  display_name: string;
  message_count: number;
  first_seen_unix_ms: number;
  last_seen_unix_ms: number;
  /**
   * The distinct people observed speaking through this external id.
   *
   * More than one means this row is a ROOM, not a person: binding it hands
   * whatever it is bound to to everyone in it, and membership is the platform's
   * to change.
   */
  speaker_ids: string[];
}

/** What someone the operator has never heard of gets. */
export type StrangerPolicyMode = 'surface_default' | 'guest_principal' | 'refuse_until_bound';

export interface StrangerPolicy {
  surface: string;
  mode: StrangerPolicyMode;
  /** For `guest_principal`. */
  guest_principal_id: string;
  /**
   * Documents a stranger can currently read — the reach, spelled out. `-1` means
   * it could not be computed and must render as UNKNOWN; showing 0 would read as
   * "a stranger reaches nothing", which is the opposite of not knowing.
   */
  readable_documents: number;
}

/** `12a` The router's decision, before it acts (ADR-0031). */
/**
 * The kernel's router vocabulary, verbatim (`domain/router.go`). FIVE values.
 *
 * `ingest` is the one a client must never collapse into another: it WRITES to
 * memory, and whatever it writes inherits the ingress's labels. Rendering it as
 * a read makes an operator approve a write believing they approved a question.
 *
 * `clarification` means the router itself could not decide and is asking — the
 * question and options come back on the same response.
 */
export type InputClassification =
  | 'chat'
  | 'plan'
  | 'ingest'
  | 'watch'
  | 'clarification';

export interface ClassifiedInput {
  /** Show an UNRECOGNISED value verbatim and do not act: the kernel is newer. */
  classification: InputClassification;
  /** Populated only when `classification === 'clarification'`. */
  clarification_question?: string;
  clarification_options?: string[];
  /** "not a question — it wants to read files and reason over them" */
  why: string;
  confidence: number;
}

export interface InterviewOption {
  label: string;
  /** A real count: "Q2 only — 61 documents". */
  detail: string;
}

export interface InterviewQuestion {
  question: string;
  kind: 'scope' | 'judgement';
  options: InterviewOption[];
  /** Why the data cannot decide it. */
  why_it_changes_the_answer: string;
}

/**
 * What `proposePlan` returns.
 *
 * A vague goal comes back as **questions, not a bad plan**: ADR-0100 D3 makes
 * planner output the ceiling on routing quality, so vagueness cannot be
 * recovered downstream and the interview is a feature rather than a delay.
 */
export interface PlanProposalResponse {
  /** Non-empty when the goal is too vague to plan. Answer these first. */
  questions: InterviewQuestion[];
  /** Present once the goal is answerable. */
  proposal: PlanProposal | null;
  /**
   * Volunteered before planning, not after: what the plan will touch, and what
   * an answer written back into memory inherits.
   */
  access_consequence: string;
}

/** `12b` One step of an operator-authored plan. Maps to `domain.Step`. */
export interface AuthoredStep {
  query: string;
  required_capabilities: string[];
  depends_on: number[];
  max_energy: number;
  recommended_model: string;
  checkpoint_after: boolean;
  checkpoint_query: string;
  /** Soft pin — goes first, ranking still behind it, a crash cascades normally. */
  preferred_agent: string;
  /** Hard pin — this agent or nothing; the step dies if it is unavailable. */
  agent_pin: string;
  /** A reasoning/synthesis step: no external action, so no capability is gated. */
  is_thought: boolean;
  /**
   * Index of an earlier step whose output supplies a SET; this step then runs
   * once per item.
   *
   * **-1 means "not a fan-out".** proto3 has no absent int32 and 0 is a
   * legitimate step index, so the sentinel is the only way to distinguish
   * "fan out over step 0" from "do not fan out" — sending 0 for absent turns
   * every ordinary step into a fan-out over the first one.
   */
  fan_out_over: number;
  /** Template variable substituted per item. Empty ⇒ "item". */
  fan_out_var: string;
}

/** One problem found in an authored plan. */
export interface PlanValidationIssue {
  /** The offending step, or -1 for a whole-plan problem. */
  step_index: number;
  /** Stable token: "cycle" | "out_of_bounds_dependency" | "empty_query" | … */
  code: string;
  message: string;
  /**
   * Fatal blocks submission; advisory does not. They must render differently —
   * conflating them either alarms about something harmless or buries the thing
   * that actually stopped the plan.
   */
  fatal: boolean;
}

/** What `submitPlan` returns. */
export interface SubmitPlanResult {
  command_id: string;
  deduped: boolean;
  /** False when validation found a fatal issue — nothing was created or started. */
  accepted: boolean;
  session_id: string;
  plan_id: string;
  issues: PlanValidationIssue[];
  /** The topological order the executor would really use. */
  execution_order: number[];
}

/** A plan proposed and not started. Nothing is committed until Run it. */
export interface PlanProposal {
  steps: AuthoredStep[];
  estimated_tokens: number;
  estimated_wall_ms: number;
  max_parallel: number;
  /** Plain-English note about what the plan will touch. */
  access_note: string;
}

/**
 * `10b` One access decision made for traffic that arrived through an entry point.
 *
 * A filtered projection of the same decision journal `ExportDecisions` reads —
 * not a second record of the same events, which would be one more thing to keep
 * in step.
 */
export interface IngressActivity {
  surface: string;
  /**
   * The identity the decision was made for: the sender resolved through the
   * entry point, or the ingress DAEMON itself when no binding exists — which is
   * exactly the state that makes every sender interchangeable.
   */
  principal: string;
  resource: string;
  /**
   * `would_have_denied` is a report-only policy that has not been enforced yet —
   * the rollout signal, and invisible everywhere else.
   */
  /**
   * `would_have_denied` is a report-only policy that has not been enforced yet —
   * the rollout signal, and invisible everywhere else. `no_reply` is a message
   * that never got an answer, which the decision-journal source could never
   * surface: a turn that fails before touching a governed resource makes no
   * access decision at all.
   */
  outcome: 'answered' | 'no_reply' | 'policy_denied' | 'would_have_denied' | 'blocked';
  reason: string;
  at_unix_ms: number;
  /** The sender's address on the far side, as the ingress knows it. */
  external_id: string;
  /** The most recent thing they said. Empty when bodies are not recorded. */
  text: string;
  /** What the PERSON sent, not the whole exchange. */
  message_count: number;
  conversation_id: string;
}

export interface IngressActivityPage {
  activity: IngressActivity[];
  /** Whether this deployment records what was ASKED. It does not. */
  request_text_available: boolean;
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
