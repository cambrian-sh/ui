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

  login: (endpoint: string, username: string, password: string): Promise<t.LoginResponse> =>
    invoke<t.LoginResponse>('op_login', { endpoint, username, password }),

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
} as const;

export type IPC = typeof ipc;

