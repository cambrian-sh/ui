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
  queryMemory: (params: t.QueryMemoryParams): Promise<t.MemoryHit[]> =>
    invoke<t.MemoryHit[]>('op_query_memory', { ...params }),

  /**
   * ADR-0081: a grounded, [n]-cited answer + the evidence each marker resolves to.
   * Requires the kernel `memory-answer` capability; an older kernel rejects it.
   */
  answerMemory: (params: t.QueryMemoryParams): Promise<t.AnswerMemory> =>
    invoke<t.AnswerMemory>('op_answer_memory', { ...params }),
} as const;

export type IPC = typeof ipc;

