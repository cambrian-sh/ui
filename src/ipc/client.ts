/* Cambrian Web UI — the typed Tauri IPC client.
 *
 * Per EC-4 (gRPC in Rust core only) + the technical document §3.3 + §5.2.
 * Every component imports from `@/ipc`, never from `@tauri-apps/api/core` directly.
 * Tests use `./mock.ts` (same interface).
 *
 * The Tauri `invoke` signature expects `InvokeArgs = Record<string, unknown>`.
 * Our typed param interfaces don't carry an index signature (so they remain
 * precise). We spread each param into a fresh object literal at the call site
 * to satisfy the constraint without losing type safety on the parameter
 * itself.
 */

import { invoke } from '@tauri-apps/api/core';
import * as t from './types';

export const ipc = {
  // ----- 9 existing Tauri commands (per ui/src-tauri/src/lib.rs) -----

  login: (
    endpoint: string,
    username: string,
    password: string,
    remember: boolean,
  ): Promise<t.LoginResponse> =>
    invoke<t.LoginResponse>('op_login', { endpoint, username, password, remember }),

  /** Reconnect from the OS-keychain-saved connection (launch auto-connect). */
  loginSaved: (): Promise<t.LoginResponse> => invoke<t.LoginResponse>('op_login_saved'),

  /** The saved endpoint + username, if any. Password stays in the keychain. */
  savedConnection: (): Promise<t.SavedConnection | null> =>
    invoke<t.SavedConnection | null>('op_saved_connection'),

  /** Stop the feed, forget the token, reset to Down. Reconnect = a fresh login. */
  disconnect: (): Promise<void> => invoke<void>('op_disconnect'),

  getState: (): Promise<t.StateOfRecord> =>
    invoke<t.StateOfRecord>('op_get_state'),

  createSession: (params: t.CreateSessionParams): Promise<t.CreateSessionResponse> =>
    invoke<t.CreateSessionResponse>('op_create_session', { ...params }),

  sendMessage: (params: t.SendMessageParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_send_message', { ...params }),

  injectCorrection: (params: t.InjectCorrectionParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_inject_correction', { ...params }),

  // ---- Conversations (ADR-0084 D9). SendTurn returns the agent reply synchronously; the
  // core carries the conversation id in the {session_id} field of the open response.
  openConversation: async (params: t.OpenConversationParams): Promise<string> => {
    const resp = await invoke<t.CreateSessionResponse>('op_open_conversation', { ...params });
    return resp.session_id;
  },

  sendTurn: (params: t.SendTurnParams): Promise<t.ConversationMessage | null> =>
    invoke<t.ConversationMessage | null>('op_send_turn', { ...params }),

  listConversations: (params: t.ListConversationsParams): Promise<t.ConversationSummary[]> =>
    invoke<t.ConversationSummary[]>('op_list_conversations', { ...params }),

  listConversationMessages: (
    params: t.ListConversationMessagesParams,
  ): Promise<t.ConversationMessage[]> =>
    invoke<t.ConversationMessage[]>('op_list_conversation_messages', { ...params }),

  closeConversation: (params: t.CloseConversationParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_close_conversation', { ...params }),

  pauseSession: (params: t.PauseSessionParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_pause_session', { ...params }),

  resumeSession: (params: t.ResumeSessionParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_resume_session', { ...params }),

  completeSession: (params: t.CompleteSessionParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_complete_session', { ...params }),

  resolveHITL: (params: t.ResolveHITLParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_resolve_hitl', { ...params }),

  setToolGrant: (params: t.SetToolGrantParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_set_tool_grant', { ...params }),

  // ----- 2 new Tauri commands (per technical document §3.1, §3.2) -----

  getBlastRadiusPreview: (mutation: t.BlastRadiusMutation): Promise<t.BlastRadiusPreviewResponse> =>
    invoke<t.BlastRadiusPreviewResponse>('op_blast_radius_preview', { mutation: { ...mutation } }),

  getConfigSchema: (): Promise<t.ConfigSchema> =>
    invoke<t.ConfigSchema>('op_get_config_schema'),

  /**
   * Hot-apply numeric runtime tunables without a kernel restart (ADR-0054).
   *
   * Partial sets merge over the live values, so send only what the operator
   * changed. Unknown keys are ignored kernel-side, which is what makes a stale
   * schema safe: a retired axis cannot be written back in.
   *
   * **Edits are ephemeral** — they live in memory and `config.json` stays the
   * boot default. Any surface calling this has to say so.
   */
  setRuntimeConfig: (
    params: Record<string, number>,
    reason: string,
  ): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_set_runtime_config', { params, reason }),

  setScope: (params: t.SetScopeParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_set_scope', {
      agent_id: params.agent_id,
      required_tags: params.required_tags,
      any_of_tags: params.any_of_tags,
      forbidden_tags: params.forbidden_tags,
      reason: params.reason,
    }),

  registerMCP: (params: t.RegisterMCPParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_register_mcp', {
      name: params.name,
      command: params.command,
      url: params.url,
      reason: params.reason,
    }),

  registerSkill: (params: t.RegisterSkillParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_register_skill', {
      name: params.name,
      description: params.description,
      instructions: params.instructions,
      tool_grants: params.tool_grants,
      scope_tags: params.scope_tags,
      reason: params.reason,
    }),

  triggerConsolidation: (params: t.TriggerConsolidationParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_trigger_consolidation', {
      scope: '',
      reason: params.reason,
    }),

  listTools: (): Promise<t.ToolSummary[]> =>
    invoke<t.ToolSummary[]>('op_list_tools'),

  listSkills: (): Promise<t.SkillSummary[]> =>
    invoke<t.SkillSummary[]>('op_list_skills'),

  // ── Reactive: six RPCs that were on the contract but unwired ────────────
  // No kernel change was needed for any of these; see report.md §2b.

  /** Every watch config, unabridged — what the pipeline builder edits. */
  listWatchConfigs: (): Promise<t.WatchConfigFull[]> =>
    invoke<t.WatchConfigFull[]>('op_list_watch_configs'),

  registerWatch: (config: t.WatchConfigFull, reason: string): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_register_watch', { config, reason }),

  deleteWatch: (watchId: string, reason: string): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_delete_watch', { watch_id: watchId, reason }),

  setWatchActive: (
    watchId: string,
    active: boolean,
    reason: string,
  ): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_set_watch_active', { watch_id: watchId, active, reason }),

  listWatchDeadLetters: (limit = 0): Promise<t.WatchDeadLetter[]> =>
    invoke<t.WatchDeadLetter[]>('op_list_watch_dead_letters', { limit }),

  getWatchMetrics: (): Promise<t.WatchMetrics[]> =>
    invoke<t.WatchMetrics[]>('op_get_watch_metrics'),

  /** Replay the journal through a candidate config. Never executes an arm. */
  backtestWatch: (
    config: t.WatchConfigFull,
    afterSeq = 0,
  ): Promise<t.WatchBacktestVerdict[]> =>
    invoke<t.WatchBacktestVerdict[]>('op_backtest_watch', {
      config,
      after_seq: afterSeq,
    }),

  previewRoute: (
    taskDesc: string,
    requiredCapabilities: string[],
    candidates: t.PreviewCandidate[],
  ): Promise<t.PreviewRouteResult> =>
    invoke<t.PreviewRouteResult>('op_preview_route', {
      task_desc: taskDesc,
      required_capabilities: requiredCapabilities,
      candidates,
    }),

  listWatches: (): Promise<t.WatchConfigSummary[]> =>
    invoke<t.WatchConfigSummary[]>('op_list_watches'),

  /**
   * Authored reactive pipelines (kernel contract 0087).
   *
   * Empty on a kernel with no pipeline runtime — the RPC answers with a list,
   * not an error, so the console renders an empty panel rather than a failure.
   */
  listPipelines: (): Promise<t.PipelineSummary[]> =>
    invoke<t.PipelineSummary[]>('op_list_pipelines'),
  /**
   * What actually reached one node, newest first.
   *
   * The inspector could say a node RAN and never what ran through it: an
   * operator watching their own data saw "effect confirmed" and not one value
   * that landed.
   */
  listNodeItems: (pipelineId: string, nodeId: string, limit = 25): Promise<t.NodeItem[]> =>
    invoke<t.NodeItem[]>('op_list_node_items', {
      pipeline_id: pipelineId, node_id: nodeId, limit,
    }),

  /**
   * Shadow-run a pipeline over its captured deliveries (kernel contract 0088).
   *
   * Performs nothing. A refusal arrives in `refused` rather than as a thrown
   * error, because "nothing has been captured yet" and "the graph does not
   * compile" are different problems with different fixes and both would
   * otherwise reduce to one red box.
   */
  /** One authored revision plus its current refusals (kernel contract 0089). */
  getPipeline: (pipelineId: string, revision = 0): Promise<t.PipelineGraph> =>
    invoke<t.PipelineGraph>('op_get_pipeline', { pipeline_id: pipelineId, revision }),

  /**
   * Compile a graph document without storing it (kernel contract 0089).
   *
   * Safe to call on every change: the RPC has no power to store or transition,
   * which is why the editor is given this one and not Publish.
   */
  validatePipeline: (graphJson: string): Promise<t.PipelineValidation> =>
    invoke<t.PipelineValidation>('op_validate_pipeline', { graph_json: graphJson }),

  /**
   * Store an edited graph as a new draft revision (kernel contract 0090).
   *
   * Creates a draft and nothing further — publishing and arming are separate
   * acts on the lifecycle, each with its own gate.
   */
  savePipeline: (graphJson: string, commandId = ''): Promise<t.PipelineSaved> =>
    invoke<t.PipelineSaved>('op_save_pipeline', {
      graph_json: graphJson,
      command_id: commandId,
    }),

  /**
   * Move one revision along its lifecycle (kernel contract 0093): publish,
   * arm, pause, retire. `armed` walks a draft through validate and publish on
   * the way — one intent, every gate still gets its say, and a refusal names
   * the gate that held.
   */
  transitionPipeline: (
    pipelineId: string,
    toState: string,
    revision = 0,
    reason = '',
  ): Promise<t.PipelineTransitioned> =>
    invoke<t.PipelineTransitioned>('op_transition_pipeline', {
      pipeline_id: pipelineId,
      revision,
      to_state: toState,
      reason,
    }),

  dryRunPipeline: (pipelineId: string, revision = 0, sampleLimit = 0): Promise<t.PipelineDryRun> =>
    invoke<t.PipelineDryRun>('op_dry_run_pipeline', {
      pipeline_id: pipelineId,
      revision,
      sample_limit: sampleLimit,
    }),

  // ----- Memory (kernel contract 0057) -----

  /** Ingest one document. See `IngestMemoryParams` for the two body lanes. */
  ingestMemory: (params: t.IngestMemoryParams): Promise<t.IngestMemoryResponse> =>
    invoke<t.IngestMemoryResponse>('op_ingest_memory', { ...params }),

  /**
   * File lane: the Rust core reads the bytes from a local path the OS dialog
   * returned, so a large file never crosses the JS/IPC boundary as a number[].
   */
  ingestFile: (params: t.IngestFileParams): Promise<t.IngestMemoryResponse> =>
    invoke<t.IngestMemoryResponse>('op_ingest_file', { ...params }),

  /** Name + size of a picked file, without reading its bytes. */
  statFile: (path: string): Promise<t.FileStat> => invoke<t.FileStat>('op_stat_file', { path }),

  /**
   * Ranked recall. Returns EVIDENCE, not an answer — this is the kernel's
   * deterministic single-pass lane. To get a composed answer, drive the chat lane
   * (`createSession` + `sendMessage`) and cite these hits alongside it.
   */
  queryMemory: (params: t.QueryMemoryParams): Promise<t.MemoryQueryResult> =>
    invoke<t.MemoryQueryResult>('op_query_memory', { ...params }),

  /**
   * Enumerate documents by ROW (contract 0070).
   *
   * The counterpart to `queryMemory`, not a variant of it. Search answers "find the
   * document that says X"; this answers "which of my documents have no labels?" — a
   * question with no query text, because the operator does not yet know what those
   * documents say. Access policy acts only on labels, so an unlabelled document is
   * invisible to the policy model rather than denied.
   *
   * Requires the kernel `document-listing` capability; an older kernel answers
   * Unimplemented.
   */
  listDocuments: (params: t.ListDocumentsParams = {}): Promise<t.DocumentPage> =>
    invoke<t.DocumentPage>('op_list_documents', { ...params }),

  /**
   * ADR-0081: a grounded, [n]-cited answer + the evidence each marker resolves to.
   * Requires the kernel `memory-answer` capability; an older kernel rejects it.
   */
  answerMemory: (params: t.QueryMemoryParams): Promise<t.AnswerMemory> =>
    invoke<t.AnswerMemory>('op_answer_memory', { ...params }),

  // ---- Access policy (ADR-0085/0086/0087) ---------------------------------
  //
  // The first premium UI surface. `explainAccess` and `listClassificationTags`
  // ride the pinned OSS contract; the rest ride premium's own plane over the same
  // connection (ADR-0088). All of them answer Unimplemented on a kernel without
  // the policy plugin, so call sites gate on the `access-policy` capability and
  // show an empty state naming what to enable.

  /**
   * Why a principal can or cannot reach something — answered WITHOUT performing
   * the access. The reply names the reason, the specific tag or effect
   * responsible, and which policy (linked where) contributed it.
   */
  explainAccess: (params: t.ExplainAccessParams): Promise<t.AccessDecision> =>
    invoke<t.AccessDecision>('op_explain_access', { ...params }),

  /**
   * The controlled classification vocabulary. Tag inputs must SELECT from this,
   * never accept free text: a typo is the primary route to a scope that silently
   * matches nothing (ADR-0085 D11).
   */
  listClassificationTags: (): Promise<string[]> =>
    invoke<string[]>('op_list_classification_tags'),

  /**
   * The vocabulary WITH closed-ness (ADR-0091). Separate from
   * `listClassificationTags`, which rides the pinned OSS contract and carries only
   * the names — closed-ness is a premium concept on the premium plane.
   */
  listTags: (): Promise<t.TagSpec[]> => invoke<t.TagSpec[]>('op_list_tags'),

  listIngresses: (): Promise<t.IngressSpec[]> => invoke<t.IngressSpec[]>('op_list_ingresses'),

  // ── Telegram ingress (ADR-0090) ───────────────────────────────────────────
  /** An empty `botId` means the default bot, so callers that predate multiple
   *  bots keep working unchanged. */
  telegramStatus: (botId = ''): Promise<t.TelegramStatus> =>
    invoke<t.TelegramStatus>('op_telegram_status', { bot_id: botId }),
  /** Store a bot token. Write-only — nothing returns it, by design. */
  telegramSetToken: (token: string, botId = ''): Promise<t.TelegramAck> =>
    invoke<t.TelegramAck>('op_telegram_set_token', { token, bot_id: botId }),
  /** Destructive: stops the ingress and disconnects its conversations. Reason is mandatory. */
  telegramClearToken: (reason: string, botId = ''): Promise<t.TelegramAck> =>
    invoke<t.TelegramAck>('op_telegram_clear_token', { reason, bot_id: botId }),
  telegramSetEnabled: (enabled: boolean, botId = ''): Promise<t.TelegramAck> =>
    invoke<t.TelegramAck>('op_telegram_set_enabled', { enabled, bot_id: botId }),

  /** Every configured bot, with the state of each (contract 0081). */
  telegramListBots: (): Promise<t.TelegramBot[]> =>
    invoke<t.TelegramBot[]>('op_telegram_list_bots'),
  /** Record a new bot. Its daemon starts on the next kernel start. */
  telegramAddBot: (id: string, label: string, token = ''): Promise<t.TelegramAck> =>
    invoke<t.TelegramAck>('op_telegram_add_bot', { id, label, token }),
  /** Stop a bot and forget its credential. Reason is mandatory. */
  telegramRemoveBot: (id: string, reason: string): Promise<t.TelegramAck> =>
    invoke<t.TelegramAck>('op_telegram_remove_bot', { id, reason }),

  // ── Ingress Studio (ADR-0112 §13) ─────────────────────────────────────────
  studioCreateIngress: (ingressId: string, displayName: string): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_create_ingress', { ingress_id: ingressId, display_name: displayName }),
  studioListIngresses: (): Promise<t.StudioIngress[]> =>
    invoke<t.StudioIngress[]>('op_studio_list_ingresses'),
  studioGetIngress: (ingressId: string): Promise<t.StudioStatus> =>
    invoke<t.StudioStatus>('op_studio_get_ingress', { ingress_id: ingressId }),
  /** verb ∈ start_capture | confirm_mapping | start_dry_run | pause | resume | retire.
   *  The kernel's state machine decides legality; refusals come back named. */
  studioLifecycle: (verb: string, ingressId: string, reason = ''): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_lifecycle', { verb, ingress_id: ingressId, reason }),
  /** Mints an immutable release and arms it — the one action a model can never take. */
  studioArm: (ingressId: string, transportRevision: number, mappingRevision: number, reason: string): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_arm', {
      ingress_id: ingressId, transport_revision: transportRevision,
      mapping_revision: mappingRevision, reason,
    }),
  /** Re-pins an EXISTING release while paused. Reason is mandatory. */
  studioRollback: (ingressId: string, releaseId: string, reason: string, resume: boolean): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_rollback', { ingress_id: ingressId, release_id: releaseId, reason, resume }),
  /** kind ∈ transport | mapping. The kernel's strict parser is the validator. */
  studioSaveSpec: (kind: string, ingressId: string, specJson: string): Promise<t.StudioSaveResult> =>
    invoke<t.StudioSaveResult>('op_studio_save_spec', { kind, ingress_id: ingressId, spec_json: specJson }),
  studioGetRevision: (kind: string, ingressId: string, revision: number): Promise<t.StudioSpec> =>
    invoke<t.StudioSpec>('op_studio_get_revision', { kind, ingress_id: ingressId, revision }),
  studioDiffMapping: (ingressId: string, fromRevision: number, toRevision: number): Promise<t.StudioDiff> =>
    invoke<t.StudioDiff>('op_studio_diff_mapping', {
      ingress_id: ingressId, from_revision: fromRevision, to_revision: toRevision,
    }),
  /**
   * READ-ONLY proposal (plan D1); saving it is a separate human action.
   * `baseSpecJson` non-empty = REVISE that mapping per the guidance (change
   * only what the words require, stream identity kept); empty = draft from
   * scratch off the capture profile.
   */
  studioDraftMapping: (
    ingressId: string,
    guidance: string,
    baseSpecJson = '',
  ): Promise<t.StudioDraft> =>
    invoke<t.StudioDraft>('op_studio_draft_mapping', {
      ingress_id: ingressId,
      guidance,
      base_spec_json: baseSpecJson,
    }),
  studioCaptureStatus: (ingressId: string): Promise<t.StudioCaptureStatus> =>
    invoke<t.StudioCaptureStatus>('op_studio_capture_status', { ingress_id: ingressId }),
  /** Real captured deliveries, redacted at capture, newest first. */
  studioCaptureSamples: (ingressId: string, limit = 10): Promise<t.StudioCaptureSamples> =>
    invoke<t.StudioCaptureSamples>('op_studio_capture_samples', {
      ingress_id: ingressId,
      limit,
    }),
  /**
   * Source Discovery (ADR-0115): a sentence and a URL instead of a form.
   *
   * Five calls, not one, because the capabilities behind them are separate:
   * approving an origin is not implied by running, and accepting a proposal is
   * not implied by answering.
   */
  studioStartDiscovery: (ingressId: string, intent: string, endpoint: string): Promise<t.DiscoverySession> =>
    invoke<t.DiscoverySession>('op_studio_start_discovery', {
      ingress_id: ingressId, intent, endpoint,
    }),
  studioGetDiscovery: (ingressId: string, sessionId: string): Promise<t.DiscoverySession> =>
    invoke<t.DiscoverySession>('op_studio_get_discovery', {
      ingress_id: ingressId, session_id: sessionId,
    }),
  studioAnswerDiscovery: (
    ingressId: string, sessionId: string, questionId: string, answer: string,
    expectedVersion: number, proposalRevision: number, idempotencyKey: string,
  ): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_answer_discovery', {
      ingress_id: ingressId, session_id: sessionId, question_id: questionId,
      answer, expected_version: expectedVersion,
      proposal_revision: proposalRevision, idempotency_key: idempotencyKey,
    }),
  /** Exact origin — scheme, host AND port. Never a domain suffix. */
  studioApproveOrigin: (
    ingressId: string, sessionId: string, scheme: string, host: string, port: string,
  ): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_approve_origin', {
      ingress_id: ingressId, session_id: sessionId, scheme, host, port,
    }),
  studioAcceptDiscovery: (ingressId: string, sessionId: string): Promise<t.StudioSaveResult> =>
    invoke<t.StudioSaveResult>('op_studio_accept_discovery', {
      ingress_id: ingressId, session_id: sessionId,
    }),
  /**
   * Tell the agent what is wrong with a proposal, in the operator's own words.
   * Neither accept nor reject: the standing proposal survives until the agent
   * produces a better one.
   */
  studioCommentDiscovery: (
    ingressId: string, sessionId: string, comment: string,
  ): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_comment_discovery', {
      ingress_id: ingressId, session_id: sessionId, comment,
    }),
  /** The DRY_RUN stage's ephemeral buffer — real deliveries, never preserved. */
  studioPreview: (ingressId: string): Promise<t.StudioPreviewEntry[]> =>
    invoke<t.StudioPreviewEntry[]>('op_studio_preview', { ingress_id: ingressId }),
  /** Evaluates a candidate revision over preserved deliveries, WRITING NOTHING. */
  studioShadowReprocess: (ingressId: string, mappingRevision: number, limit = 0): Promise<string> =>
    invoke<string>('op_studio_shadow_reprocess', {
      ingress_id: ingressId, mapping_revision: mappingRevision, limit,
    }),
  /** Applies the reviewed diff. Reason is mandatory. */
  studioPromoteRepair: (ingressId: string, mappingRevision: number, reason: string, limit = 0): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_promote_repair', {
      ingress_id: ingressId, mapping_revision: mappingRevision, limit, reason,
    }),
  /** Write-only — nothing returns the value, by design. */
  studioSetCredential: (ingressId: string, name: string, value: string): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_set_credential', { ingress_id: ingressId, name, value }),
  /** Destructive: deliveries answer 503 until a new credential is set. Reason mandatory. */
  studioClearCredential: (ingressId: string, name: string, reason: string): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_clear_credential', { ingress_id: ingressId, name, reason }),
  studioSetEgressPolicy: (ingressId: string, policyJson: string): Promise<t.StudioAck> =>
    invoke<t.StudioAck>('op_studio_set_egress_policy', { ingress_id: ingressId, policy_json: policyJson }),
  studioDeliveryFailures: (ingressId: string): Promise<t.StudioFailure[]> =>
    invoke<t.StudioFailure[]>('op_studio_delivery_failures', { ingress_id: ingressId }),

  // ── The record lane (ADR-0102) — the drift product ────────────────────────
  // Reads on the premium plane, gated on `record-lane`. These are request/
  // response rather than projection because alerts are NOT on the operator event
  // feed: `ListAlerts` is poll-only, and a live indicator over a poll would be a
  // lie. When alerts gain a feed lane (a contract bump) these move.

  /**
   * Raised drift alerts, newest first, scoped to the caller.
   *
   * Every alert stands alone — `quote` is populated on its citations — so the
   * feed and its evidence inspector render with no second round trip.
   */
  listAlerts: (): Promise<t.Alert[]> => invoke<t.Alert[]>('op_list_alerts'),

  /**
   * The four-outcome tally.
   *
   * Check `available` FIRST and separately: false means this deployment has no
   * reconciler, and rendering it as four zeros is the exact failure the field
   * exists to prevent.
   */
  getDriftStats: (): Promise<t.DriftStats> => invoke<t.DriftStats>('op_get_drift_stats'),

  /** What the lane declined to compare, and across which closed boundary. */
  listRefusals: (): Promise<t.Refusal[]> => invoke<t.Refusal[]>('op_list_refusals'),

  /**
   * Retention history for the RECORD source.
   *
   * The feed (`retention_runs` on the projection) is the live lane and covers
   * both sources; this only backfills what the feed cannot replay, so a failed
   * pass from before login is visible on the first paint.
   */
  listRetentionRuns: (): Promise<t.RetentionRunEvent[]> =>
    invoke<t.RetentionRunEvent[]>('op_list_retention_runs'),

  /**
   * What every connected source can and cannot see.
   *
   * An EMPTY array means no connector has reported — not "coverage is zero".
   * There is deliberately no `reportCoverage` here: reporting is a connector's
   * job, and an operator console asserting what a daemon can see would be
   * inventing the denominator this surface exists to make honest.
   */
  getCoverage: (): Promise<t.SourceCoverage[]> => invoke<t.SourceCoverage[]>('op_get_coverage'),

  /** Last accepted push per record kind. Empty is a real answer: no import recorded. */
  getPushStatus: (): Promise<t.KindPushStatus[]> => invoke<t.KindPushStatus[]>('op_get_push_status'),

  /**
   * Apply or remove one label on a document or memory.
   *
   * For a document this is authoritative and atomic: the kernel moves the document row
   * and every one of its chunks together, so a document can never end up half-labelled.
   */
  tagMemory: (doc_id: string, tag: string, add: boolean, reason: string): Promise<boolean> =>
    invoke<boolean>('op_tag_memory', { doc_id, tag, add, reason }),

  /**
   * Draft a policy from a description in English. Read-only: it returns a
   * proposal, and applying it is savePolicy + linkPolicy, called separately.
   */
  proposePolicy: (request: string, simulateLimit = 0): Promise<t.PolicyProposal> =>
    invoke<t.PolicyProposal>('op_propose_policy', { request, simulate_limit: simulateLimit }),

  /**
   * Register an ingress. Registration MINTS A SURFACE — it decides what an entry
   * point may reach — so this is policy-grade authority, not a convenience.
   * Validation failures arrive in `error` for inline rendering.
   */
  registerIngress: (ingress: t.IngressSpec): Promise<t.SaveOutcome> =>
    invoke<t.SaveOutcome>('op_register_ingress', { ingress }),

  /** Deregister. Takes effect on EXISTING conversations, not just new ones. */
  deregisterIngress: (agentId: string): Promise<void> =>
    invoke<void>('op_deregister_ingress', { agent_id: agentId }),

  listGroups: (): Promise<t.GroupSpec[]> => invoke<t.GroupSpec[]>('op_list_groups'),

  /** Create or replace a group. A nesting cycle comes back in `error`, with the path. */
  saveGroup: (group: t.GroupSpec): Promise<t.SaveOutcome> =>
    invoke<t.SaveOutcome>('op_save_group', { group }),

  deleteGroup: (id: string): Promise<void> => invoke<void>('op_delete_group', { id }),

  listPolicies: (): Promise<t.PolicySpec[]> => invoke<t.PolicySpec[]>('op_list_policies'),

  /**
   * Save a policy. An unsatisfiable rule or a tag outside the vocabulary comes
   * back in `error` — the administrator learns at save time, not through an empty
   * result three days later.
   */
  savePolicy: (policy: t.PolicySpec): Promise<t.SaveOutcome> =>
    invoke<t.SaveOutcome>('op_save_policy', { policy }),

  deletePolicy: (id: string): Promise<void> => invoke<void>('op_delete_policy', { id }),

  listLinks: (): Promise<t.LinkSpec[]> => invoke<t.LinkSpec[]>('op_list_links'),

  linkPolicy: (link: t.LinkSpec): Promise<void> => invoke<void>('op_link_policy', { link }),

  unlinkPolicy: (params: {
    policy_id: string;
    container_kind: string;
    target_id: string;
  }): Promise<void> => invoke<void>('op_unlink_policy', { ...params }),

  /** The effective policy for a principal, and which link produced each term. */
  resultantPolicy: (params: {
    principal_id: string;
    principal_kind?: string;
    surface_kind?: string;
    surface_id?: string;
  }): Promise<t.ResultantPolicy> =>
    invoke<t.ResultantPolicy>('op_resultant_policy', { ...params }),

  /**
   * What would change if this were enabled — replayed against REAL journalled
   * history. Nothing is persisted and the simulation is not itself journalled.
   */
  simulatePolicy: (params: {
    draft_policies?: t.PolicySpec[];
    draft_links?: t.LinkSpec[];
    limit?: number;
  }): Promise<t.SimulationResult> =>
    invoke<t.SimulationResult>('op_simulate_policy', { ...params }),

  /** The decision journal, for audit. Denials are never sampled kernel-side. */
  exportDecisions: (params: {
    limit?: number;
    denials_only?: boolean;
  }): Promise<t.DecisionRecord[]> =>
    invoke<t.DecisionRecord[]>('op_export_decisions', { ...params }),

  // ── Models & providers ────────────────────────────────────────────────────
  // Served: reads on contract 0072, writes on 0083. The writes land on the
  // ADR-0101 store, not on a config file — the operator plane does not edit
  // gitignored JSON, which is the practice that store exists to end.

  listGenerators: (): Promise<t.GeneratorSpec[]> =>
    invoke<t.GeneratorSpec[]>('op_list_generators'),

  /**
   * Create or replace a generator.
   *
   * The result carries the kernel's per-key `effect`, which for generators is
   * `restart_required`: they are built once, at boot, into the provider's
   * routing table. Rendering this as a plain "Saved" would leave an operator
   * watching traffic go to a model they believe they replaced.
   */
  saveGenerator: (generator: t.GeneratorSpec, reason: string): Promise<t.ConfigWriteResult> =>
    invoke<t.ConfigWriteResult>('op_save_generator', { generator, reason }),

  removeGenerator: (id: string, reason: string): Promise<t.ConfigWriteResult> =>
    invoke<t.ConfigWriteResult>('op_remove_generator', { id, reason }),

  /** One real call against the live endpoint. Billed like any other. */
  testGenerator: (id: string): Promise<t.GeneratorTestResult> =>
    invoke<t.GeneratorTestResult>('op_test_generator', { id }),

  /**
   * Write-only, exactly like the Telegram bot token: the key goes in and only
   * its last four ever come back. There is deliberately no `getGeneratorKey`.
   */
  setGeneratorKey: (id: string, key: string): Promise<t.ConfigWriteResult> =>
    invoke<t.ConfigWriteResult>('op_set_generator_key', { id, key }),

  clearGeneratorKey: (id: string, reason: string): Promise<t.ConfigWriteResult> =>
    invoke<t.ConfigWriteResult>('op_clear_generator_key', { id, reason }),

  // ── Part 3 PROPOSED CONTRACT ───────────────────────────────────────────
  // No kernel serves these yet; every call rejects and the panes say so rather
  // than rendering an empty form. See report.md §4.8–§4.15.

  getTelemetryConfig: (): Promise<t.TelemetryConfig> =>
    invoke<t.TelemetryConfig>('op_get_telemetry_config'),

  setTelemetryConfig: (config: t.TelemetryConfig, reason: string): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_set_telemetry_config', { config, reason }),

  setTelemetrySecretKey: (key: string): Promise<t.SaveOutcome> =>
    invoke<t.SaveOutcome>('op_set_telemetry_secret_key', { key }),

  /** The tracer DROPS what it cannot send, so this is the only way to know. */
  sendTestTrace: (): Promise<t.TestTraceResult> =>
    invoke<t.TestTraceResult>('op_send_test_trace'),

  /** Every principal this deployment has — agents, group members, policy-link
   *  targets and bound people. The console cannot derive this itself: only the
   *  kernel sees all four sources. */
  listPrincipals: (): Promise<t.PrincipalSpec[]> =>
    invoke<t.PrincipalSpec[]>('op_list_principals'),

  listIdentityBindings: (surface: string): Promise<t.IdentityBinding[]> =>
    invoke<t.IdentityBinding[]>('op_list_identity_bindings', { surface }),

  /** The whole binding travels, because the label fields are what make a row
   *  recognisable later — the id alone is not a person to anybody. */
  bindIdentity: (binding: t.IdentityBinding, reason: string): Promise<t.SaveOutcome> =>
    invoke<t.SaveOutcome>('op_bind_identity', { binding, reason }),

  unbindIdentity: (surface: string, externalId: string, reason: string): Promise<void> =>
    invoke<void>('op_unbind_identity', { surface, external_id: externalId, reason }),

  listUnboundSenders: (surface: string): Promise<t.UnboundSender[]> =>
    invoke<t.UnboundSender[]>('op_list_unbound_senders', { surface }),

  /** Drops at the ingress — never reaches a policy or a plan.
   *  `blocked: false` lifts the block, so the call is reversible without a second one. */
  blockSender: (
    surface: string,
    externalId: string,
    blocked: boolean,
    reason: string,
  ): Promise<void> =>
    invoke<void>('op_block_sender', { surface, external_id: externalId, blocked, reason }),

  getStrangerPolicy: (surface: string): Promise<t.StrangerPolicy> =>
    invoke<t.StrangerPolicy>('op_get_stranger_policy', { surface }),

  setStrangerPolicy: (policy: t.StrangerPolicy, reason: string): Promise<t.SaveOutcome> =>
    invoke<t.SaveOutcome>('op_set_stranger_policy', { policy, reason }),

  listIngressActivity: (surface: string, limit = 20): Promise<t.IngressActivityPage> =>
    invoke<t.IngressActivityPage>('op_list_ingress_activity', { surface, limit }),

  /** Classify without acting — the decision shown before it happens. */
  classifyInput: (text: string): Promise<t.ClassifiedInput> =>
    invoke<t.ClassifiedInput>('op_classify_input', { text }),

  /** Propose a plan WITHOUT starting a session. Nothing is committed. */
  proposePlan: (goal: string, answers: string[] = []): Promise<t.PlanProposalResponse> =>
    invoke<t.PlanProposalResponse>('op_propose_plan', { goal, answers }),

  submitPlan: (
    steps: t.AuthoredStep[],
    reason: string,
    dryRun = false,
  ): Promise<t.SubmitPlanResult> =>
    invoke<t.SubmitPlanResult>('op_submit_plan', { steps, reason, dry_run: dryRun }),

  // ── Kernel logs (contract 0082, operator-only) ────────────────────────────
  /** History over the kernel's retention window. */
  queryLogs: (filter: t.LogFilter = {}, afterSeq = 0, limit = 0): Promise<t.LogPage> =>
    invoke<t.LogPage>('op_query_logs', { filter, after_seq: afterSeq, limit }),
  /**
   * Start the live tail. Records arrive on the `kernel://log` event.
   *
   * `afterSeq` of 0 starts at the kernel's live edge rather than replaying the
   * window — ask for history with `queryLogs` first, then tail from the sequence
   * it returned. Calling this again REPLACES the running tail.
   */
  startLogTail: (filter: t.LogFilter = {}, afterSeq = 0): Promise<void> =>
    invoke<void>('op_start_log_tail', { filter, after_seq: afterSeq }),
  stopLogTail: (): Promise<void> => invoke<void>('op_stop_log_tail'),

  // ── Knowledge substrate (ADR-0118) ──────────────────────────────────────

  /**
   * One natural-language question → compiled AST + exact answer, or a refusal.
   * A refusal is a first-class outcome, not an error — render it as the plane
   * working (it refuses rather than guesses), with the compiled query shown
   * whenever an answer arrives.
   */
  askKnowledge: (question: string): Promise<t.AskOutcome> =>
    invoke<t.AskOutcome>('op_knowledge_ask', { question }),

  /**
   * One closed-AST query — the console's own drill-ins (entity cards, the
   * contradictions view, evidence receipts, the neighborhood graph). Internal
   * plumbing behind curated affordances; the USER-facing query surface is the
   * ask box, never a structured builder.
   */
  knowledgeQuery: (query: Partial<t.CompiledQuery>): Promise<t.KnowledgeAnswer> =>
    invoke<t.KnowledgeAnswer>('op_knowledge_query', { query }),

  /** What the substrate holds, per source surface (full-visibility numbers). */
  knowledgeOverview: (): Promise<t.SubstrateOverview> =>
    invoke<t.SubstrateOverview>('op_knowledge_overview'),

  /** Browsable entities matching a substring; names and predicates only. */
  listKnowledgeEntities: (query: string, limit = 50): Promise<t.KnowledgeEntity[]> =>
    invoke<t.KnowledgeEntity[]>('op_knowledge_entities', { query, limit }),

  listRoleAssignments: (): Promise<t.RoleAssignment[]> =>
    invoke<t.RoleAssignment[]>('op_list_role_assignments'),

  setRoleAssignment: (
    role: t.GeneratorRole,
    generatorId: string,
    reason: string,
  ): Promise<t.SaveOutcome> =>
    invoke<t.SaveOutcome>('op_set_role_assignment', {
      role,
      generator_id: generatorId,
      reason,
    }),
} as const;


export type IPC = typeof ipc;

