

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
  /**
   * Retention/compaction passes seen on the feed (`RetentionRunOp`, contract
   * 0084), oldest first. Gated on the `retention-feed` capability.
   *
   * Source-agnostic: the record compactor and the reactive-journal GC publish
   * the same shape, so read `source` rather than assuming one.
   *
   * Optional, and `undefined` is NOT the same as `[]`: a core predating this
   * omits the field, which means "this console cannot tell you", while an empty
   * array means "connected, and no pass has run". The retention panel has to
   * keep those apart — the whole point of the surface is that silence about
   * deletion is not evidence of it.
   */
  retention_runs?: RetentionRunEvent[];
  /**
   * Live per-node readings, keyed by pipeline (ADR-0114 D37).
   *
   * Absolute state per pipeline: a new reading replaces the last. Cleared on
   * resync, because these describe what the kernel is doing NOW and a reading
   * that survived a reconnect would claim continuity the runtime does not have.
   *
   * `undefined` means this core predates the op — "cannot tell" — which is not
   * the same as an empty map, meaning "connected, and nothing has run".
   */
  pipeline_meters?: Record<string, PipelineMeters>;
  /**
   * The most recent pipeline steps, newest last, bounded (ADR-0114 D38).
   *
   * An ordered ring rather than a map: this is a TRACE, and its value is the
   * order. Cleared on resync, like the meters — it describes motion happening
   * now, and a replayed step would show movement that is not occurring.
   */
  pipeline_steps?: PipelineStep[];
}

/** One item passing through one node. */
export interface PipelineStep {
  pipeline_id: string;
  revision: number;
  run_id: string;
  /**
   * Identifies the item ACROSS steps, which is what makes a sequence of these a
   * trace rather than a list.
   */
  item_key: string;
  node: string;
  kind: string;
  port: string;
  /** "routed" | "terminated" | "failed" */
  outcome: string;
  reason: string;
  duration_ms: number;
  /** A bounded preview of what the item carried; empty unless tracing is on. */
  payload: string;
  /** The UNTRUNCATED size, so a clipped payload is never mistaken for whole. */
  payload_bytes: number;
  /** Steps skipped by the kernel's rate cap since the last one sent. */
  dropped: number;
  at_unix_ms: number;
}

/** One pipeline's live per-node reading. */
export interface PipelineMeters {
  pipeline_id: string;
  revision: number;
  nodes: PipelineNodeMeter[];
}

/** One node's live reading. */
export interface PipelineNodeMeter {
  node: string;
  entered: number;
  /**
   * How many items are inside this node right now — the bottleneck signal, and
   * the one figure that cannot be reconstructed afterwards.
   */
  in_flight: number;
  /** Items the node could not process. Kept apart from an `error` port. */
  failed: number;
  /** Items that completed and were routed onward — the ordinary path. */
  passed_on: number;
  ports: Record<string, number>;
  mean_latency_ms: number;
}

/**
 * One retention/compaction pass (ADR-0102 A1).
 *
 * Two fields matter more than the counts. `bounded` on every tick means the
 * backlog is not draining — a capacity warning, not a status line. A non-empty
 * `error` means retention has STOPPED HAPPENING and data that should have been
 * erased is still on disk; failed passes are published precisely so that cannot
 * be silent.
 */
export interface RetentionRunEvent {
  /** e.g. "records" | "reactive_journal". Free-form by design. */
  source: string;
  run_id: number;
  started_at: string;
  finished_at: string;
  /** Empty means the pass ran and removed nothing — normal, not missing data. */
  deleted: RetentionDeletionEvent[];
  bounded: boolean;
  error: string;
}

