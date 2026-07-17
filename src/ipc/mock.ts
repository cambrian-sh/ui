/* Cambrian Web UI — the mock Tauri IPC layer.
 *
 * Per the technical document §8. Used by unit + component + a11y tests
 * (no Tauri shell, no kernel). The mock is a drop-in replacement for the
 * real client (same shape, same return types). Tests import from
 * `@/ipc/mock` (the test alias), not `@/ipc`.
 *
 * The mock holds an in-memory StateOfRecord. Mutations update the state and
 * emit a new kernel://state event. Blast-radius and config-schema return
 * deterministic fixtures.
 */

import * as t from './types';

class MockIPC {
  private state: t.StateOfRecord = this.initialState();
  private stateListeners = new Set<(state: t.StateOfRecord) => void>();
  private tokenListeners = new Set<(chunk: t.TokenChunk) => void>();
  private ingestCount = 0;

  private initialState(): t.StateOfRecord {
    return {
      connection: {
        status: 'live',
        endpoint: 'mock://localhost',
        last_known_state_at: new Date().toISOString(),
        reason: null,
      },
      role: 'operator',
      kernel_version: '0.6.9-alpha',
      contract_version: '0047',
      capabilities: ['audit', 'scope', 'memory_tag', 'hitl_resolve'],
      contract_skew: 0,
      cursor: 0,
      plans: [],
      sessions: [],
      audit_tail: [],
      pending_hitl: [],
    };
  }

  // --------------------------------------------------------------------------
  // Commands (9 existing + 2 new; same shape as the real client)
  // --------------------------------------------------------------------------

  async login(_endpoint: string, _username: string, _password: string): Promise<t.LoginResponse> {
    return { role: 'operator' };
  }

  async getState(): Promise<t.StateOfRecord> {
    return this.state;
  }

