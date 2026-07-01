/* Cambrian Web UI — IPC types.
 *
 * The Tauri IPC surface (the webview ↔ Tauri shell boundary). Per EC-4 (gRPC
 * in Rust core only) + the technical document §3.3.
 *
 * The webview NEVER speaks gRPC. It talks only to the Rust core via Tauri IPC.
 * Every component imports from `@/ipc`, never from `@tauri-apps/api/core`
 * directly. The client (`./client.ts`) and the mock (`./mock.ts`) implement
 * the same interface; tests use the mock.
 */

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

// ============================================================================
// StateOfRecord — the projection's shape (mirrors the kernel's StateOfRecord).
// Per ui/src-tauri/state.rs.
// ============================================================================

export type PlanStatus = 'forming' | 'running' | 'paused' | 'completed' | 'failed';
export type SessionState = 'active' | 'paused' | 'dormant' | 'completed';
export type HITLNature = 'destructive_command' | 'approval_request' | 'dangerous_tool';
export type AuditStatus = 'applied' | 'failed' | 'denied';
export type AuditKind = 'config' | 'data' | 'runtime';

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

export interface StateOfRecord {
  connection: ConnectionState;
  role: Role | null;
  kernel_version: string;
  contract_version: string;
  capabilities: string[];
  contract_skew: number; // 0 = aligned
  cursor: number; // the last folded seq
  plans: PlanInFlight[];
  sessions: SessionSummary[];
  audit_tail: AuditEntry[];
  pending_hitl: HITLIntervention[];
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
