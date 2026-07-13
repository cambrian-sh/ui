

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

  setScope: (params: t.SetScopeParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_set_scope', { ...params }),

  registerSkill: (params: t.RegisterSkillParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_register_skill', { ...params }),

  registerMCP: (params: t.RegisterMCPParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_register_mcp', { ...params }),

  triggerConsolidation: (params: t.TriggerConsolidationParams): Promise<t.CommandAck> =>
    invoke<t.CommandAck>('op_trigger_consolidation', { ...params }),

  // ----- 2 new Tauri commands (per technical document §3.1, §3.2) -----

  getBlastRadiusPreview: (mutation: t.BlastRadiusMutation): Promise<t.BlastRadiusPreviewResponse> =>
    invoke<t.BlastRadiusPreviewResponse>('op_blast_radius_preview', { mutation: { ...mutation } }),

  getConfigSchema: (): Promise<t.ConfigSchema> =>
    invoke<t.ConfigSchema>('op_get_config_schema'),

  // ----- 9 new Tauri commands (UI-IMPL-21a: subsystems read) -----

  listAgents: (): Promise<t.AgentSummary[]> =>
    invoke<t.AgentSummary[]>('op_list_agents'),

  getAgent: (agentId: string): Promise<t.AgentDetail> =>
    invoke<t.AgentDetail>('op_get_agent', { agentId }),

  listTools: (): Promise<t.ToolSummary[]> =>
    invoke<t.ToolSummary[]>('op_list_tools'),

  getTool: (toolId: string): Promise<t.ToolDetail> =>
    invoke<t.ToolDetail>('op_get_tool', { toolId }),

  listSkills: (): Promise<t.SkillSummary[]> =>
    invoke<t.SkillSummary[]>('op_list_skills'),

  getSkill: (skillId: string): Promise<t.SkillDetail> =>
    invoke<t.SkillDetail>('op_get_skill', { skillId }),

  listMCPServers: (): Promise<t.MCPServerSummary[]> =>
    invoke<t.MCPServerSummary[]>('op_list_mcp_servers'),

  getMCPServer: (serverId: string): Promise<t.MCPServerDetail> =>
    invoke<t.MCPServerDetail>('op_get_mcp_server', { serverId }),

  getScope: (agentId: string): Promise<t.ScopeDetail> =>
    invoke<t.ScopeDetail>('op_get_scope', { agentId }),

  getWatchConfig: (id: string): Promise<t.WatchConfigDetail> =>
    invoke<t.WatchConfigDetail>('op_get_watch_config', { id }),
} as const;

export type IPC = typeof ipc;

