

import * as t from './types';
import { createAccountsMock } from './accounts-mock';
import { createHierarchyMock } from './hierarchy-mock';
import type { IPC as RealIPC } from './client';
import * as fx from './mock-fixtures';
import { ago } from './mock-fixtures';

class MockIPC {
  private state: t.StateOfRecord = this.initialState();
  private stateListeners = new Set<(state: t.StateOfRecord) => void>();
  private tokenListeners = new Set<(chunk: t.TokenChunk) => void>();
  private ingestCount = 0;
  /** Contract 0111: each mock document's ingest status (every mock upload is small, so searchable). */
  private ingestStatuses = new Map<string, t.IngestStatusOp>();
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
      scope: {},
      watch_configs: [],
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

  async cancelRun(params: t.CancelRunParams): Promise<t.CommandAck> {
    // The mock has no runs of its own: a cancelled session's plans read as failed,
    // which is what the console shows once the kernel reports the run cancelled.
    this.state = {
      ...this.state,
      plans: this.state.plans.map((p) =>
        p.session_id === params.session_id && (p.status === 'running' || p.status === 'forming')
          ? { ...p, status: 'failed' }
          : p,
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
    const status: t.IngestStatusOp = {
      document_id: id,
      state: 'searchable',
      chunks_total: 0,
      chunks_embedded: 0,
      error: '',
    };
    this.ingestStatuses.set(id, status);
    return [id, deduped, '', 1, status];
  }

  async getIngestStatus(document_id: string): Promise<t.IngestStatusOp | null> {
    return this.ingestStatuses.get(document_id) ?? null;
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
    const { hits } = await this.queryMemory(params);
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

  async queryMemory(params: t.QueryMemoryParams): Promise<t.MemoryQueryResult> {
    if (params.query === '' || this.zeroHitsMode) return { hits: [], policy_note: '' };
    const hits: t.MemoryHit[] = [
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
    return { hits, policy_note: '' };
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
      containment: null,
    },
    ...(['gmail', 'google-calendar', 'slack', 'github', 'filesystem'] as const).map((id): t.Integration => ({
      id, catalog_id: id, name: { gmail: 'Gmail', 'google-calendar': 'Google Calendar', slack: 'Slack', github: 'GitHub', filesystem: 'Filesystem' }[id],
      category: id === 'filesystem' ? 'files' : 'collaboration', source: 'store', overrides_file: id === 'github', editable: true, enabled: id !== 'google-calendar',
      transport: 'stdio', command: 'npx', args: [], url: '', settings: {}, secrets: [],
      health: { server_id: id, state: id === 'github' ? 'error' : 'ready', last_handshake_unix_ms: Date.now() - 300_000, tool_count: 4,
        last_error: id === 'github' ? '401 Bad credentials' : '', restart_count: 0, changed_at_unix_ms: Date.now() - 300_000 },
      installed_version: '1.0.0', update_available: false, missing_required: [], tool_policies: [], has_default_policy: true, default_policy: null,
      policy_summary: id === 'filesystem' ? 'read (whole server)' : 'read + write + egress', classification_tags: [], trust_tier: 'official', passthrough_env: [],
      containment: null,
    })),
  ];

  async listIntegrationCatalog(): Promise<t.IntegrationCatalog> {
    const entry = (o: Partial<t.IntegrationCatalogEntry>): t.IntegrationCatalogEntry => ({
      id: '', name: '', description: '', category: '', publisher: '', license: 'MIT', trust_tier: 'official', docs_url: '',
      version: '1.0.0', transport: 'stdio', command: 'npx', args: [], url: '', runtimes: ['node>=22'], platforms: [],
      platform_supported: true, fields: [], tool_policies: [], has_default_policy: true, default_policy: null,
      policy_summary: 'read + egress', probe_tool: '', notes: '', source: 'builtin', multi_instance: false,
      credential_scope: 'shared', provider: '', scopes: [], ...o,
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
  async setIntegrationTrustTier(p: { id: string; trust_tier: string }): Promise<t.IntegrationMutation> {
    this.mockIntegrations = this.mockIntegrations.map((i) => (i.id === p.id ? { ...i, trust_tier: p.trust_tier } : i));
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
    outbox_dead: 0,
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

  getOntologyDraft(draftId: string): Promise<t.OntologyDraftView> {
    if (draftId !== fx.ONTOLOGY_DRAFT.draft_id) {
      return Promise.reject(new Error(`NotFound: no ontology draft "${draftId}"`));
    }
    return Promise.resolve(structuredClone(fx.ONTOLOGY_DRAFT));
  }

  /** The mock substrate declares no object kinds: every entity uses the
   *  query-plane card (GetObject answers NotFound → null). */
  getObject(_entityId: string): Promise<t.ObjectPage | null> {
    return Promise.resolve(null);
  }

  /** The mock ontology: one table kind, as the console's dev view needs. */
  getOntology(): Promise<t.OntologyView> {
    return Promise.resolve(structuredClone(fx.ONTOLOGY_VIEW));
  }

  applyOntologyChange(_changeJson: string, _reason: string, dryRun: boolean): Promise<t.OntologyApplyOutcome> {
    return Promise.resolve({
      command_id: dryRun ? '' : 'cmd-mock',
      deduped: false,
      applied: !dryRun,
      version: fx.ONTOLOGY_VIEW.version + (dryRun ? 0 : 1),
      class: 'additive',
      changes: [{ class: 'additive', subject: 'kind order', detail: 'mock change' }],
    });
  }

  listOntologyViolations(_limit = 0): Promise<t.OntologyViolationsView> {
    return Promise.resolve({ version: fx.ONTOLOGY_VIEW.version, violations: [], truncated: false });
  }

  listObjects(input: t.ObjectsListInput): Promise<t.ObjectsList> {
    return Promise.resolve({ kind: input.kind, decl_version: fx.ONTOLOGY_VIEW.version, rows: [], next_page_token: '' });
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
  // Plugin planes and settings — backed by ./mock-fixtures so every screen has
  // believable content in the browser. Writes update these copies, so a save
  // shows up on the next list call within the same page session.
  // --------------------------------------------------------------------------

  /** Set by the 'empty' scenario: read-only plane fixtures come back empty too. */
  private emptyPlanes = false;

  private fx = {
    watches: structuredClone(fx.watchConfigsFull),
    documents: structuredClone(fx.documents),
    groups: structuredClone(fx.groups),
    policies: structuredClone(fx.policies),
    links: structuredClone(fx.links),
    generators: structuredClone(fx.generators),
    roles: structuredClone(fx.roleAssignments),
    mcp: structuredClone(fx.mcpServers),
    telemetry: structuredClone(fx.telemetry),
    bots: structuredClone(fx.telegramBots),
    bindings: structuredClone(fx.identityBindings),
    unbound: structuredClone(fx.unboundSenders),
    ingresses: structuredClone(fx.ingresses),
    studio: structuredClone(fx.studioIngresses),
    linkCandidates: structuredClone(fx.linkCandidates),
    strangers: {} as Record<string, t.StrangerPolicy>,
  };

  private ack(): t.CommandAck {
    return { deduped: false };
  }
  private saved(version = 1): t.SaveOutcome {
    return { ok: true, error: '', version };
  }
  private okAck(detail = ''): t.StudioAck & t.TelegramAck {
    return { ok: true, error: '', detail };
  }
  private configWrite(key: string): t.ConfigWriteResult {
    return {
      command_id: `mock-${Date.now()}`,
      deduped: false,
      outcomes: [{ key, stored: true, effect: 'live', shadowed_by: '', error: '' }],
    };
  }

  // ---- Reactive pipelines (watches) ----
  async listWatchConfigs(): Promise<t.WatchConfigFull[]> {
    return this.fx.watches;
  }
  async registerWatch(config: t.WatchConfigFull, _reason: string): Promise<t.CommandAck> {
    this.fx.watches = [...this.fx.watches.filter((w) => w.id !== config.id), config];
    return this.ack();
  }
  async deleteWatch(watchId: string, _reason: string): Promise<t.CommandAck> {
    this.fx.watches = this.fx.watches.filter((w) => w.id !== watchId);
    return this.ack();
  }
  async setWatchActive(watchId: string, active: boolean, _reason: string): Promise<t.CommandAck> {
    this.fx.watches = this.fx.watches.map((w) => (w.id === watchId ? { ...w, active } : w));
    return this.ack();
  }
  async listWatchDeadLetters(_limit = 0): Promise<t.WatchDeadLetter[]> {
    return this.emptyPlanes ? [] : fx.watchDeadLetters;
  }
  async getWatchMetrics(): Promise<t.WatchMetrics[]> {
    return this.emptyPlanes ? [] : fx.watchMetrics;
  }
  async backtestWatch(_config: t.WatchConfigFull, _afterSeq = 0): Promise<t.WatchBacktestVerdict[]> {
    return this.emptyPlanes ? [] : fx.backtestVerdicts;
  }
  async previewRoute(
    _taskDesc: string,
    _requiredCapabilities: string[],
    candidates: t.PreviewCandidate[],
  ): Promise<t.PreviewRouteResult> {
    const ranked = candidates
      .map((c) => ({
        agent_id: c.agent_id,
        score: c.success_rate * 0.6 + c.trust_score * 0.4 - c.avg_cost_per_task * 0.1,
        success_rate: c.success_rate,
        trust_score: c.trust_score,
        latency_term: (c.network_latency_ms + c.computation_latency_ms) / 10_000,
        cost_term: c.avg_cost_per_task,
        provisional: c.provisional,
      }))
      .sort((a, b) => b.score - a.score);
    return { ranked, arm: 'exploit' };
  }

  // ---- Pipelines ----
  async listNodeItems(_pipelineId: string, _nodeId: string, _limit = 25): Promise<t.NodeItem[]> {
    return this.emptyPlanes ? [] : fx.nodeItems;
  }
  async getPipeline(pipelineId: string, _revision = 0): Promise<t.PipelineGraph> {
    const [summary] = await this.listPipelines();
    return {
      refused: '',
      summary: { ...summary, pipeline_id: pipelineId },
      graph_json: fx.pipelineGraphJson,
      refusals: [],
      reads: [{ node: 'filter', paths: ['event.type'] }],
      field_schema_json: '{"event":{"type":"string","amount":"number","id":"string"}}',
    };
  }
  async validatePipeline(_graphJson: string): Promise<t.PipelineValidation> {
    return {
      refused: '',
      refusals: [],
      node_count: 3,
      effect_node_count: 1,
      plan_checksum: 'a1b2c3d4e5f6',
      semantics_checksum: 'f6e5d4c3b2a1',
      field_schema_json: '{}',
    };
  }
  async savePipeline(_graphJson: string, _commandId = ''): Promise<t.PipelineSaved> {
    return { refused: '', pipeline_id: 'ingress:acme-webhook', revision: 2, refusals: [] };
  }
  async transitionPipeline(
    pipelineId: string,
    toState: string,
    revision = 0,
    _reason = '',
    _commandId = '',
  ): Promise<t.PipelineTransitioned> {
    return { refused: '', pipeline_id: pipelineId, revision: revision || 1, state: toState };
  }
  async dryRunPipeline(_pipelineId: string, _revision = 0, _sampleLimit = 0): Promise<t.PipelineDryRun> {
    return {
      refused: '',
      run_id: 'dry-12',
      samples: 25,
      effects: [
        { node: 'store', kind: 'memory_write', effect_key: 'doc-refund-90121', item_key: 'R-90121', summary: 'Would store refund R-90121 tagged finance, payments' },
      ],
      duplicates: [],
      terminations: [{ node: 'filter', port: 'out', reason: 'not a refund', count: 22 }],
      failures: [{ node: 'filter', item_key: 'R-90201', err: 'no such key: amount' }],
      elapsed_ms: 412,
      source: 'captured samples',
      node_examples: [
        { node: 'filter', item_key: 'R-90121', value_json: '{"type":"refund","amount":742.10}', result_json: 'true' },
      ],
    };
  }

  // ---- Memory ----
  async listDocuments(params: t.ListDocumentsParams = {}): Promise<t.DocumentPage> {
    let docs = this.fx.documents;
    if (params.unlabelled_only) docs = docs.filter((d) => d.tags.length === 0);
    if (params.id_prefix) docs = docs.filter((d) => d.id.startsWith(params.id_prefix!));
    return { documents: docs.slice(0, params.limit || 50), next_cursor: '', total_matching: docs.length };
  }
  async tagMemory(doc_id: string, tag: string, add: boolean, _reason: string): Promise<boolean> {
    this.fx.documents = this.fx.documents.map((d) =>
      d.id !== doc_id
        ? d
        : { ...d, tags: add ? [...new Set([...d.tags, tag])] : d.tags.filter((x) => x !== tag) },
    );
    return true;
  }
  async listClassificationTags(): Promise<string[]> {
    return fx.tags.map((x) => x.tag);
  }
  async listTags(): Promise<t.TagSpec[]> {
    return fx.tags;
  }
  async getWriteCeiling(): Promise<t.WriteCeiling> {
    // The mock operator may classify as any vocabulary label; a closed one in the
    // ceiling means an unlabelled upload is refused, as the kernel answers (ENG-2161).
    return { writer: 'operator', tags: fx.tags, classification_required: fx.tags.some((x) => x.closed) };
  }

  // ---- Access ----
  async explainAccess(params: t.ExplainAccessParams): Promise<t.AccessDecision> {
    const forbidden = (params.tags ?? []).includes('hr-confidential');
    return {
      allowed: !forbidden,
      reason: forbidden ? 'forbidden_tag' : 'allowed',
      detail: forbidden ? 'hr-confidential is forbidden for this principal' : '',
      decided_by: forbidden ? fx.resultantPolicy.contributions.slice(1) : fx.resultantPolicy.contributions.slice(0, 1),
      policy_version: 'v42',
      report_only: false,
      would_have_denied: false,
      explain: forbidden
        ? 'Denied: "Agents never see HR files" forbids hr-confidential.'
        : 'Allowed: "Finance can read ledgers" grants these tags.',
    };
  }
  async proposePolicy(request: string, _simulateLimit = 0): Promise<t.PolicyProposal> {
    return {
      rationale: `Drafted from: "${request}". Grants read on public material and nothing else.`,
      policy: { ...fx.policies[2], id: 'draft-1', name: 'Draft policy', version: 0 },
      links: [{ ...fx.links[2], policy_id: 'draft-1' }],
      problems: [],
      simulation: fx.simulation,
      simulation_basis: 43,
      blocking: false,
      provenance: { required_tags: 'stated' },
    };
  }
  async listGroups(): Promise<t.GroupSpec[]> {
    return this.fx.groups;
  }
  async saveGroup(group: t.GroupSpec): Promise<t.SaveOutcome> {
    this.fx.groups = [...this.fx.groups.filter((g) => g.id !== group.id), group];
    return this.saved();
  }
  async deleteGroup(id: string): Promise<void> {
    this.fx.groups = this.fx.groups.filter((g) => g.id !== id);
  }
  async listPolicies(): Promise<t.PolicySpec[]> {
    return this.fx.policies;
  }
  async savePolicy(policy: t.PolicySpec): Promise<t.SaveOutcome> {
    const version = (this.fx.policies.find((p) => p.id === policy.id)?.version ?? 0) + 1;
    this.fx.policies = [
      ...this.fx.policies.filter((p) => p.id !== policy.id),
      { ...policy, version, updated_at_unix_ms: Date.now() },
    ];
    return this.saved(version);
  }
  async deletePolicy(id: string): Promise<void> {
    this.fx.policies = this.fx.policies.filter((p) => p.id !== id);
    this.fx.links = this.fx.links.filter((l) => l.policy_id !== id);
  }
  async listLinks(): Promise<t.LinkSpec[]> {
    return this.fx.links;
  }
  async linkPolicy(link: t.LinkSpec): Promise<void> {
    this.fx.links = [...this.fx.links, link];
  }
  async unlinkPolicy(params: { policy_id: string; container_kind: string; target_id: string }): Promise<void> {
    this.fx.links = this.fx.links.filter(
      (l) =>
        !(l.policy_id === params.policy_id && l.container_kind === params.container_kind && l.target_id === params.target_id),
    );
  }
  async resultantPolicy(_params: {
    principal_id: string;
    principal_kind?: string;
    surface_kind?: string;
    surface_id?: string;
  }): Promise<t.ResultantPolicy> {
    return fx.resultantPolicy;
  }
  async simulatePolicy(_params: {
    draft_policies?: t.PolicySpec[];
    draft_links?: t.LinkSpec[];
    limit?: number;
  }): Promise<t.SimulationResult> {
    return fx.simulation;
  }
  async exportDecisions(params: { limit?: number; denials_only?: boolean }): Promise<t.DecisionRecord[]> {
    return params.denials_only ? fx.decisions.filter((d) => !d.allowed) : fx.decisions;
  }
  async listPrincipals(): Promise<t.PrincipalSpec[]> {
    return this.emptyPlanes ? [] : fx.principals;
  }

  // ---- Ingress registry and identity ----
  async listIngresses(): Promise<t.IngressSpec[]> {
    return this.fx.ingresses;
  }
  async registerIngress(ingress: t.IngressSpec): Promise<t.SaveOutcome> {
    this.fx.ingresses = [...this.fx.ingresses.filter((i) => i.agent_id !== ingress.agent_id), ingress];
    return this.saved();
  }
  async deregisterIngress(agentId: string): Promise<void> {
    this.fx.ingresses = this.fx.ingresses.filter((i) => i.agent_id !== agentId);
  }
  async listIdentityBindings(surface: string): Promise<t.IdentityBinding[]> {
    return this.fx.bindings.filter((b) => !surface || b.surface.startsWith(surface));
  }
  async bindIdentity(binding: t.IdentityBinding, _reason: string): Promise<t.SaveOutcome> {
    this.fx.bindings = [
      ...this.fx.bindings.filter((b) => !(b.surface === binding.surface && b.external_id === binding.external_id)),
      { ...binding, bound_at_unix_ms: Date.now() },
    ];
    this.fx.unbound = this.fx.unbound.filter((u) => u.external_id !== binding.external_id);
    return this.saved();
  }
  async unbindIdentity(surface: string, externalId: string, _reason: string): Promise<void> {
    this.fx.bindings = this.fx.bindings.filter((b) => !(b.surface === surface && b.external_id === externalId));
  }
  async listUnboundSenders(surface: string): Promise<t.UnboundSender[]> {
    return this.fx.unbound.filter((u) => !surface || u.surface.startsWith(surface));
  }
  async blockSender(surface: string, externalId: string, blocked: boolean, _reason: string): Promise<void> {
    this.fx.bindings = this.fx.bindings.map((b) =>
      b.surface === surface && b.external_id === externalId ? { ...b, blocked } : b,
    );
  }
  async getStrangerPolicy(surface: string): Promise<t.StrangerPolicy> {
    return (
      this.fx.strangers[surface] ?? {
        surface,
        mode: 'guest_principal',
        guest_principal_id: 'guest-telegram',
        readable_documents: 1,
      }
    );
  }
  async setStrangerPolicy(policy: t.StrangerPolicy, _reason: string): Promise<t.SaveOutcome> {
    this.fx.strangers[policy.surface] = policy;
    return this.saved();
  }
  async listIngressActivity(surface: string, limit = 20): Promise<t.IngressActivityPage> {
    return {
      activity: fx.ingressActivity.filter((a) => !surface || a.surface.startsWith(surface)).slice(0, limit),
      request_text_available: true,
    };
  }

  // ---- Telegram ----
  async telegramStatus(botId = ''): Promise<t.TelegramStatus> {
    const bot = this.fx.bots.find((b) => b.id === botId) ?? this.fx.bots[0];
    return {
      enabled: bot.enabled,
      token_configured: bot.token_configured,
      bot_username: bot.bot_username,
      running: bot.running,
      surface: bot.surface,
      namespace: ['faq', 'public'],
      state: bot.state,
      bot_id: bot.id,
      label: bot.label,
      agent_id: bot.agent_id,
      surface_registered: bot.surface_registered,
      detail: bot.detail,
      privacy_mode: true,
    };
  }
  private updateBot(botId: string, patch: Partial<t.TelegramBot>) {
    const id = botId || this.fx.bots[0].id;
    this.fx.bots = this.fx.bots.map((b) => (b.id === id ? { ...b, ...patch } : b));
  }
  async telegramSetToken(_token: string, botId = ''): Promise<t.TelegramAck> {
    this.updateBot(botId, { token_configured: true, state: 'stopped', detail: 'Token saved. Turn the bot on to start.' });
    return this.okAck();
  }
  async telegramClearToken(_reason: string, botId = ''): Promise<t.TelegramAck> {
    this.updateBot(botId, { token_configured: false, enabled: false, running: false, state: 'needs_token' });
    return this.okAck();
  }
  async telegramSetEnabled(enabled: boolean, botId = ''): Promise<t.TelegramAck> {
    this.updateBot(botId, { enabled, running: enabled, state: enabled ? 'running' : 'stopped' });
    return this.okAck();
  }
  async telegramListBots(): Promise<t.TelegramBot[]> {
    return this.fx.bots;
  }
  async telegramAddBot(id: string, label: string, token = ''): Promise<t.TelegramAck> {
    this.fx.bots = [
      ...this.fx.bots,
      {
        id,
        label,
        surface: `telegram:${id}`,
        agent_id: '',
        token_configured: !!token,
        enabled: false,
        running: false,
        bot_username: '',
        state: token ? 'stopped' : 'needs_token',
        detail: '',
        surface_registered: false,
      },
    ];
    return this.okAck();
  }
  async telegramRemoveBot(id: string, _reason: string): Promise<t.TelegramAck> {
    this.fx.bots = this.fx.bots.filter((b) => b.id !== id);
    return this.okAck();
  }

  // ---- Ingress Studio ----
  async studioCreateIngress(ingressId: string, displayName: string): Promise<t.StudioAck> {
    this.fx.studio = [
      ...this.fx.studio,
      { ingress_id: ingressId, display_name: displayName, state: 'draft', health: 'unknown', pinned_release: '' },
    ];
    return this.okAck();
  }
  async studioListIngresses(): Promise<t.StudioIngress[]> {
    return this.fx.studio;
  }
  async studioGetIngress(ingressId: string): Promise<t.StudioStatus> {
    const summary = this.fx.studio.find((s) => s.ingress_id === ingressId) ?? this.fx.studio[0];
    const armed = summary.state === 'armed';
    return {
      summary,
      latest_transport_revision: armed ? 2 : 1,
      latest_mapping_revision: armed ? 3 : 1,
      release_id: summary.pinned_release,
      armed_transport_revision: armed ? 2 : 0,
      armed_mapping_revision: armed ? 3 : 0,
      capture_samples: armed ? 25 : 0,
      failure_count: armed ? fx.studioFailures.length : 0,
      credentials: [{ name: 'api_token', configured: armed, last_four: armed ? '9b2d' : '', direction: 'outbound' }],
      egress_policy_json: '{"allow":["api.acme.example"]}',
      armed_history_transport_revision: 0,
      latest_history_transport_revision: 0,
    };
  }
  async studioLifecycle(_verb: string, _ingressId: string, _reason = ''): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioArm(_ingressId: string, _t: number, _m: number, _reason: string): Promise<t.StudioAck> {
    return this.okAck('Armed. New deliveries use these revisions.');
  }
  async studioRollback(_ingressId: string, _releaseId: string, _reason: string, _resume: boolean): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioSaveSpec(_kind: string, _ingressId: string, _specJson: string): Promise<t.StudioSaveResult> {
    return { ok: true, error: '', revision: 4 };
  }
  async studioGetRevision(kind: string, _ingressId: string, revision: number): Promise<t.StudioSpec> {
    const spec =
      kind === 'transport'
        ? { protocol: 'https', method: 'POST', path: '/hooks/acme' }
        : { fields: { amount: '$.amount', refund_id: '$.id', type: '$.type' } };
    return { ok: true, error: '', revision, spec_json: JSON.stringify(spec, null, 2) };
  }
  async studioDiffMapping(_ingressId: string, _from: number, _to: number): Promise<t.StudioDiff> {
    return {
      ok: true,
      error: '',
      added: [{ target: 'currency', from: '', to: '$.currency' }],
      removed: [],
      changed: [{ target: 'amount', from: '$.total', to: '$.amount' }],
    };
  }
  async studioDraftMapping(_ingressId: string, _guidance: string, _base = ''): Promise<t.StudioDraft> {
    return {
      ok: true,
      error: '',
      spec_json: JSON.stringify({ fields: { amount: '$.amount', refund_id: '$.id', currency: '$.currency' } }, null, 2),
      abstained: '',
      corrections: 0,
      first_draft_accepted: true,
      coverage_json: '{"covered":3,"total":4}',
      field_abstentions: [{ path: 'customer_id', reason: 'Two candidate fields', options: ['$.customer', '$.account.id'] }],
    };
  }
  async studioCaptureStatus(_ingressId: string): Promise<t.StudioCaptureStatus> {
    return { samples: 25, profile_json: '{"fields":{"type":25,"amount":24,"id":25}}' };
  }
  async studioCaptureSamples(_ingressId: string, limit = 10): Promise<t.StudioCaptureSamples> {
    const bodies = fx.nodeItems.map((n) => n.input_json);
    return { bodies_json: bodies.slice(0, limit), total: 25 };
  }
  async studioStartDiscovery(_ingressId: string, _intent: string, _endpoint: string): Promise<t.DiscoverySession> {
    return { ...fx.discovery, running: true };
  }
  async studioGetDiscovery(_ingressId: string, _sessionId: string): Promise<t.DiscoverySession> {
    return fx.discovery;
  }
  async studioAnswerDiscovery(
    _ingressId: string,
    _sessionId: string,
    _questionId: string,
    _answer: string,
    _expectedVersion: number,
    _proposalRevision: number,
    _idempotencyKey: string,
  ): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioApproveOrigin(_i: string, _s: string, _scheme: string, _host: string, _port: string): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioAcceptDiscovery(_ingressId: string, _sessionId: string): Promise<t.StudioSaveResult> {
    return { ok: true, error: '', revision: 1 };
  }
  async studioCommentDiscovery(_ingressId: string, _sessionId: string, _comment: string): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioPreview(_ingressId: string): Promise<t.StudioPreviewEntry[]> {
    return [
      {
        delivery_ref: 'dlv-5520',
        received_at: ago(42 * 60_000),
        outcome: 'ok',
        detail: '',
        envelopes_json: '[{"type":"refund","refund_id":"R-90188","amount":1210}]',
      },
      ...fx.studioFailures.map((f) => ({
        delivery_ref: f.delivery_ref,
        received_at: f.finished_at,
        outcome: f.outcome,
        detail: f.detail,
        envelopes_json: '[]',
      })),
    ];
  }
  async studioShadowReprocess(_ingressId: string, _mappingRevision: number, _limit = 0): Promise<string> {
    return 'Reprocessed 25 captured deliveries: 25 mapped, 0 failed.';
  }
  async studioPromoteRepair(_i: string, _m: number, _reason: string, _limit = 0): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioSetHistoryLane(_i: string, _rev: number, _reason: string): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioStartBackfill(_i: string, _from: string, _reason: string): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioGetBackfill(ingressId: string): Promise<t.StudioBackfillStatus> {
    return {
      ingress_id: ingressId, backfill_id: 'bf_mock_1', state: 'caught_up', mode: 'once', from: '',
      cursor: 'page-40', records_done: 1200, pages_done: 40, source_total: 1200, transport_revision: 2,
      started_at: '2026-11-15T08:00:00Z', updated_at: '2026-11-15T08:05:00Z', caught_up_at: '2026-11-15T08:05:00Z',
      detail: '', reason: 'mock fill',
    };
  }
  async studioCancelBackfill(_i: string, _reason: string): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioListGaps(_i: string): Promise<t.StudioGap[]> {
    return [];
  }
  async studioGetRepair(ingressId: string): Promise<t.StudioRepairStatus> {
    return {
      ingress_id: ingressId, repair_id: 'rp-1', mapping_revision: 2, state: 'done',
      examined: 25, promoted: 25, skipped: 0, limit: 0, reason: 'mock repair',
      detail: 'revision 2 promoted over preserved deliveries; superseded projections remain readable',
      started_at: '2026-11-15T09:00:00Z', updated_at: '2026-11-15T09:00:04Z', finished_at: '2026-11-15T09:00:04Z',
    };
  }
  async studioSetCredential(_ingressId: string, _name: string, _value: string): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioClearCredential(_ingressId: string, _name: string, _reason: string): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioSetEgressPolicy(_ingressId: string, _policyJson: string): Promise<t.StudioAck> {
    return this.okAck();
  }
  async studioDeliveryFailures(_ingressId: string): Promise<t.StudioFailure[]> {
    return this.emptyPlanes ? [] : fx.studioFailures;
  }
  async studioReplayDeadDeliveries(_ingressId: string, _evidenceId = '', _reason = ''): Promise<t.StudioReplayAck> {
    return { ...this.okAck(), replayed: this.emptyPlanes ? 0 : fx.studioFailures.length };
  }

  // ---- Models, MCP servers, telemetry ----
  async listGenerators(): Promise<t.GeneratorSpec[]> {
    return this.fx.generators;
  }
  async saveGenerator(generator: t.GeneratorSpec, _reason: string): Promise<t.ConfigWriteResult> {
    this.fx.generators = [...this.fx.generators.filter((g) => g.id !== generator.id), generator];
    return this.configWrite(`generators.${generator.id}`);
  }
  async removeGenerator(id: string, _reason: string): Promise<t.ConfigWriteResult> {
    this.fx.generators = this.fx.generators.filter((g) => g.id !== id);
    return this.configWrite(`generators.${id}`);
  }
  async testGenerator(id: string): Promise<t.GeneratorTestResult> {
    const g = this.fx.generators.find((x) => x.id === id);
    return {
      reachable: true,
      round_trip_ms: g?.p50_latency_ms ?? 900,
      authenticated: true,
      model_served: g?.model ?? '',
      model_requested: g?.model ?? '',
      model_matches: true,
      native_tools_checked: !!g?.native_tools,
      native_tools_ok: !!g?.native_tools,
      tokens_in: 18,
      tokens_out: 4,
      tokens_cached: 0,
      error: '',
    };
  }
  async setGeneratorKey(id: string, key: string): Promise<t.ConfigWriteResult> {
    this.fx.generators = this.fx.generators.map((g) =>
      g.id === id ? { ...g, key_configured: true, key_last_four: key.slice(-4), key_source: 'keychain' } : g,
    );
    return this.configWrite(`generators.${id}.key`);
  }
  async clearGeneratorKey(id: string, _reason: string): Promise<t.ConfigWriteResult> {
    this.fx.generators = this.fx.generators.map((g) =>
      g.id === id ? { ...g, key_configured: false, key_last_four: '', key_source: '' } : g,
    );
    return this.configWrite(`generators.${id}.key`);
  }
  async listRoleAssignments(): Promise<t.RoleAssignment[]> {
    return this.fx.roles;
  }
  async setRoleAssignment(role: t.GeneratorRole, generatorId: string, _reason: string): Promise<t.ConfigWriteResult> {
    this.fx.roles = this.fx.roles.map((r) => (r.role === role ? { role, generator_id: generatorId } : r));
    return this.configWrite(`roles.${role}`);
  }
  async listMCPServerConfigs(): Promise<t.MCPServerConfig[]> {
    return this.fx.mcp;
  }
  async saveMCPServer(server: t.MCPServerConfig, _reason: string): Promise<t.ConfigWriteResult> {
    this.fx.mcp = [...this.fx.mcp.filter((s) => s.id !== server.id), server];
    return this.configWrite(`mcp.${server.id}`);
  }
  async removeMCPServer(id: string, _reason: string): Promise<t.ConfigWriteResult> {
    this.fx.mcp = this.fx.mcp.filter((s) => s.id !== id);
    return this.configWrite(`mcp.${id}`);
  }
  async setMCPServerToken(id: string, _token: string): Promise<t.ConfigWriteResult> {
    this.fx.mcp = this.fx.mcp.map((s) => (s.id === id ? { ...s, token_configured: true, token_source: 'keychain' } : s));
    return this.configWrite(`mcp.${id}.token`);
  }
  async clearMCPServerToken(id: string, _reason: string): Promise<t.ConfigWriteResult> {
    this.fx.mcp = this.fx.mcp.map((s) => (s.id === id ? { ...s, token_configured: false, token_source: '' } : s));
    return this.configWrite(`mcp.${id}.token`);
  }
  async testMCPServer(server: t.MCPServerConfig): Promise<t.MCPServerTestResult> {
    return server.last_error
      ? { ok: false, latency_ms: 0, tool_names: [], error: server.last_error }
      : { ok: true, latency_ms: 38, tool_names: ['read_file', 'list_dir', 'search'], error: '' };
  }
  async getTelemetryConfig(): Promise<t.TelemetryConfig> {
    return this.fx.telemetry;
  }
  async setTelemetryConfig(config: t.TelemetryConfig, _reason: string): Promise<t.TelemetryAck> {
    this.fx.telemetry = config;
    return { ok: true, error: '', warning: '' };
  }
  async setTelemetrySecretKey(key: string, _reason: string): Promise<t.TelemetryAck> {
    this.fx.telemetry = {
      ...this.fx.telemetry,
      secret_key_configured: true,
      secret_key_last_four: key.slice(-4),
    };
    return { ok: true, error: '', warning: '' };
  }
  async sendTestTrace(): Promise<t.TestTraceResult> {
    return { ok: true, latency_ms: 212, error: '', trace_id: 'mock-trace', host: this.fx.telemetry.host };
  }

  // ---- Chat routing and the plan builder ----
  async classifyInput(text: string): Promise<t.ClassifiedInput> {
    const lower = text.toLowerCase();
    if (/every|whenever|when .* (arrives|comes in)/.test(lower)) {
      return { classification: 'watch', why: 'Describes something to do each time an event happens.', confidence: 0.82 };
    }
    if (/^(remember|save|store)\b/.test(lower)) {
      return { classification: 'ingest', why: 'Asks to keep information for later.', confidence: 0.88 };
    }
    if (/\b(review|prepare|reconcile|draft|find|analy[sz]e)\b/.test(lower)) {
      return { classification: 'plan', why: 'A multi-step job for agents.', confidence: 0.76 };
    }
    return { classification: 'chat', why: 'A question to answer directly.', confidence: 0.9 };
  }
  async proposePlan(goal: string, answers: string[] = []): Promise<t.PlanProposalResponse> {
    if (answers.length === 0) {
      return {
        questions: [
          {
            question: 'Which period should this cover?',
            kind: 'scope',
            options: [
              { label: 'Last 30 days', detail: 'Faster; recent refunds only' },
              { label: 'This quarter', detail: 'Complete, about 3× the work' },
            ],
            why_it_changes_the_answer: 'The period decides how much of the ledger the agents read.',
          },
        ],
        proposal: null,
        access_consequence: '',
      };
    }
    const step = (query: string, caps: string[], deps: number[]): t.AuthoredStep => ({
      query,
      required_capabilities: caps,
      depends_on: deps,
      max_energy: 0.5,
      recommended_model: '',
      checkpoint_after: false,
      preferred_agent: '',
      agent_pin: '',
      is_thought: false,
      fan_out_over: 0,
      fan_out_var: '',
    });
    return {
      questions: [],
      proposal: {
        steps: [
          step(`Read the records needed for: ${goal}`, ['read:ledger'], []),
          step('Find the items that need attention', ['query:ledger'], [0]),
          step('Write up findings with citations', ['write:report'], [1]),
        ],
        estimated_tokens: 48_000,
        estimated_wall_ms: 240_000,
        max_parallel: 1,
        access_note: 'Reads documents tagged finance and payments.',
      },
      access_consequence: 'The plan can read finance and payments documents. It cannot read hr-confidential.',
    };
  }
  async submitPlan(steps: t.AuthoredStep[], _reason: string, dryRun = false): Promise<t.SubmitPlanResult> {
    return {
      command_id: `mock-${Date.now()}`,
      deduped: false,
      accepted: true,
      session_id: dryRun ? '' : 'session-1',
      plan_id: dryRun ? '' : 'plan-1',
      issues: [],
      execution_order: steps.map((_, i) => i),
    };
  }

  // ---- Logs ----
  private logTail: ReturnType<typeof setInterval> | null = null;
  async queryLogs(filter: t.LogFilter = {}, _afterSeq = 0, limit = 0): Promise<t.LogPage> {
    const order: t.LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const min = order.indexOf(filter.level_at_least ?? 'debug');
    let records = fx.logRecords(80).filter((r) => order.indexOf(r.level) >= min);
    if (filter.components?.length) records = records.filter((r) => filter.components!.includes(r.component));
    if (filter.contains) records = records.filter((r) => r.message.includes(filter.contains!));
    if (limit) records = records.slice(-limit);
    return {
      records,
      window: {
        boot_id: 'boot-7f3a',
        capacity: 10_000,
        count: 80,
        dropped: 0,
        oldest_unix_ms: records[0]?.at_unix_ms ?? Date.now(),
        newest_unix_ms: records[records.length - 1]?.at_unix_ms ?? Date.now(),
        last_seq: records[records.length - 1]?.seq ?? 0,
      },
    };
  }
  async startLogTail(_filter: t.LogFilter = {}, _afterSeq = 0): Promise<void> {
    // The real tail streams kernel://log events; the mock UI only needs the
    // call to succeed. History comes from queryLogs.
  }
  async stopLogTail(): Promise<void> {
    if (this.logTail) clearInterval(this.logTail);
    this.logTail = null;
  }

  // ---- Identity plane links ----
  async listLinkCandidates(_namespaceId?: string, _limit?: number): Promise<t.Link[]> {
    return this.fx.linkCandidates;
  }
  async confirmLink(linkId: string, _reason: string, _namespaceId?: string): Promise<t.LinkConfirmation> {
    const link = this.fx.linkCandidates.find((l) => l.id === linkId) ?? null;
    this.fx.linkCandidates = this.fx.linkCandidates.filter((l) => l.id !== linkId);
    return { command_id: `mock-${Date.now()}`, deduped: false, link: link && { ...link, state: 'confirmed' } };
  }
  async listLinkPairs(_namespaceId?: string, _limit?: number): Promise<t.LinkPair[]> {
    const byKey = new Map<string, t.LinkPair>();
    for (const l of this.fx.linkCandidates) {
      const pair = { namespace_id: l.namespace_id, family: l.family, from_ref: l.from_ref, to_ref: l.to_ref, relation: l.relation };
      const key = JSON.stringify(pair);
      const p = byKey.get(key) ?? { pair, confidence: 0, candidates: [], confirmations: [], already_confirmed: false };
      p.candidates.push(l);
      p.confidence = Math.max(p.confidence, l.confidence);
      byKey.set(key, p);
    }
    return [...byKey.values()];
  }
  private samePair(l: t.Link, k: t.LinkPairKey): boolean {
    return l.family === k.family && l.from_ref === k.from_ref && l.to_ref === k.to_ref && l.relation === k.relation;
  }
  async confirmLinkPair(pair: t.LinkPairKey, _reason: string): Promise<t.LinkPairConfirmation> {
    const rows = this.fx.linkCandidates.filter((l) => this.samePair(l, pair));
    this.fx.linkCandidates = this.fx.linkCandidates.filter((l) => !this.samePair(l, pair));
    return { command_id: `mock-${Date.now()}`, deduped: false, confirmations: rows.map((l) => ({ ...l, state: 'confirmed', mechanism: 'human' })) };
  }
  async rejectLinkPair(pair: t.LinkPairKey, _reason: string): Promise<t.LinkPairRejection> {
    const before = this.fx.linkCandidates.length;
    this.fx.linkCandidates = this.fx.linkCandidates.filter((l) => !this.samePair(l, pair));
    return { command_id: `mock-${Date.now()}`, deduped: false, retracted: before - this.fx.linkCandidates.length };
  }
  async retractLink(linkId: string, _reason: string, _namespaceId?: string): Promise<t.CommandAck> {
    this.fx.linkCandidates = this.fx.linkCandidates.filter((l) => l.id !== linkId);
    return this.ack();
  }

  // --------------------------------------------------------------------------

  __applyScenario(scenario: fx.MockScenario) {
    if (scenario === 'empty') {
      // A fresh kernel: nothing configured, nothing stored, nothing waiting.
      for (const key of Object.keys(this.fx) as (keyof typeof this.fx)[]) {
        if (Array.isArray(this.fx[key])) (this.fx[key] as unknown[]) = [];
      }
      this.emptyPlanes = true;
    }
    this.__seed(fx.scenarioState(this.initialState(), scenario));
  }

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

  private emitState() {
    this.stateListeners.forEach((fn) => fn(this.state));
  }
}

export const ipc = Object.assign(new MockIPC(), createAccountsMock(), createHierarchyMock());

// Development (not unit tests): start from the populated sample workspace, or
// the edge-state scenario chosen in localStorage / ?scenario= (mock-fixtures).
if (import.meta.env.MODE !== 'test') {
  ipc.__applyScenario(fx.readScenario());
}

// The mock must implement every call the real client makes; a screen that
// calls a missing method crashes in the browser preview. This line fails to
// type-check when the two drift.
const _complete: RealIPC = ipc;
void _complete;

export const onKernelState = (fn: (state: t.StateOfRecord) => void): Promise<() => void> =>
  Promise.resolve(ipc.onState(fn));

export const onKernelToken = (fn: (chunk: t.TokenChunk) => void): Promise<() => void> =>
  Promise.resolve(ipc.onToken(fn));

export type IPC = typeof ipc;