export interface RetentionDeletionEvent {
  category: string;
  count: number;
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

// MCPServerSummary / MCPServerDetail (the mock-era feed-projection shapes) are
// GONE (2026-08-11): no kernel ever emitted them — the /mcp screen showed "no
// servers registered" on every deployment forever. The real shape is
// MCPServerConfig below, served by ListMCPServers (contract 0097).

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

/**
 * One authored reactive-pipeline revision (kernel contract 0087).
 *
 * NOT a `WatchConfigSummary`. A watch is one condition and a list of arms; a
 * pipeline is a versioned graph with typed ports, declared discards and a
 * durable execution store. They are listed from separate RPCs because widening
 * either shape to cover both would make one of them lie — a watch has no
 * revisions and no nodes, a pipeline has no single condition.
 *
 * Every ingress created through the Ingress Studio owns one, generated from its
 * mapping and armed with the ingress. An ingress that has not been armed has no
 * `armed` revision, and that is a normal state, not a fault.
 */
export interface PipelineSummary {
  pipeline_id: string;
  revision: number;
  name: string;
  /** `draft` | `validated` | `published` | `armed` | `retired` */
  state: string;
  /** `ingress` | `stream` | `schedule` | `manual` */
  trigger_type: string;
  /** The ingress id, stream id or cron expression the trigger names. */
  trigger_ref: string;
  node_count: number;
  edge_count: number;
  /** Nodes that can change something outside the process. */
  effect_node_count: number;
  /** The ingress mapping this graph was generated for; 0 when hand-authored. */
  mapping_revision: number;
  plan_checksum: string;
  /** Revision-independent, so cosmetic-only edits compare equal. */
  semantics_checksum: string;
  /** True when the Ingress Studio authored it rather than an operator. */
  generated: boolean;
  /** Evaluates everything and performs no effect (REACT-05). */
  dry_run: boolean;
  approved: boolean;
  /**
   * Whether the daemon feeding this pipeline is running.
   *
   * Three-valued. `undefined`/`null` means nobody can tell, which is a different
   * claim from `false` — an armed pipeline whose entry organ is switched off
   * looks identical to a working one in the store, and that difference is the
   * whole question when a bot stops answering.
   */
  entry_live?: boolean | null;
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
  /**
   * Qualifies a tag the policy already grants: the reader sees a record carrying
   * it only if they are a party to that record (ADR-0121) — "orders, but only
   * your own". A restriction, never a grant, so it can only remove rows.
   *
   * Present here because `savePolicy` sends this whole object back. A field the
   * projection omits is a restriction deleted by the act of editing something
   * else, and the policy that comes back reads as a full grant.
   */
  party_scoped_tags: string[];
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
  /**
   * What succeeded and what it left undone.
   *
   * A bot can be created successfully and still not be governed — its surface is
   * registered separately, under the operator's own authority — and an `ok`
   * alone cannot carry that.
   */
  detail: string;
}

// ── Ingress Studio (ADR-0112 §13) ──────────────────────────────────────────

/** Result of a studio write. Refusals are authoring outcomes carried in `error`. */
export interface StudioAck {
  ok: boolean;
  error: string;
  /** What succeeded and what it left undone. */
  detail: string;
}

/** One ingress row for the rail. */
export interface StudioIngress {
  ingress_id: string;
  display_name: string;
  /** DRAFT | CAPTURING | MAPPED | DRY_RUN | ARMED | PAUSED | RETIRED */
  state: string;
  /** ok | degraded | error — orthogonal to state by design. */
  health: string;
  pinned_release: string;
}

export interface StudioCredential {
  name: string;
  configured: boolean;
  /** Presence indicator only — never the value. */
  last_four: string;
}

/** The operator's whole picture of one ingress. */
export interface StudioStatus {
  summary: StudioIngress;
  latest_transport_revision: number;
  latest_mapping_revision: number;
  release_id: string;
  armed_transport_revision: number;
  armed_mapping_revision: number;
  capture_samples: number;
  failure_count: number;
  credentials: StudioCredential[];
  egress_policy_json: string;
}

export interface StudioSaveResult {
  ok: boolean;
  error: string;
  revision: number;
}

export interface StudioSpec {
  ok: boolean;
  error: string;
  revision: number;
  spec_json: string;
}

export interface StudioFieldChange {
  target: string;
  from: string;
  to: string;
}

export interface StudioDiff {
  ok: boolean;
  error: string;
  added: StudioFieldChange[];
  removed: StudioFieldChange[];
  changed: StudioFieldChange[];
}

/** A draft is a PROPOSAL: saving it is a separate human action. */
export interface StudioDraft {
  ok: boolean;
  error: string;
  spec_json: string;
  /** Non-empty when the model declined — a first-class outcome, not a failure. */
  abstained: string;
  corrections: number;
  first_draft_accepted: boolean;
  coverage_json: string;
  /**
   * Per-field decisions the drafter declined to make while still proposing a
   * mapping for the rest. These arrive WITH a spec, unlike `abstained`, which
   * is the whole draft.
   */
  field_abstentions: StudioFieldAbstention[];
}

/** One field the drafter would not guess at. */
export interface StudioFieldAbstention {
  path: string;
  /** The drafter's own words, shown verbatim on the review row. */
  reason: string;
  /** The readings it was choosing between; these become the operator's buttons. */
  options: string[];
}

export interface StudioCaptureStatus {
  samples: number;
  profile_json: string;
}

/**
 * Real deliveries, as stored: REDACTED at capture (ADR-0112 §12).
 *
 * Values arrive as type tokens — `"<string:place>"`, `"<number:plain>"` — not as
 * the source's originals, because the originals were never persisted. The
 * structure is intact, which is the part the mapping review needs: an
 * unlabelled three-element array is just as visibly unlabelled once redacted.
 */
export interface StudioCaptureSamples {
  bodies_json: string[];
  /** The whole capture window, not `bodies_json.length`, which is capped. */
  total: number;
}

/**
 * ADR-0115 Source Discovery — one sentence and one endpoint instead of a form.
 *
 * The console renders `status` differently per value, so the epistemic
 * distinction has to survive all the way here: `observed` and `documented` read
 * as fact, `inferred` and `assumed` as candidates with their basis.
 */
export interface DiscoveryFinding {
  field: string;
  proposed_value: string;
  /** observed | documented | inferred | assumed | operator_confirmed */
  status: string;
  confidence: number;
  rule_id: string;
  evidence_refs: string[];
  explanation: string;
  observed_at: string;
  bounds_min: number;
  bounds_max: number;
}

export interface DiscoveryGap {
  field: string;
  why: string;
  /** A gap no further probing can close — renders as a refusal, not a to-do. */
  refusal: boolean;
}

export interface DiscoveryQuestion {
  id: string;
  shape: string;
  prompt: string;
  options: string[];
  path: string;
  status: string;
  asked_at_revision: number;
  version: number;
  /** Generated downstream of content Cambrian did not author. */
  from_untrusted: boolean;
  auth_scheme_ref: string;
}

export interface DiscoveryProposal {
  revision: number;
  archetype: string;
  protocol: string;
  format: string;
  cadence_seconds: number;
  /** The operator's own words the cadence was derived from. May be empty. */
  cadence_because: string;
  collection_root: string;
  cursor_path: string;
  cursor_param: string;
  auth_scheme_ref: string;
}

export interface DiscoverySession {
  ok: boolean;
  error: string;
  session_id: string;
  /** proposed | abstained | budget_exhausted | policy_refused — all terminal successes. */
  outcome: string;
  reason: string;
  findings: DiscoveryFinding[];
  gaps: DiscoveryGap[];
  questions: DiscoveryQuestion[];
  proposal: DiscoveryProposal | null;
  /** Origins discovery wanted and could not have, awaiting an operator grant. */
  pending_origins: string[];
  requests_used: number;
  model_calls_used: number;
  /**
   * True while the loop is still going. A session that researches an API runs
   * for minutes, so the console shows progress instead of a frozen button.
   * There is no `outcome` yet while this is true, and saying one would be a lie.
   */
  running: boolean;
  /** The trajectory so far, appended as it happens. */
  steps: DiscoveryStep[];
}

export interface DiscoveryStep {
  n: number;
  /** The discovery action kind, or "" for the loop announcing what it is about to do. */
  action: string;
  /** A readable sentence. The console does not need to know the action vocabulary. */
  summary: string;
  /** Set when the controller declined the action. A refusal is not a fault. */
  refusal: string;
  observed_ref: string;
  at: string;
  /** The step running right now — what makes a slow call legible rather than a hang. */
  in_flight: boolean;
}

/** One dry-run evaluation: a real delivery, evaluated, never preserved. */
export interface StudioPreviewEntry {
  delivery_ref: string;
  received_at: string;
  outcome: string;
  detail: string;
  envelopes_json: string;
}

export interface StudioFailure {
  evidence_id: string;
  delivery_ref: string;
  mapping_revision: number;
  outcome: string;
  detail: string;
  finished_at: string;
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
  /**
   * Set when the effective predicate carries party-scoped tags (ADR-0121 D1c).
   * Every other field here is a statement about TAGS and is a complete answer;
   * this one is not, because access is decided per record against identities
   * resolved when the query runs.
   *
   * MUST be rendered wherever the effective rule is. A party-scoped grant shown
   * as a plain grant tells the administrator the opposite of the truth — "this
   * customer sees every order" for a policy that means "only their own".
   */
  row_scope_note: string;
  /**
   * What the resolver returns for this principal right now. An empty list is the
   * diagnosis, not a missing value: a principal who is a party to nothing reads
   * NO party-scoped record, which looks exactly like an empty database.
   */
  party_identities: string[];
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
  /**
   * Set when a draft party-scopes a tag (ADR-0121 D1c). The decision journal
   * records each resource's TAGS but never its parties, so a replayed
   * party-scoped question fails closed and every such record counts as denied —
   * `newly_denied` is then an UPPER BOUND, not a prediction. Show it beside the
   * number: silently overstating a blast radius is how a correct policy gets
   * abandoned.
   */
  row_scope_note: string;
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
/**
 * What happened to ONE key in a durable config write (contract 0072/0083).
 *
 * The kernel reports per-key outcomes rather than one ack because a partial
 * write can partly succeed, and `effect` is the half an operator acts on.
 */
export interface ConfigWriteOutcome {
  key: string;
  stored: boolean;
  /**
   * `live` — applied to the running kernel and stored.
   * `restart_required` — stored; this key is read only at boot.
   * `shadowed` — stored, but a higher layer supplies the live value.
   * `rejected` — not stored.
   *
   * Never flatten this to ok/failed: a stored-but-inert setting that renders as
   * "saved" is the state that makes someone rewrite a working config.
   */
  effect: 'live' | 'restart_required' | 'shadowed' | 'rejected' | string;
  /** Names the layer winning over the store ("env:CAMBRIAN_…"). */
  shadowed_by: string;
  error: string;
}

export interface ConfigWriteResult {
  command_id: string;
  deduped: boolean;
  /** Empty when the kernel answered with a bare ack. Nothing is invented. */
  outcomes: ConfigWriteOutcome[];
}

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
  /** "env:<VAR>" or "store" — where the ACTIVE credential comes from, so an
   *  operator can see why a pasted key had no effect. This field was missing
   *  from this interface while the Rust struct carried it; the drift surfaced
   *  as a serde error the moment a draft was built client-side. */
  key_source: string;
  key_added_at: string;
  key_last_used_at: string;

