import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatSurface } from '@/screens/chat/ChatSurface';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord } from '@/ipc/types';

function makeState(role: 'operator' | 'viewer'): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role,
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    capabilities: [],
    contract_skew: 0,
    cursor: 0,
    plans: [
      {
        plan_id: 'plan-1',
        session_id: 'session-1',
        subject: 'Test plan',
        step_count: 1,
        active_agent: null,
        status: 'running',
        elapsed_ms: 0,
        cost: 0,
        started_at: new Date().toISOString(),
      },
    ],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    skills: [],
    mcp_servers: [],
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('ChatSurface', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
  });

  it('enables inputs for Operator role', () => {
    projectionStore.getState().hydrate(makeState('operator'));
    render(<ChatSurface sessionId="session-1" />);

    const chatInput = screen.getByPlaceholderText('Send a message…');
    expect(chatInput).not.toBeDisabled();
    expect(chatInput).not.toHaveAttribute('title');

    const injectInput = screen.getByPlaceholderText('Send a correction into the running plan. The plan may re-plan.');
    expect(injectInput).not.toBeDisabled();
    expect(injectInput).not.toHaveAttribute('title');
  });

  it('disables inputs for Viewer role', () => {
    projectionStore.getState().hydrate(makeState('viewer'));
    render(<ChatSurface sessionId="session-1" />);

    const chatInput = screen.getByPlaceholderText('Send a message…');
    expect(chatInput).toBeDisabled();
    expect(chatInput).toHaveAttribute('title', 'Operator role required to send messages.');

    const injectInput = screen.getByPlaceholderText('Send a correction into the running plan. The plan may re-plan.');
    expect(injectInput).toBeDisabled();
    expect(injectInput).toHaveAttribute('title', 'Operator role required to send messages.');
  });
});