  async createSession(params: t.CreateSessionParams): Promise<t.CreateSessionResponse> {
    const session_id = `mock-session-${Date.now()}`;
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      sessions: [
        ...this.state.sessions,
        {
          session_id,
          title: params.goal.slice(0, 60),
          state: 'active',
          created_at: now,
          last_activity_at: now,
          plan_count: 0,
          agent_mix: [],
          cost: 0,
        },
      ],
    };
    this.emitState();
    return { session_id };
  }

  async sendMessage(_params: t.SendMessageParams): Promise<t.CommandAck> {
    return { deduped: false };
  }

  async injectCorrection(_params: t.InjectCorrectionParams): Promise<t.CommandAck> {
    return { deduped: false };
  }

  async pauseSession(params: t.PauseSessionParams): Promise<t.CommandAck> {
    this.state = {
      ...this.state,
      sessions: this.state.sessions.map((s) =>
        s.session_id === params.session_id ? { ...s, state: 'paused' } : s,
      ),
    };
    this.emitState();
    return { deduped: false };
  }

  async resumeSession(params: t.ResumeSessionParams): Promise<t.CommandAck> {
    this.state = {
      ...this.state,
      sessions: this.state.sessions.map((s) =>
        s.session_id === params.session_id ? { ...s, state: 'active' } : s,
      ),
    };
    this.emitState();
    return { deduped: false };
  }

  async completeSession(params: t.CompleteSessionParams): Promise<t.CommandAck> {
    this.state = {
      ...this.state,
      sessions: this.state.sessions.map((s) =>
        s.session_id === params.session_id ? { ...s, state: 'completed' } : s,
      ),
    };
    this.emitState();
    return { deduped: false };
  }

  async resolveHITL(params: t.ResolveHITLParams): Promise<t.CommandAck> {
    this.state = {
      ...this.state,
      pending_hitl: this.state.pending_hitl.filter(
        (h) => h.intervention_id !== params.intervention_id,
      ),
    };
    this.emitState();
    return { deduped: false };
  }

  async setToolGrant(_params: t.SetToolGrantParams): Promise<t.CommandAck> {
    return { deduped: false };
  }

  async getBlastRadiusPreview(_mutation: t.BlastRadiusMutation): Promise<t.BlastRadiusPreviewResponse> {
    return {
      affected_agents: [],
      affected_plans: [],
      computed_at: new Date().toISOString(),
      cache_ttl_ms: 5_000,
    };
  }

  /** Mirrors the kernel's body-lane validation so tests exercise the real rules. */
  async ingestMemory(params: t.IngestMemoryParams): Promise<t.IngestMemoryResponse> {
    const hasText = params.text !== '';
    const hasContent = params.content.length > 0;
    if (!hasText && !hasContent) throw new Error('one of text or content is required');
    if (hasText && hasContent) throw new Error('text and content are mutually exclusive');
    if (hasContent && params.filename === '') throw new Error('filename is required when content is set');
    return [`mock-doc-${this.ingestCount++}`, false];
  }

  async queryMemory(params: t.QueryMemoryParams): Promise<t.MemoryHit[]> {
    if (params.query === '') return [];
    return [
      {
        doc_id: 'mock-doc-0',
        summary: 'Ops review: two SEV-2s, both closed.',
        text: 'Two SEV-2 incidents were raised this week; both were closed within SLA.',
        section_path: 'Ops Review > 3.2 Incidents',
        score: 0.82,
        source: 'operator_ingest',
        importance: 0.6,
        tags: [],
      },
    ];
  }

  async getConfigSchema(): Promise<t.ConfigSchema> {
    return {
      schema_version: '1',
      schema_json: JSON.stringify({ type: 'object', properties: {} }),
      schema_hash: 'mock-hash',
      editable_keys: [],
      kernel_only_keys: [],
    };
  }

  // --------------------------------------------------------------------------
  // Events (mirrors the kernel://state + kernel://token channels)
  // --------------------------------------------------------------------------

  onState(fn: (state: t.StateOfRecord) => void): () => void {
    this.stateListeners.add(fn);
    return () => {
      this.stateListeners.delete(fn);
    };
  }

  onToken(fn: (chunk: t.TokenChunk) => void): () => void {
    this.tokenListeners.add(fn);
    return () => {
      this.tokenListeners.delete(fn);
    };
  }

  // --------------------------------------------------------------------------
  // Test-only helpers
  // --------------------------------------------------------------------------

  /** Replace the in-memory state and emit a synthetic event. */
  __seed(state: t.StateOfRecord) {
    this.state = state;
    this.emitState();
  }

  /** Emit a synthetic token chunk (for streaming tests). */
  __emitToken(chunk: t.TokenChunk) {
    this.tokenListeners.forEach((fn) => fn(chunk));
  }

  /** Add a session to the in-memory state. */
  __addSession(session: t.SessionSummary) {
    this.state = { ...this.state, sessions: [...this.state.sessions, session] };
    this.emitState();
  }

  /** Add a plan to the in-memory state. */
  __addPlan(plan: t.PlanInFlight) {
    this.state = { ...this.state, plans: [...this.state.plans, plan] };
    this.emitState();
  }

  /** Add an audit entry to the in-memory state. */
  __addAuditEntry(entry: t.AuditEntry) {
    this.state = { ...this.state, audit_tail: [...this.state.audit_tail, entry] };
    this.emitState();
  }

  private emitState() {
    this.stateListeners.forEach((fn) => fn(this.state));
  }
}

export const ipc = new MockIPC();

/* === IPC barrel surface (mirrors `index.ts` exports) === */

export const onKernelState = (fn: (state: t.StateOfRecord) => void): Promise<() => void> =>
  Promise.resolve(ipc.onState(fn));

export const onKernelToken = (fn: (chunk: t.TokenChunk) => void): Promise<() => void> =>
  Promise.resolve(ipc.onToken(fn));

export type IPC = typeof ipc;