  last_tested_at: string;
  last_test_ok: boolean;
}

/**
 * One MCP server as the settings editor round-trips it (contract 0097).
 * The one MCP server shape: it backs the request/response read plus the write
 * surface (the mock-era feed projection it was once "distinct from" is gone).
 */
export interface MCPServerConfig {
  /** Permanent — tool names are namespaced `mcp:<id>/<tool>`. */
  id: string;
  transport: 'stdio' | 'http' | 'sse' | string;
  /** A URL for http/sse, a command for stdio. */
  endpoint: string;
  args: string[];
  auth_type: 'none' | 'bearer' | 'header' | string;
  auth_header: string;
  /** Applied to every tool this server advertises — an untagged tool is one no
   *  policy can restrict. */
  classification_tags: string[];

  connected: boolean;
  last_error: string;
  tool_count: number;
  /** The only credential facts on the wire. There is no token field. */
  token_configured: boolean;
  token_source: string;
}

export interface MCPServerTestResult {
  ok: boolean;
  latency_ms: number;
  /** What the server ACTUALLY advertises — worth one real connection. */
  tool_names: string[];
  error: string;
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
  /** What the probe asked for — the generator's configured model. */
  model_requested: string;
  /** Decided by the kernel, which holds both sides of the comparison. */
  model_matches: boolean;
  /**
   * Whether tool-calling was exercised AT ALL.
   *
   * False means NOT TESTED, which is not the same as failed. The probe does a
   * plain completion today, and drawing that as a failing check reported a
   * defect that was never measured.
   */
  native_tools_checked: boolean;
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

// ============================================================================
// Kernel logs (contract 0082) — OPERATOR-ONLY.
//
// A Viewer's token is refused by the kernel: a log line carries whatever the
// kernel happened to write and bypasses the access-policy plane entirely, so it
// is not filtered per principal the way a memory read is. The whole surface
// gates on the `kernel-logs` capability.
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** One attribute, with its type preserved so numbers stay comparable. */
export interface LogAttr {
  key: string;
  kind: 'string' | 'int' | 'float' | 'bool';
  /** Rendered form — always present, so a row draws without a type switch. */
  value: string;
  /** Numeric form for int/float, for comparison and sorting. */
  num: number | null;
}

export interface LogRecord {
  /** Monotonic within a boot — the resume cursor. */
  seq: number;
  at_unix_ms: number;
  level: LogLevel;
  /** An agent's logger name, or the message's own prefix ("ADR-0074"). */
  component: string;
  message: string;
  attrs: LogAttr[];
  /** Changes on every kernel start — how a reader tells a restart happened. */
  boot_id: string;
  /** Message or an attribute was clipped. Never render it as the whole value. */
  truncated: boolean;
}

/** What the kernel's retention window can currently answer for. */
export interface LogWindow {
  boot_id: string;
  capacity: number;
  count: number;
  /**
   * Records overwritten since boot. Non-zero means the window no longer reaches
   * back to kernel start — the console must say so rather than presenting a
   * truncated story as the whole one.
   */
  dropped: number;
  oldest_unix_ms: number;
  newest_unix_ms: number;
  /** Newest sequence issued — where a tail resumes from. */
  last_seq: number;
}

export interface LogFilter {
  level_at_least?: LogLevel;
  components?: string[];
  contains?: string;
  attr_equals?: Record<string, string>;
  since_unix_ms?: number;
}

export interface LogPage {
  records: LogRecord[];
  window: LogWindow;
}

// ============================================================================
// The record lane (ADR-0102) — the drift product's own plane
//
// Read/response types, not projection: `ListAlerts` is poll-only (alerts are not
// on the operator event feed), and the drift tally is a process-lifetime gauge.
// The one exception is retention, which IS folded — see `RetentionRunEvent`.
// ============================================================================

/**
 * One piece of evidence behind an alert, and the anchor for one `[n]` marker.
 *
 * Markers are contiguous from 1, and every marker has a citation while every
 * citation has a marker. A citation with no anchor is one the operator cannot
 * follow — so the marker run is DERIVED from this array, never hardcoded.
 */
export interface AlertCitation {
  /** 1-based and contiguous. */
  index: number;
  /** "message" | "record" */
  kind: string;
  /** A message id, or `KEY@date` for a record. */
  ref: string;
  /** Populated on the alert itself — the inspector renders with no second call. */
  quote: string;
  /** ISO 8601, or "" when absent. */
  at: string;
  /**
   * The record version quoted; 0 for a message citation. Shown and not followed:
   * there is no RPC to fetch a record version by id.
   */
  version_id: number;
}

/**
 * One raised drift alert — someone promised a date the system of record
 * disagrees with, with both sides quoted.
 *
 * **Advisory.** It notifies. It does not email the customer, amend the purchase
 * order or update a CRM, and no affordance in the UI may imply that it does.
 */
export interface Alert {
  id: number;
  kind: string;
  record_key: string;
  owner: string;
  speaker: string;
  message_id: string;
  /**
   * SIGNED. Positive = the record is LATER than promised, which is the direction
   * a customer feels. The single most load-bearing field on the alert.
   */
  delta_days: number;
  promised: string;
  recorded: string;
  /**
   * Distinct dates the record has carried, not versions — a nightly export
   * rewrites every open row. `>= 2` is "this keeps moving", a different
   * conversation from "it slipped once".
   */
  slip_count: number;
  /** The rendered sentence, carrying inline `[n]` markers (ADR-0081). */
  text: string;
  citations: AlertCitation[];
  /**
   * INHERITED classification (ADR-0095 D9), derived from both the message and
   * the record. An alert is never more visible than the material behind it, and
   * it is the artifact most likely to be forwarded — every copy/export/share
   * affordance must honour these.
   */
  tags: string[];
  raised_at: string;
  /** Measured from the MESSAGE arriving, not from when reconciliation started. */
  detect_latency_ms: number;
  /**
   * Whether the commitment behind this alert was later superseded by a correction.
   *
   * **NOT SERVED BY THE CURRENT CONTRACT.** `records.proto` carries no
   * supersession signal on a raised alert — `Alert.kind` is the record family
   * (e.g. "purchase_order"), and `Superseded` exists only on the drift
   * pipeline's per-message result, which describes an incoming message rather
   * than a stored alert.
   *
   * It is declared here rather than omitted because the product truth is real
   * and this is the only honest way to carry it: a correction after the promise
   * stops it being reconciled, but an alert already raised stays raised by
   * design, and an operator seeing a stale alert with nothing explaining it will
   * assume a bug. The banner renders only when this is true, so today it never
   * renders and is never inferred from `slip_count` or anything else.
   *
   * Kernel ask: add a supersession flag to `Alert`.
   */
  superseded?: boolean;
}

/** One unresolved reason and its count, pre-sorted by the core. */
export interface UnresolvedReason {
  reason: string;
  count: number;
}

/**
 * The reconciliation tally.
 *
 * PROCESS-LIFETIME, not durable: it resets on kernel restart while `available`
 * stays true. A window on the current process, not a trend — never build a
 * "total issues ever" figure on it; `ListAlerts` is the durable truth.
 */
export interface DriftStats {
  consistent: number;
  drift: number;
  /**
   * Alerts NOT derived because they would have crossed a closed-tag boundary.
   * Working as intended — never styled as an error.
   */
  refused: number;
  /**
   * Kept broken out, never summed. 400 `record_not_found` means the export is
   * stale; 400 `ambiguous_match` means the counterparty naming is — same number,
   * different team, different week.
   */
  unresolved: UnresolvedReason[];
  /** The DENOMINATOR: 12 of 15 and 12 of 40 000 are opposite findings. */
  total: number;
  /**
   * False when this deployment has no reconciler.
   *
   * It must NEVER render as a tally of zeros. A detector that was never switched
   * on and a deployment with nothing wrong produce identical numbers, and this
   * flag is the only thing that tells them apart.
   */
  available: boolean;
}

/**
 * One derivation refused because it would have crossed a closed-tag boundary
 * (ADR-0095 D9).
 *
 * Not an error log. It is what keeps "suppressed by policy" distinguishable from
 * "nothing found", and it belongs on the page rather than in a debug panel.
 */
export interface Refusal {
  id: number;
  at: string;
  /** What was being derived, e.g. "drift_alert". */
  kind: string;
  /** The subject, e.g. the record key. */
  ref: string;
  /** The distinct closed tags that could not be combined. */
  boundary: string[];
  reason: string;
}

/**
 * What one connector can and cannot see (BRAIN-03).
 *
 * PUSHED by the connector, never queried by the kernel: only the daemon holding
 * the workspace token can enumerate channels, and only the ones it was invited
 * to — Slack has no read-the-whole-workspace scope.
 *
 * Held in memory kernel-side and process-lifetime, so an empty list from
 * `getCoverage()` means NO CONNECTOR HAS REPORTED, not "coverage is zero". An
 * absent report is the honest rendering of an absent connector.
 */
export interface SourceCoverage {
  /** The ingress surface this describes, e.g. "slack". */
  source: string;
  /** The daemon that reported it. */
  connector: string;
  invited_channels: string[];
  /** Derived server-side from the channel list, never trusted from the wire. */
  channel_count: number;
  /** free | pro | business | enterprise_grid */
  plan_tier: string;
  /**
   * How far back the SOURCE retains history.
   *
   * THREE states, and they must not be collapsed: `-1` is "not reported",
   * deliberately distinct from `0` ("retains nothing"), and the value is
   * meaningless entirely when `horizon_unlimited` is true. Use
   * {@link describeHorizon} rather than reading this raw — a wrong horizon is a
   * recall claim measured against the wrong denominator.
   */
  retention_horizon_days: number;
  horizon_unlimited: boolean;
  /**
   * True only for an approved Enterprise Grid partner. False means private
   * channels, DMs and Slack Connect are NOT covered.
   */
  discovery_api: boolean;
  /** The connector's own plain-English limits, carried verbatim. */
  limits: string[];
  /** Stamped kernel-side on receipt — what makes staleness visible. */
  reported_at: string;
}

/**
 * The last accepted push for one record kind.
 *
 * Only kinds that have actually been pushed appear: the query is driven off the
 * record rows. A kind configured but never pushed has no rows and therefore no
 * entry — the console must say so rather than implying the list is exhaustive.
 */
export interface KindPushStatus {
  kind: string;
  last_push_id: string;
  /** "webhook" | "csv" | "view" */
  transport: string;
  /** Rows in that push. */
  record_count: number;
  received_at: string;
  /** Un-superseded rows — "our open orders", not every version ever pushed. */
  live_records: number;
}

// ── Pipeline dry run (kernel contract 0088) ─────────────────────────────────

/**
 * What a shadow run observed: everything the pipeline would have done, and
 * nothing it did.
 *
 * Four lists rather than one outcome per item. "47 would be saved" and "3
 * skipped because under the reporting threshold" answer different questions, and
 * folding them into a single stream leaves an operator counting rows to learn
 * what a heading could have told them.
 */
export interface PipelineDryRun {
  /**
   * The named constraint when the run could not happen at all. When this is set
   * every other field is empty, and the console must render THIS — an empty
   * report looks exactly like a clean one and means the opposite.
   */
  refused: string;
  run_id: string;
  samples: number;
  effects: ShadowEffect[];
  duplicates: DuplicateEffectKey[];
  terminations: PipelineTermination[];
  /**
   * Items a node could not process. Deliberately not "unrouted": the compiler
   * refuses a graph with an unwired port, so an item reaching no port at all is
   * structurally impossible.
   */
  failures: PipelineFailure[];
  /**
   * How long the replay took. Shown because a dry run is something an operator
   * waits for, and "4.1 s over 52 items" says whether running it over more is
   * worth doing.
   */
  elapsed_ms: number;
  /**
   * What was replayed (contract 0092): the archive's real deliveries, or the
   * redacted capture samples. Over redacted samples every value is a type
   * token and a numeric gate fails on every item — only this field lets the
   * report blame the source rather than the graph.
   */
  source: string;
  /** Real items observed per node during the replay, bounded kernel-side. */
  node_examples: PipelineNodeExample[];
}

/** One item as one node saw it during a dry run (contract 0092). */
export interface PipelineNodeExample {
  node: string;
  item_key: string;
  /** The item's value as the node received it. */
  value_json: string;
  /** What the node recorded (an effect's receipt), when any. */
  result_json: string;
}

/** One effect that would have been carried out. */
export interface ShadowEffect {
  node: string;
  kind: string;
  /** The real derived key, not a placeholder. */
  effect_key: string;
  item_key: string;
  summary: string;
}

/** One key that more than one effect would have used. */
export interface DuplicateEffectKey {
  effect_key: string;
  count: number;
  nodes: string[];
}

/** One declared discard and how many items took it. */
export interface PipelineTermination {
  node: string;
  port: string;
  /** The operator's own words from the spec. */
  reason: string;
  count: number;
}

/** One item a node could not process. */
export interface PipelineFailure {
  node: string;
  item_key: string;
  err: string;
}

// ── Pipeline authoring (kernel contract 0089) ───────────────────────────────

/**
 * One constraint a graph broke, and where it broke it.
 *
 * The target is what makes a refusal actionable rather than merely readable:
 * the canvas draws it on the port it concerns and offers to jump to it.
 */
export interface PipelineRefusal {
  /**
   * The stable rule identifier. Behaviour keys off THIS, never the wording —
   * which refusals offer "wire it", which offer "terminate it with a reason".
   */
  constraint: string;
  /** Empty when the refusal is about the pipeline or a whole scope. */
  node: string;
  port: string;
  /** Names the constraint, then the action. Never a validity verdict. */
  message: string;
}

/** One authored revision, plus what the compiler says about it right now. */
export interface PipelineGraph {
  /** Set when the revision cannot be read at all. */
  refused: string;
  summary: PipelineSummary;
  /** The ADR-0114 pipeline document. */
  graph_json: string;
  refusals: PipelineRefusal[];
  /**
   * Per node, the payload paths its expressions read — taken from the compiled
   * AST, so it cannot disagree with what the runtime will read.
   */
  reads: NodeReads[];
  /**
   * The per-node field schema (contract 0091), as JSON — parse with
   * `parseFieldSchema`. Empty means "unchecked", never "no fields": a console
   * that renders an empty string as zero available fields makes an unprofiled
   * trigger look like a fieldless payload.
   */
  field_schema_json: string;
}

/** One node and the payload paths it reads. */
export interface NodeReads {
  node: string;
  /** Qualified by root: `item.x`, `signal.y`. `item.*` is the whole payload. */
  paths: string[];
}

/**
 * One known payload path at a point in the graph (contract 0091).
 *
 * Paths are dotted and item-rooted (`properties.mag`), `*` is the array-member
 * segment. The kernel walked these from the trigger's capture profile through
 * every transform — the console renders them and decides nothing.
 */
export interface FieldSpec {
  path: string;
  /** "string" | "number" | "boolean" | "object" | "array" | "null" | "dynamic" */
  types?: string[];
  /** The node that introduced this field; "" or absent means the trigger. */
  origin?: string;
}

/** What one node can see of the flowing item, and what it does about it. */
export interface NodeFields {
  /** Fields an expression on this node may read. Meaningful only when `unknown` is empty. */
  available?: FieldSpec[];
  /** Set when availability cannot be known here — the reason, named. */
  unknown?: string;
  /** Item-rooted paths this node's own expressions read. */
  reads?: string[];
  /** Top-level fields a map's `set` introduces or replaces. */
  writes?: string[];
  /** Top-level fields a map's `drop` removes. */
  drops?: string[];
}

/** The whole projection: node id → what it sees and does. */
export type FieldSchema = Record<string, NodeFields>;

/** The compiler's answer about a graph being edited and not yet stored. */
export interface PipelineValidation {
  /**
   * The DOCUMENT could not be read — malformed JSON, say. Distinct from a
   * refusal list, which means it WAS read and broke rules.
   */
  refused: string;
  refusals: PipelineRefusal[];
  node_count: number;
  effect_node_count: number;
  plan_checksum: string;
  semantics_checksum: string;
  /**
   * The per-node field schema of the DRAFT being validated — same shape as
   * `PipelineGraph.field_schema_json`, so the picker tracks the edit rather
   * than the revision it started from. Empty when the draft does not compile.
   */
  field_schema_json: string;
}

// ── The graph document, as the canvas reads it ──────────────────────────────
//
// Mirrors the ADR-0114 pipeline JSON. Read-only here: the canvas renders it and
// the kernel remains the only thing that interprets it.

export interface GraphNode {
  id: string;
  kind: string;
  name?: string;
  config?: Record<string, unknown>;
  /** A structured-control node owns a nested scope. */
  body?: GraphScope;
  /**
   * Canvas position, stored with the pipeline (kernel `Node.Layout`). A
   * diagram that re-lays-out on every load is not the operator's diagram.
   * Semantically inert: excluded from the plan checksum kernel-side.
   */
  layout?: { x: number; y: number };
}

export interface GraphEdge {
  from: string;
  from_port: string;
  to: string;
}

/** An operator's DECLARED discard of an output port. The reason is required. */
export interface GraphTermination {
  node: string;
  port: string;
  reason: string;
}

export interface GraphScope {
  nodes: GraphNode[];
  edges: GraphEdge[];
  terminations?: GraphTermination[];
}

export interface GraphTrigger {
  type: string;
  ingress?: string;
  stream_id?: string;
  cron?: string;
  timezone?: string;
}

export interface GraphDocument {
  id: string;
  revision: number;
  name?: string;
  state?: string;
  trigger: GraphTrigger;
  scope: GraphScope;
}

/** The outcome of moving a revision along its lifecycle (contract 0093). */
export interface PipelineTransitioned {
  /**
   * The gate that held, in the registry's own words. The revision is
   * untouched when set.
   */
  refused: string;
  pipeline_id: string;
  revision: number;
  /** Where the revision IS now — the store's answer, never an echo. */
  state: string;
}

/** The outcome of storing an edited graph (kernel contract 0090). */
export interface PipelineSaved {
  /** Set when nothing was stored at all. */
  refused: string;
  pipeline_id: string;
  /**
   * The DRAFT revision created. Editing never overwrites a published, armed or
   * retired revision — a run pins a revision.
   */
  revision: number;
  /**
   * What the compiler said. Present and non-blocking: refusals hold Publish,
   * not Save.
   */
  refusals: PipelineRefusal[];
}

/** One item's passage through one node — what the inspector shows. */
export interface NodeItem {
  run_id: string;
  item_key: string;
  state: string;
  attempt: number;
  /** The envelope consumed and what it produced, as JSON strings. */
  input_json: string;
  result_json: string;
  error: string;
  evidence_ref: string;
  updated_at: string;
  iter_path: string;
}

// ── Knowledge substrate (ADR-0118) ──────────────────────────────────────────
//
// Mirrors `src-tauri/src/substrate.rs` exactly — `invoke<T>()` is an unchecked
// cast, so a drift here fails at runtime, not at compile time.

/**
 * The compiled closed-AST query — echoed with every answered ask (the
 * transparency contract: the exact query that ran travels WITH the answer)
 * and accepted by `knowledgeQuery` for the console's curated drill-ins.
 * Times are RFC-3339 strings; "" = unset.
 */
export interface CompiledQuery {
  kind: string;
  entity_id: string;
  predicate: string;
  item_kind: string;
  actor: string;
  aggregate: string;
  hops: number;
  limit: number;
  evidence_id: string;
  as_of: string;
  from: string;
  to: string;
}

/**
 * One executed query's answer. `guarantee` is the §14 label and must be
 * rendered verbatim — a row set without its warranty is just another ranked
 * list. `rows` are JSON objects (v1 wire shape), parsed by the screen.
 */
export interface KnowledgeAnswer {
  guarantee: string;
  rows: string[];
}

/**
 * One ask outcome: exactly one of ANSWERED or REFUSED. A refusal is the plane
 * WORKING (it refuses rather than guesses) and must render distinctly from
 * both an answer and an error; `lane_hint === "memory"` names the corpus lane
 * as the right tool for an open-ended question.
 */
export interface AskOutcome {
  answered: boolean;
  guarantee: string;
  rows: string[];
  compiled: CompiledQuery | null;
  refusal_reason: string;
  lane_hint: string;
}

/**
 * What one source surface (ingress/stream) contributed, with the
 * classification tags its rows carry — which scopes gate that material.
 */
export interface SourceHolding {
  source_id: string;
  evidence_count: number;
  last_seen: string;
  classification: string[];
}

/** One knowledge-item kind and its item count. */
export interface KnowledgeKindCount {
  kind: string;
  count: number;
}

/**
 * What the substrate holds. Full-visibility numbers: the operator console
 * sees everything by design (ADR-0118 v1), classified material included.
 */
export interface SubstrateOverview {
  evidence_count: number;
  event_count: number;
  observation_count: number;
  knowledge_item_count: number;
  live_resolution_count: number;
  entity_count: number;
  actor_count: number;
  /** Evidence archived but not yet transformed — data still materializing. */
  outbox_pending: number;
  /** Entities whose current resolutions disagree across actors. */
  contradiction_count: number;
  earliest: string;
  latest: string;
  sources: SourceHolding[];
  kinds: KnowledgeKindCount[];
}

/** One browsable entity — names/predicates/counts only, never values. */
export interface KnowledgeEntity {
  entity_id: string;
  observation_count: number;
  predicates: string[];
  last_seen: string;
}
