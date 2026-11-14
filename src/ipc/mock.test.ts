import { describe, it, expect, beforeEach } from 'vitest';
import { ipc } from '@/ipc/mock';
import type { AgentSummary, ToolSummary, ScopeSummary } from '@/ipc/types';

function makeAgent(id: string): AgentSummary {
  return { id, trait: 'Cognitive', scope_summary: 'read:*,write:*', trust_score: 0.85, last_activity_at: new Date().toISOString(), last_state: 'ready' };
}

function makeTool(id: string): ToolSummary {
  return { id, description: `Tool ${id}`, danger: false, granted_agent_count: 2, recent_invocation_count: 10, last_cost: 0.05 };
}

function makeScope(agentId: string): ScopeSummary {
  return { agent_id: agentId, effective_scope_summary: '3 tags', default_write_tags: ['write_default'], last_scope_change_at: new Date().toISOString() };
}

describe('mock IPC — subsystem entities (UI-IMPL-21a)', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    ipc.__seed({
      connection: { status: 'live', endpoint: 'mock://localhost', last_known_state_at: new Date().toISOString(), reason: null },
      role: 'operator',
      kernel_version: '0.6.9-alpha',
      contract_version: '0047',
      capabilities: ['audit', 'scope', 'memory_tag', 'hitl_resolve'],
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
    });
  });

  it('initialises with empty subsystem collections', async () => {
    const state = await ipc.getState();
    expect(state.agents).toEqual([]);
    expect(state.tools).toEqual([]);
    expect(state.scope).toEqual({});
  });

  it('seeds and retrieves subsystem entities via getState', async () => {
    const agents = [makeAgent('a1'), makeAgent('a2')];
    const tools = [makeTool('t1'), makeTool('t2'), makeTool('t3')];
    const scope: Record<string, ScopeSummary> = { a1: makeScope('a1') };

    ipc.__seedAgents(agents);
    ipc.__seedTools(tools);
    ipc.__seedScope(scope);

    const state = await ipc.getState();
    expect(state.agents).toHaveLength(2);
    expect(state.tools).toHaveLength(3);
    expect(state.scope.a1).toEqual(scope.a1);
  });

  it('listAgents returns seeded agents', async () => {
    const agents = [makeAgent('a1'), makeAgent('a2')];
    ipc.__seedAgents(agents);
    const result = await ipc.listAgents();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a1');
    expect(result[1].id).toBe('a2');
  });

  it('getAgent returns the correct agent by id', async () => {
    ipc.__seedAgents([makeAgent('a1'), makeAgent('a2')]);
    const detail = await ipc.getAgent('a1');
    expect(detail.id).toBe('a1');
    expect(detail.trait).toBe('Cognitive');
    expect(detail.manifest_version).toBe('1.0');
  });

  it('getScope returns seeded scope for an agent', async () => {
    const scope: Record<string, ScopeSummary> = { a1: makeScope('a1'), a2: makeScope('a2') };
    ipc.__seedScope(scope);
    const detail = await ipc.getScope('a1');
    expect(detail.agent_id).toBe('a1');
    expect(detail.default_write_tags).toEqual(['write_default']);
    expect(detail.k_anonymity_floor).toBe(3);
  });
});
