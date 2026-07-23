

import * as t from './types';

class MockIPC {
  private state: t.StateOfRecord = this.initialState();
  private stateListeners = new Set<(state: t.StateOfRecord) => void>();
  private tokenListeners = new Set<(chunk: t.TokenChunk) => void>();
  private ingestCount = 0;
  private zeroHitsMode = false;
  private memoryWrittenSeq = 1;

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
      capabilities: [
        'audit',
        'scope',
        'memory_tag',
        'hitl_resolve',
        'memory-read',
        'memory-ingest',
        'memory-ingest-binary',
        'memory-answer',
      ],
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
      memory_written: [],
    };
  }

  // --------------------------------------------------------------------------
  // Commands (9 existing + 2 new; same shape as the real client)
  // --------------------------------------------------------------------------

  private savedConn: t.SavedConnection | null = null;

  async login(
    endpoint: string,
    username: string,
    _password: string,
    remember = false,
  ): Promise<t.LoginResponse> {
    this.state = {
      ...this.state,
      role: 'operator',
      connection: { ...this.state.connection, status: 'live', endpoint, reason: null },
    };
    if (remember) this.savedConn = { endpoint, username };
    this.emitState();
    return { role: 'operator' };
  }

  async loginSaved(): Promise<t.LoginResponse> {
    if (!this.savedConn) throw 'no saved connection';
    return this.login(this.savedConn.endpoint, this.savedConn.username, '', true);
  }

  async savedConnection(): Promise<t.SavedConnection | null> {
    return this.savedConn;
  }

  /** Mirrors the core: the feed stops and the folded state is dropped. */
  async disconnect(): Promise<void> {
    this.savedConn = null;
    this.state = {
      ...this.initialState(),
      role: null,
      capabilities: [],
      kernel_version: '',
      contract_version: '',
      connection: {
        status: 'down',
        endpoint: null,
        last_known_state_at: this.state.connection.last_known_state_at,
        reason: 'disconnected by operator',
      },
    };
    this.emitState();
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

  /** Mirrors the kernel's body-lane validation so tests exercise the real rules. */
  async ingestMemory(params: t.IngestMemoryParams): Promise<t.IngestMemoryResponse> {
    const hasText = params.text !== '';
    const hasContent = params.content.length > 0;
    if (!hasText && !hasContent) throw new Error('one of text or content is required');
    if (hasText && hasContent) throw new Error('text and content are mutually exclusive');
    if (hasContent && params.filename === '') throw new Error('filename is required when content is set');
    const id = `mock-doc-${this.ingestCount++}`;
    const deduped = this.ingestCount % 5 === 0;
    // The kernel emits one MemoryWrittenOp per chunk. Emit them synchronously so
    // tests are deterministic; real latency supplies the parsing animation.
    const source = params.filename !== '' ? params.filename : 'operator paste';
    const chunks = hasContent ? 3 : 1;
    for (let i = 0; i < chunks; i++) {
      this.__emitMemoryWritten({
        doc_id: id,
        doc_type: 'episodic_memory',
        session_id: params.session_id,
        source,
        summary: (params.text || source).slice(0, 200),
      });
    }
    return [id, deduped];
  }

  async ingestFile(params: t.IngestFileParams): Promise<t.IngestMemoryResponse> {
    const name = params.path.split(/[\\/]/).pop() || params.path;
    return this.ingestMemory({
      text: '',
      content: [1, 2, 3],
      filename: name,
      content_type: 'application/pdf',
      context: params.context,
      tags: params.tags,
      importance: params.importance,
      source: '',
      session_id: '',
      reason: params.reason,
    });
  }

  async statFile(path: string): Promise<t.FileStat> {
    const name = path.split(/[\\/]/).pop() || path;
    return { name, size: 1024 };
  }

  async answerMemory(params: t.QueryMemoryParams): Promise<t.AnswerMemory> {
    const hits = await this.queryMemory(params);
    if (hits.length === 0) {
      return { status: 'abstention', answer: 'not found in memory', citations: [] };
    }
    return {
      status: 'answer',
      answer:
        'Two SEV-2 incidents were raised this week; both were closed within SLA [1]. ' +
        'The deploy freeze was lifted Wednesday [2].',
      citations: hits.slice(0, 2).map((h, i) => ({
        marker: i + 1,
        doc_id: h.doc_id,
        text: h.text,
        section_path: h.section_path,
        source: h.source,
        score: h.score,
        importance: h.importance,
        tags: h.tags,
      })),
    };
  }

  async queryMemory(params: t.QueryMemoryParams): Promise<t.MemoryHit[]> {
    if (params.query === '' || this.zeroHitsMode) return [];
    return [
      {
        doc_id: 'mock-doc-0',
        summary: 'Ops review: two SEV-2s, both closed.',
        text: 'Two SEV-2 incidents were raised this week; both were closed within SLA. The first was a database lock contention on the primary replica pair. The second involved a misconfigured autoscaling policy that caused a 12-minute outage on the east-1 region. Root cause analysis for both incidents is attached below.',
        section_path: 'Ops Review > 3.2 Incidents',
        score: 0.82,
        source: '2026-W29-ops-review.pdf',
        importance: 0.6,
        tags: ['ops', 'incidents'],
      },
      {
        doc_id: 'mock-doc-1',
        summary: 'Q3 budget allocation for AI infra.',
        text: 'The Q3 budget allocates $2.4M to AI infrastructure, split across compute (60%), storage (25%), and networking (15%). Key risk: GPU supply constraints in APAC may delay the planned cluster expansion by 4–6 weeks.',
        section_path: '',
        score: 0.71,
        source: 'Q3-budget-draft.pdf',
        importance: 0.8,
        tags: ['finance', 'budget'],
      },
      {
        doc_id: 'mock-doc-2',
        summary: 'Meeting notes from platform team standup.',
        text: 'Platform team agreed to deprecate the v2 API gateway by end of Q3. Migration guide is in progress. No blockers reported.',
        section_path: 'Standup > 2026-07-18',
        score: 0.54,
        source: 'platform-standup-notes.md',
        importance: 0.3,
        tags: ['platform'],
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

  async listWatches(): Promise<t.WatchConfigSummary[]> {
    return this.state.watch_configs;
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

  __setZeroHitsMode(enabled: boolean) {
    this.zeroHitsMode = enabled;
  }

  /** Append one MemoryWrittenOp to the projection tail, as the feed would. */
  __emitMemoryWritten(ev: Omit<t.MemoryWrittenEvent, 'seq' | 'written_at'>) {
    const tail = this.state.memory_written ?? [];
    this.state = {
      ...this.state,
      memory_written: [
        ...tail,
        { ...ev, seq: this.memoryWrittenSeq++, written_at: new Date().toISOString() },
      ],
    };
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
