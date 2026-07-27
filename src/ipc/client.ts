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

  listWatches: (): Promise<t.WatchConfigSummary[]> =>
    invoke<t.WatchConfigSummary[]>('op_list_watches'),

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
} as const;


export type IPC = typeof ipc;

