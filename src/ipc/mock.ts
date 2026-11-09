

import * as t from './types';
import { createAccountsMock } from './accounts-mock';
import { createHierarchyMock } from './hierarchy-mock';

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
        'memory-event-time',
        'logout',
        'skills-read',
        'skills-lifecycle',
        'skill-grants',
        'memory-notes',
        'step-output-stream',
        'integrations',
        // ADR-0141 accounts plane (ipc/accounts-mock.ts) + the studio reads it uses.
        'accounts',
        'ingress-studio',
        // ADR-0142 stage 2 org-directory plane (ipc/hierarchy-mock.ts).
        'org-directory',
        'addressed-approvals',
      ],
      contract_skew: 0,
      plugins: [],
      cursor: 0,
      plans: [],
      sessions: [],
      audit_tail: [],
      pending_hitl: [],
      agents: [],
      tools: [],
      skills: [],
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
    if (remember) this.savedConn = { endpoint, username, method: 'password' };
    this.state = {
      ...this.state,
      identity: {
        method: 'password', principal: `user:${username}`, display_name: username, username,
        email: '', subject: '', issuer: '', roles: ['operator'], role_source: 'kernel', expires_at_unix_ms: 0,
      },
    };
    this.emitState();
    return { role: 'operator' };
  }

  /** Mock DescribeAuth: password plus a single OIDC issuer. */
  authMethods: t.AuthMethods = {
    password_login: true,
    oidc_issuer: 'https://id.example.org/realms/cambrian',
    oidc_client_id: 'cambrian-console',
    describe_supported: true,
  };

  async describeAuth(_endpoint: string): Promise<t.AuthMethods> {
    return this.authMethods;
  }

  /** Mock OIDC sign-in: the role the probe would find (tests set `oidcRole`). */
  oidcRole: t.Role = 'operator';

  async loginOidc(endpoint: string, remember = false): Promise<t.LoginResponse> {
    if (!this.authMethods.oidc_issuer) throw 'this kernel has no single sign-on provider configured';
    const role = this.oidcRole;
    this.state = {
      ...this.state,
      role,
      identity: {
        method: 'oidc', principal: '', display_name: 'Ada Lovelace', username: 'ada',
        email: 'ada@example.org', subject: 'u-1', issuer: this.authMethods.oidc_issuer, roles: [],
        role_source: 'probe', expires_at_unix_ms: Date.now() + 300_000,
      },
      connection: { ...this.state.connection, status: 'live', endpoint, reason: null },
    };
    if (remember) this.savedConn = { endpoint, username: '', method: 'oidc' };
    this.emitState();
    return { role };
  }

  async loginSaved(): Promise<t.LoginResponse> {
    if (!this.savedConn) throw 'no saved connection';
    if (this.savedConn.method === 'oidc') return this.loginOidc(this.savedConn.endpoint, true);
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
      identity: null,
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

  /** Mirrors the core: revoke (always succeeds here), then a disconnect. */
  async logout(): Promise<t.LogoutOutcome> {
    await this.disconnect();
    return { revoked: true, note: '' };
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

  // ---- Conversations (ADR-0084 D9): an in-memory transcript so the webview and tests run
  // without a kernel. Mirrors the real semantics: user turn appended, an echo agent reply.
  private convMsgs: Record<string, t.ConversationMessage[]> = {};

  async openConversation(params: t.OpenConversationParams): Promise<string> {
    if (!this.convMsgs[params.conversation_id]) {
      this.convMsgs[params.conversation_id] = [];
    }
    return params.conversation_id;
  }

  async sendTurn(params: t.SendTurnParams): Promise<t.ConversationMessage | null> {
    const list = this.convMsgs[params.conversation_id] ?? [];
    const now = new Date().toISOString();
    list.push({
      id: `m-${list.length + 1}`,
      conversation_id: params.conversation_id,
      seq: list.length + 1,
      role: 'user',
      content: params.text,
      created_at: now,
    });
    const reply: t.ConversationMessage = {
      id: `m-${list.length + 1}`,
      conversation_id: params.conversation_id,
      seq: list.length + 1,
      role: 'agent',
      content: `(mock reply) you said: ${params.text}`,
      created_at: now,
    };
    list.push(reply);
    this.convMsgs[params.conversation_id] = list;
    return reply;
  }

  async listConversations(_params: t.ListConversationsParams): Promise<t.ConversationSummary[]> {
    return Object.keys(this.convMsgs).map((id, i) => ({
      id,
      title: `Conversation ${i + 1}`,
      status: 'open' as const,
      profile: 'operator',
      updated_at: new Date().toISOString(),
    }));
  }

  async listConversationMessages(
    params: t.ListConversationMessagesParams,
  ): Promise<t.ConversationMessage[]> {
    const list = this.convMsgs[params.conversation_id] ?? [];
    return list.filter((m) => m.seq > params.after_seq);
  }

  async closeConversation(_params: t.CloseConversationParams): Promise<t.CommandAck> {
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

  private standing: t.StandingApproval[] = [];

  async answerApproval(params: t.AnswerApprovalParams): Promise<t.AnswerApprovalResult> {
    const h = this.state.pending_hitl.find((x) => x.intervention_id === params.id);
    if (!h) return { ok: false, deduped: false, state: '', refusal: 'unknown approval', standing_id: '' };
    if (h.answerable === false) {
      return { ok: false, deduped: false, state: 'pending', refusal: `this approval may be answered by ${h.rule}`, standing_id: '' };
    }
    this.state = {
      ...this.state,
      pending_hitl: this.state.pending_hitl.filter((x) => x.intervention_id !== params.id),
    };
    let standingId = '';
    if (params.approve && params.standing && h.allow_standing) {
      standingId = `stand-${params.id}`;
      this.standing = [
        ...this.standing,
        {
          id: standingId,
          action_class: h.kind || 'tool',
          resource: (h.proposed_action?.tool_name as string) ?? '',
          scope: h.beneficiary ? `person:${h.beneficiary.replace(/^user:/, '')}` : '',
          beneficiary: h.beneficiary ?? '',
          granted_by: 'operator',
          granted_at_unix_ms: Date.now(),
          expires_at_unix_ms: 0,
          revoked_at_unix_ms: 0,
          use_count: 0,
          active: true,
        },
      ];
    }
    this.emitState();
    return { ok: true, deduped: false, state: params.approve ? 'approved' : 'denied', refusal: '', standing_id: standingId };
  }

  async listStandingApprovals(includeInactive = false): Promise<t.StandingApproval[]> {
    return this.standing.filter((s) => includeInactive || s.active);
  }

  async revokeStandingApproval(id: string, _reason: string): Promise<t.CommandAck> {
    this.standing = this.standing.map((s) => (s.id === id ? { ...s, active: false, revoked_at_unix_ms: Date.now() } : s));
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

  /** No stored uploads in the mock: every upload is a new document. */
  async matchUpload(_name: string, _tags: string[]): Promise<t.DocumentSummary | null> {
    return null;
  }

  async ingestFile(params: t.IngestFileParams): Promise<t.IngestMemoryResponse> {
    const name = params.filename || params.path.split(/[\\/]/).pop() || params.path;
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
        event_time_unix_ms: h.event_time_unix_ms,
        event_time_end_unix_ms: h.event_time_end_unix_ms,
        time_source: h.time_source,
        time_precision: h.time_precision,
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
        // ADR-0134: a dated week, stated by the uploader.
        event_time_unix_ms: Date.UTC(2026, 6, 13),
        event_time_end_unix_ms: Date.UTC(2026, 6, 17),
        time_source: 'explicit',
        time_precision: 'day',
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
        // Nothing known: the ingest clock, labelled as such.
        event_time_unix_ms: Date.UTC(2026, 7, 2, 9, 30),
        event_time_end_unix_ms: null,
        time_source: 'ingest_default',
        time_precision: 'second',
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
        event_time_unix_ms: Date.UTC(2026, 6, 18, 9, 15),
        event_time_end_unix_ms: null,
        time_source: 'source_metadata',
        time_precision: 'minute',
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
      current_values: {},
      value_source: {},
    };
  }

  /** Revert to file (ADR-0101 D8): every key comes back from the file layer. */
  async deleteConfig(keys: string[]): Promise<t.ConfigWriteResult> {
    return {
      command_id: `mock-cmd-${Date.now()}`,
      deduped: false,
      outcomes: keys.map((key) => ({
        key,
        stored: false,
        effect: 'restart_required',
        shadowed_by: '',
        error: '',
        written_to: '',
        overrides_file: '',
        overrides_value: '',
      })),
    };
  }

  async setRuntimeConfig(): Promise<t.CommandAck> {
    return { deduped: false };
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

  // ── ADR-0139 D13/D14 + skill grants: in-memory fixtures for the dev preview ──

  private mockSkills: t.SkillRecord[] = [
    {
      name: 'web-research', description: 'Search the web and cite sources', tool_grants: ['web_fetch', 'search'],
      scope_tags: [], body: '# Web research\n\nSearch, read two sources, cite both.\n', source_path: 'skills/web-research/SKILL.md',
      version: '1.2.0', source: 'official', lifecycle_state: 'active', state_changed_at_unix_ms: Date.now() - 86_400_000 * 9,
      locked: false, exempt_reason: '', use_count: 41, success_count: 37, last_used_at_unix_ms: Date.now() - 3_600_000,
      ledger_entry_id: 'led-3',
    },
    {
      name: 'report-writer', description: 'Turn findings into a short report', tool_grants: [], scope_tags: [],
      body: '# Report\n\nWrite three sections.\n', source_path: '', version: '0.3.0', source: 'agent-proposed',
      lifecycle_state: 'stale', state_changed_at_unix_ms: Date.now() - 86_400_000 * 2, locked: true, exempt_reason: '',
      use_count: 3, success_count: 1, last_used_at_unix_ms: Date.now() - 86_400_000 * 20, ledger_entry_id: 'led-2',
    },
  ];
  private mockProposals: t.SkillProposal[] = [
    {
      id: 'prop-1', name: 'report-writer', skill_md: '# Report\n\nWrite four sections.\nAlways add a summary.\n',
      rationale: 'Reports kept missing a summary.', state: 'pending', proposer_agent_id: 'writer-agent',
      principal_id: 'alice', source_run_id: 'run-77', evidence_cids: [], base_version: '0.3.0', current_version: '0.3.0',
      scan_verdict: 'suspicious', scan_findings: ['mentions an external URL'], created_at_unix_ms: Date.now() - 1_800_000,
      decided_at_unix_ms: 0, decided_by: '', decision_note: '',
    },
  ];
  private mockGrants: t.SkillGrants = {
    grants: [
      { id: 'g-1', agent_id: 'writer-agent', skill_name: 'web-research', source: 'operator', granted_by: 'admin',
        granted_at_unix_ms: Date.now() - 86_400_000, reason: 'needs sources', revoked_at_unix_ms: 0, revoked_by: '', revoke_reason: '' },
    ],
    requests: [
      { id: 'req-1', agent_id: 'analyst', skill_name: 'web-research', run_id: 'run-80', rationale: 'Need current prices',
        state: 'pending', requested_at_unix_ms: Date.now() - 600_000, decided_at_unix_ms: 0, decided_by: '' },
    ],
  };
  private mockNotes: t.NotesDocument[] = [
    { scope: 'personal', owner_id: 'alice', content: '## Preferences\n- Short answers\n- EUR amounts\n', size_chars: 38,
      budget_chars: 2000, etag: 'e1', updated_at_unix_ms: Date.now() - 7_200_000, updated_by: 'alice', budget_overridden: false },
    { scope: 'org', owner_id: 'acme', content: '## House style\n- Cite every number\n', size_chars: 36, budget_chars: 4000,
      etag: 'e7', updated_at_unix_ms: Date.now() - 86_400_000, updated_by: 'admin', budget_overridden: true },
  ];

  private mockIntegrations: t.Integration[] = [
    {
      id: 'brave-search', catalog_id: 'brave-search', name: 'Brave Search', category: 'web-search', source: 'store',
      overrides_file: false, editable: true, enabled: true, transport: 'stdio', command: 'npx', args: [], url: '',
      settings: {}, secrets: [{ name: 'BRAVE_API_KEY', label: 'API key', set: true, source: 'store',
        updated_at_unix_ms: Date.now() - 86_400_000, required: true, kind: 'env' }],
      health: { server_id: 'brave-search', state: 'ready', last_handshake_unix_ms: Date.now() - 600_000, tool_count: 2,
        last_error: '', restart_count: 0, changed_at_unix_ms: Date.now() - 600_000 },
      installed_version: '0.6.0', update_available: false, missing_required: [], tool_policies: [],
      has_default_policy: true, default_policy: null, policy_summary: 'read + egress (whole server)',
      classification_tags: [], trust_tier: 'official', passthrough_env: [],
    },
    ...(['gmail', 'google-calendar', 'slack', 'github', 'filesystem'] as const).map((id): t.Integration => ({
      id, catalog_id: id, name: { gmail: 'Gmail', 'google-calendar': 'Google Calendar', slack: 'Slack', github: 'GitHub', filesystem: 'Filesystem' }[id],
      category: id === 'filesystem' ? 'files' : 'collaboration', source: 'store', overrides_file: id === 'github', editable: true, enabled: id !== 'google-calendar',
      transport: 'stdio', command: 'npx', args: [], url: '', settings: {}, secrets: [],
      health: { server_id: id, state: id === 'github' ? 'error' : 'ready', last_handshake_unix_ms: Date.now() - 300_000, tool_count: 4,
        last_error: id === 'github' ? '401 Bad credentials' : '', restart_count: 0, changed_at_unix_ms: Date.now() - 300_000 },
      installed_version: '1.0.0', update_available: false, missing_required: [], tool_policies: [], has_default_policy: true, default_policy: null,
      policy_summary: id === 'filesystem' ? 'read (whole server)' : 'read + write + egress', classification_tags: [], trust_tier: 'official', passthrough_env: [],
    })),
  ];

  async listIntegrationCatalog(): Promise<t.IntegrationCatalog> {
    const entry = (o: Partial<t.IntegrationCatalogEntry>): t.IntegrationCatalogEntry => ({
      id: '', name: '', description: '', category: '', publisher: '', license: 'MIT', trust_tier: 'official', docs_url: '',
      version: '1.0.0', transport: 'stdio', command: 'npx', args: [], url: '', runtimes: ['node>=22'], platforms: [],
      platform_supported: true, fields: [], tool_policies: [], has_default_policy: true, default_policy: null,
      policy_summary: 'read + egress', probe_tool: '', notes: '', source: 'builtin', multi_instance: false, ...o,
    });
    return {
      categories: ['web-search', 'email-calendar', 'database'],
      entries: [
        entry({ id: 'brave-search', name: 'Brave Search', category: 'web-search', publisher: 'Brave (official)',
          description: 'Web and news search with citations.',
          fields: [{ name: 'BRAVE_API_KEY', label: 'API key', secret: true, required: true, help: 'From api.search.brave.com', kind: 'env', default_value: '', placeholder: '' }] }),
        entry({ id: 'gmail', name: 'Gmail', category: 'email-calendar', publisher: 'Community', trust_tier: 'community',
          description: 'Read and draft mail in one Google account.', policy_summary: 'read + write + egress',
          fields: [{ name: 'GOOGLE_OAUTH_TOKEN', label: 'OAuth token', secret: true, required: true, help: 'Consent with the gmail.modify scope', kind: 'env', default_value: '', placeholder: '' }] }),
        entry({ id: 'postgres', name: 'PostgreSQL', category: 'database', publisher: 'MCP steering group', multi_instance: true,
          description: 'Read-only SQL over one database.', policy_summary: 'read (whole server)',
          fields: [{ name: 'DATABASE_URL', label: 'Connection URL', secret: true, required: true, help: 'Use a read-only role', kind: 'env', default_value: '', placeholder: 'postgres://…' }] }),
      ],
    };
  }
  async listIntegrations(): Promise<t.Integrations> {
    return { integrations: this.mockIntegrations, configured: true };
  }
  async installIntegration(p: t.InstallIntegrationParams): Promise<t.IntegrationMutation> {
    const i: t.Integration = { ...this.mockIntegrations[0], id: p.id || p.catalog_id || 'custom', catalog_id: p.catalog_id ?? '',
      name: p.catalog_id ?? 'custom', enabled: p.enabled, health: null };
    this.mockIntegrations = [...this.mockIntegrations, i];
    return { deduped: false, outcome: { key: i.id, stored: true, effect: 'live', shadowed_by: '', error: '' }, integration: i };
  }
  async setIntegrationEnabled(p: { id: string; enabled: boolean }): Promise<t.IntegrationMutation> {
    this.mockIntegrations = this.mockIntegrations.map((i) => (i.id === p.id ? { ...i, enabled: p.enabled } : i));
    return { deduped: false, outcome: { key: p.id, stored: true, effect: 'live', shadowed_by: '', error: '' }, integration: null };
  }
  async testIntegration(): Promise<t.IntegrationTestResult> {
    return { ok: true, latency_ms: 412, error: '', used_live_session: true, probe_tool: 'brave_web_search', probe_ok: true,
      probe_output: '3 results', probe_skipped_reason: '',
      tools: [{ name: 'brave_web_search', description: '', dangerous: false, effects: ['read', 'egress'], policy_source: 'default' }] };
  }
  async removeIntegration(p: { id: string }): Promise<t.IntegrationMutation> {
    this.mockIntegrations = this.mockIntegrations.filter((i) => i.id !== p.id);
    return { deduped: false, outcome: { key: p.id, stored: true, effect: 'live', shadowed_by: '', error: '' }, integration: null };
  }
  async revertIntegrationToFile(p: { id: string }): Promise<t.IntegrationMutation> {
    this.mockIntegrations = this.mockIntegrations.map((i) => (i.id === p.id ? { ...i, source: 'file', overrides_file: false } : i));
    return { deduped: false, outcome: { key: p.id, stored: true, effect: 'live', shadowed_by: '', error: '' }, integration: null };
  }
  async setIntegrationSecret(p: { id: string }): Promise<t.IntegrationMutation> {
    return { deduped: false, outcome: { key: p.id, stored: true, effect: 'live', shadowed_by: '', error: '' }, integration: null };
  }
  async clearIntegrationSecret(p: { id: string }): Promise<t.IntegrationMutation> {
    return this.setIntegrationSecret(p);
  }
  async updateIntegration(p: { id: string }): Promise<t.IntegrationMutation> {
    return this.setIntegrationSecret(p);
  }

  async listSkillsFull(): Promise<t.SkillRecord[]> {
    return this.mockSkills;
  }
  async listSkillProposals(state = 'pending'): Promise<t.SkillProposal[]> {
    return this.mockProposals.filter((p) => state === 'all' || p.state === state);
  }
  async decideSkillProposal(p: t.DecideSkillProposalParams): Promise<t.SkillProposalDecision> {
    this.mockProposals = this.mockProposals.map((x) =>
      x.id === p.proposal_id ? { ...x, state: p.approve ? 'approved' : 'rejected', decision_note: p.reason } : x,
    );
    return { deduped: false, skill_version: p.approve ? '0.4.0' : '', ledger_entry_id: p.approve ? 'led-4' : '' };
  }
  async setSkillLock(p: { skill_name: string; locked: boolean }): Promise<t.CommandAck> {
    this.mockSkills = this.mockSkills.map((s) => (s.name === p.skill_name ? { ...s, locked: p.locked } : s));
    return { deduped: false };
  }
  async listSkillLedger(skillName = ''): Promise<t.SkillLedgerEntry[]> {
    const all: t.SkillLedgerEntry[] = [
      { id: 'led-3', skill_name: 'web-research', mutation: 'updated', from_version: '1.1.0', to_version: '1.2.0',
        from_state: 'active', to_state: 'active', actor: 'admin', reason: 'cite both sources', at_unix_ms: Date.now() - 86_400_000 * 9,
        proposal_id: '', rollback_of: '', restorable: true },
      { id: 'led-1', skill_name: 'web-research', mutation: 'created', from_version: '', to_version: '1.1.0',
        from_state: '', to_state: 'active', actor: 'admin', reason: 'initial', at_unix_ms: Date.now() - 86_400_000 * 30,
        proposal_id: '', rollback_of: '', restorable: true },
    ];
    return all.filter((e) => !skillName || e.skill_name === skillName);
  }
  async rollbackSkill(): Promise<t.SkillRollback> {
    return { deduped: false, ledger_entry_id: 'led-5', skill_version: '1.1.0' };
  }
  async listSkillGrants(): Promise<t.SkillGrants> {
    return this.mockGrants;
  }
  async grantSkill(p: t.SkillGrantParams): Promise<t.CommandAck> {
    this.mockGrants = {
      grants: [...this.mockGrants.grants, { id: `g-${Date.now()}`, agent_id: p.agent_id, skill_name: p.skill_name,
        source: 'operator', granted_by: 'you', granted_at_unix_ms: Date.now(), reason: p.reason, revoked_at_unix_ms: 0,
        revoked_by: '', revoke_reason: '' }],
      requests: this.mockGrants.requests.filter((r) => !(r.agent_id === p.agent_id && r.skill_name === p.skill_name)),
    };
    return { deduped: false };
  }
  async revokeSkillGrant(p: t.SkillGrantParams): Promise<t.CommandAck> {
    this.mockGrants = {
      ...this.mockGrants,
      grants: this.mockGrants.grants.filter((g) => !(g.agent_id === p.agent_id && g.skill_name === p.skill_name)),
    };
    return { deduped: false };
  }
  async listMemoryNotes(): Promise<t.NotesSummary[]> {
    return this.mockNotes.map(({ content: _c, budget_overridden: _b, ...n }) => ({
      ...n,
      over_budget: n.size_chars > n.budget_chars,
    }));
  }
  async getMemoryNotes(p: { scope: string; owner_id: string }): Promise<t.NotesDocument> {
    const doc = this.mockNotes.find((n) => n.scope === p.scope && n.owner_id === p.owner_id);
    if (!doc) throw new Error('NOT_FOUND: no such notes document');
    return doc;
  }
  async setMemoryNotes(p: t.SetMemoryNotesParams): Promise<t.NotesWriteResult> {
    const doc = this.mockNotes.find((n) => n.scope === p.scope && n.owner_id === p.owner_id);
    if (doc && p.if_match && p.if_match !== doc.etag) {
      return { deduped: false, accepted: false, rejection: 'conflict', detail: 'etag mismatch', etag: doc.etag,
        size_chars: doc.size_chars, budget_chars: doc.budget_chars };
    }
    const etag = `e${Date.now()}`;
    const next = { scope: p.scope, owner_id: p.owner_id, content: p.content, size_chars: [...p.content].length,
      budget_chars: doc?.budget_chars ?? 2000, etag, updated_at_unix_ms: Date.now(), updated_by: 'you',
      budget_overridden: doc?.budget_overridden ?? false };
    this.mockNotes = [...this.mockNotes.filter((n) => n !== doc), next];
    return { deduped: false, accepted: true, rejection: '', detail: '', etag, size_chars: next.size_chars,
      budget_chars: next.budget_chars };
  }
  async deleteMemoryNotes(p: { scope: string; owner_id: string }): Promise<t.CommandAck> {
    this.mockNotes = this.mockNotes.filter((n) => !(n.scope === p.scope && n.owner_id === p.owner_id));
    return { deduped: false };
  }
  async setMemoryNotesBudget(p: t.SetMemoryNotesBudgetParams): Promise<t.CommandAck> {
    this.mockNotes = this.mockNotes.map((n) =>
      n.scope === p.scope && n.owner_id === p.owner_id ? { ...n, budget_chars: p.budget_chars, budget_overridden: !p.clear_override } : n,
    );
    return { deduped: false };
  }

  async listWatches(): Promise<t.WatchConfigSummary[]> {
    return this.state.watch_configs;
  }

  /**
   * One generated ingress pipeline, mirroring what the Ingress Studio produces:
   * trigger → save_to_memory, bound to a mapping revision, armed.
   */
  async listPipelines(): Promise<t.PipelineSummary[]> {
    return [
      {
        pipeline_id: 'ingress:acme-webhook',
        revision: 1,
        name: 'Acme webhook',
        state: 'armed',
        trigger_type: 'ingress',
        trigger_ref: 'acme-webhook',
        node_count: 2,
        edge_count: 1,
        effect_node_count: 1,
        mapping_revision: 1,
        plan_checksum: 'a1b2c3d4e5f6',
        semantics_checksum: 'f6e5d4c3b2a1',
        generated: true,
        dry_run: false,
        approved: true,
      },
    ];
  }

  async getSkill(skillId: string): Promise<t.SkillDetail> {
    const summary = this.state.skills.find((s) => s.id === skillId);
    if (!summary) throw new Error(`Skill not found: ${skillId}`);
    return { ...summary, skill_md: '# Skill', bundled_tool_grants: [], where_loaded: [] };
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

  // ── Knowledge substrate (ADR-0118) ──────────────────────────────────────

  private knowledgeAskOutcome: t.AskOutcome = {
    answered: true,
    guarantee: 'exact over stored data; identity and coverage epistemically uncertain',
    rows: ['{"entity_id":"purchase_order/PO-1","predicate":"payment_terms_days","value_number":60,"evidence_id":"ev-1"}'],
    compiled: {
      kind: 'point',
      entity_id: 'purchase_order/PO-1',
      predicate: 'payment_terms_days',
      item_kind: '',
      actor: '',
      aggregate: '',
      hops: 0,
      limit: 0,
      evidence_id: '',
      as_of: '',
      from: '',
      to: '',
    },
    refusal_reason: '',
    lane_hint: '',
  };

  private knowledgeOverviewData: t.SubstrateOverview = {
    evidence_count: 12,
    event_count: 4,
    observation_count: 9,
    knowledge_item_count: 6,
    live_resolution_count: 3,
    entity_count: 5,
    actor_count: 2,
    outbox_pending: 0,
    contradiction_count: 1,
    earliest: '2026-08-01T09:00:00Z',
    latest: '2026-08-06T12:00:00Z',
    sources: [
      {
        source_id: 'event:bench:mock-stream',
        evidence_count: 12,
        last_seen: '2026-08-06T12:00:00Z',
        classification: ['sales'],
      },
    ],
    kinds: [{ kind: 'commitment', count: 6 }],
  };

  private knowledgeEntities: t.KnowledgeEntity[] = [
    {
      entity_id: 'purchase_order/PO-1',
      observation_count: 2,
      predicates: ['payment_terms_days'],
      last_seen: '2026-08-06T12:00:00Z',
    },
  ];

  askKnowledge(_question: string): Promise<t.AskOutcome> {
    return Promise.resolve(this.knowledgeAskOutcome);
  }

  knowledgeQuery(_query: Partial<t.CompiledQuery>): Promise<t.KnowledgeAnswer> {
    return Promise.resolve({
      guarantee: this.knowledgeAskOutcome.guarantee,
      rows: this.knowledgeAskOutcome.rows,
    });
  }

  knowledgeOverview(): Promise<t.SubstrateOverview> {
    return Promise.resolve(this.knowledgeOverviewData);
  }

  listKnowledgeEntities(_query: string, _limit = 50): Promise<t.KnowledgeEntity[]> {
    return Promise.resolve(this.knowledgeEntities);
  }

  __seedKnowledgeAsk(outcome: t.AskOutcome) {
    this.knowledgeAskOutcome = outcome;
  }

  __seedKnowledgeOverview(overview: t.SubstrateOverview) {
    this.knowledgeOverviewData = overview;
  }

  __seedKnowledgeEntities(entities: t.KnowledgeEntity[]) {
    this.knowledgeEntities = entities;
  }

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

export const ipc = Object.assign(new MockIPC(), createAccountsMock(), createHierarchyMock());

export const onKernelState = (fn: (state: t.StateOfRecord) => void): Promise<() => void> =>
  Promise.resolve(ipc.onState(fn));

export const onKernelToken = (fn: (chunk: t.TokenChunk) => void): Promise<() => void> =>
  Promise.resolve(ipc.onToken(fn));

export type IPC = typeof ipc;
