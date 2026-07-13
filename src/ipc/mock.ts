

import * as t from './types';

class MockIPC {
  private state: t.StateOfRecord = this.initialState();
  private stateListeners = new Set<(state: t.StateOfRecord) => void>();
  private tokenListeners = new Set<(chunk: t.TokenChunk) => void>();

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
      agents: [],
      tools: [],
      skills: [],
      mcp_servers: [],
      scope: {},
      watch_configs: [],
      lifecycle: {
        scheduler_state: 'idle',
        pending_jobs: 0,
        last_consolidation: null,
        dormancy_events: [],
      },
      verifier_pool: {
        pool_agents: [],
        recent_rounds: [],
        surveillance_triggers: [],
      },
      cost_dashboard: {
        spend_rate_usd: 0,
        circuit_breakers: [],
        max_energy_per_step: 0.5,
        price_ledger: [],
        recent_acquires: [],
      },
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

  async setScope(_params: t.SetScopeParams): Promise<t.CommandAck> {
    return { deduped: false };
  }

  async registerSkill(_params: t.RegisterSkillParams): Promise<t.CommandAck> {
    return { deduped: false };
  }

  async registerMCP(_params: t.RegisterMCPParams): Promise<t.CommandAck> {
    return { deduped: false };
  }

  async triggerConsolidation(_params: t.TriggerConsolidationParams): Promise<t.CommandAck> {
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
  // UI-IMPL-21a: subsystem read RPCs (9 new)
  // --------------------------------------------------------------------------

  async listAgents(): Promise<t.AgentSummary[]> {
    return this.state.agents;
  }

  async getAgent(agentId: string): Promise<t.AgentDetail> {
    const summary = this.state.agents.find((a) => a.id === agentId);
    if (!summary) throw new Error(`Agent not found: ${agentId}`);
    return { ...summary, manifest_version: '1.0', manifest_json: '{}', cognitive_fingerprint: '', scope: { required_tags: [], any_of_tags: [], forbidden_tags: [] }, trust_score_ewma: summary.trust_score, recent_verification_outcomes: [], last_error: '', last_successful_plan_id: '' };
  }

  async listTools(): Promise<t.ToolSummary[]> {
    return this.state.tools;
  }

  async getTool(toolId: string): Promise<t.ToolDetail> {
    const summary = this.state.tools.find((t) => t.id === toolId);
    if (!summary) throw new Error(`Tool not found: ${toolId}`);
    return { ...summary, manifest_version: '1.0', schema_json: '{}', granted_agents: [] };
  }

  async listSkills(): Promise<t.SkillSummary[]> {
    return this.state.skills;
  }

  async getSkill(skillId: string): Promise<t.SkillDetail> {
    const summary = this.state.skills.find((s) => s.id === skillId);
    if (!summary) throw new Error(`Skill not found: ${skillId}`);
    return { ...summary, skill_md: '# Skill', bundled_tool_grants: [], where_loaded: [] };
  }

  async listMCPServers(): Promise<t.MCPServerSummary[]> {
    return this.state.mcp_servers;
  }

  async getMCPServer(serverId: string): Promise<t.MCPServerDetail> {
    const summary = this.state.mcp_servers.find((s) => s.id === serverId);
    if (!summary) throw new Error(`MCP server not found: ${serverId}`);
    return { ...summary, health_check_history: [], discovered_tools: [] };
  }

  async getScope(agentId: string): Promise<t.ScopeDetail> {
    const entry = this.state.scope[agentId];
    if (!entry) throw new Error(`Scope not found for agent: ${agentId}`);
    return {
      agent_id: entry.agent_id,
      effective_scope: { required_tags: [], any_of_tags: [], forbidden_tags: [] },
      default_write_tags: entry.default_write_tags,
      caller_scope: { required_tags: [], any_of_tags: [], forbidden_tags: [] },
      k_anonymity_floor: 3,
      scope_change_history: [],
    };
  }

  async getWatchConfig(id: string): Promise<t.WatchConfigDetail> {
    const summary = this.state.watch_configs.find(w => w.id === id);
    if (!summary) throw new Error(`Watch config not found: ${id}`);
    return {
      ...summary,
      rule: `name: ${id}\ncondition: "true"\naction: "notify"`,
      last_fires: [
        { status: summary.last_fire_status, duration_ms: 120, output: "Success", fired_at: summary.last_fire_at || new Date().toISOString() }
      ],
      errors: summary.error_count > 0 ? ["Failed to execute rule"] : [],
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

  __seed(state: t.StateOfRecord) {
    this.state = state;
    this.emitState();
  }

  __emitToken(chunk: t.TokenChunk) {
    this.tokenListeners.forEach((fn) => fn(chunk));
  }

  __addSession(session: t.SessionSummary) {
    this.state = { ...this.state, sessions: [...this.state.sessions, session] };
    this.emitState();
  }

  __addPlan(plan: t.PlanInFlight) {
    this.state = { ...this.state, plans: [...this.state.plans, plan] };
    this.emitState();
  }

  __addAuditEntry(entry: t.AuditEntry) {
    this.state = { ...this.state, audit_tail: [...this.state.audit_tail, entry] };
    this.emitState();
  }

  __seedAgents(agents: t.AgentSummary[]) {
    this.state = { ...this.state, agents };
    this.emitState();
  }

  __seedTools(tools: t.ToolSummary[]) {
    this.state = { ...this.state, tools };
    this.emitState();
  }

  __seedSkills(skills: t.SkillSummary[]) {
    this.state = { ...this.state, skills };
    this.emitState();
  }

  __seedMCPServers(servers: t.MCPServerSummary[]) {
    this.state = { ...this.state, mcp_servers: servers };
    this.emitState();
  }

  __seedScope(scope: Record<string, t.ScopeSummary>) {
    this.state = { ...this.state, scope };
    this.emitState();
  }

  __seedWatchConfigs(configs: t.WatchConfigSummary[]) {
    this.state = { ...this.state, watch_configs: configs };
    this.emitState();
  }

  __seedLifecycle(lifecycle: t.LifecycleState) {
    this.state = { ...this.state, lifecycle };
    this.emitState();
  }

  __seedVerifierPool(pool: t.VerifierPoolState) {
    this.state = { ...this.state, verifier_pool: pool };
    this.emitState();
  }

  __seedCostDashboard(dashboard: t.CostDashboard) {
    this.state = { ...this.state, cost_dashboard: dashboard };
    this.emitState();
  }

  private emitState() {
    this.stateListeners.forEach((fn) => fn(this.state));
  }
}

export const ipc = new MockIPC();

export const onKernelState = (fn: (state: t.StateOfRecord) => void): Promise<() => void> =>
  Promise.resolve(ipc.onState(fn));

export const onKernelToken = (fn: (chunk: t.TokenChunk) => void): Promise<() => void> =>
  Promise.resolve(ipc.onToken(fn));

export type IPC = typeof ipc;
