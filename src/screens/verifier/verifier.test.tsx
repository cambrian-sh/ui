import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { VerifierPoolConsole } from '@/screens/verifier/VerifierPoolConsole';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord, VerifierPoolState } from '@/ipc/types';

function makeState(verifierPool: Partial<VerifierPoolState> = {}): StateOfRecord {
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
    capabilities: [],
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
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: {
      pool_agents: [],
      recent_rounds: [],
      surveillance_triggers: [],
      ...verifierPool,
    },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  };
}

describe('VerifierPoolConsole', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
  });

  it('renders empty states when there is no data', () => {
    projectionStore.getState().hydrate(makeState());
    render(<VerifierPoolConsole />);
    
    expect(screen.getByText('No agents in pool')).toBeInTheDocument();
    expect(screen.getByText('No recent rounds')).toBeInTheDocument();
    expect(screen.getByText('No surveillance triggers')).toBeInTheDocument();
    const poolSizeCard = screen.getAllByText('Pool Size')[0].closest('.rounded-md');
    expect(within(poolSizeCard as HTMLElement).getByText('0')).toBeInTheDocument();
    
    const recentRoundsCard = screen.getAllByText('Recent Rounds')[0].closest('.rounded-md');
    expect(within(recentRoundsCard as HTMLElement).getByText('0')).toBeInTheDocument();
    
    const triggersCard = screen.getAllByText('Surveillance Triggers')[0].closest('.rounded-md');
    expect(within(triggersCard as HTMLElement).getByText('0')).toBeInTheDocument();
  });

  it('renders pool agents with merit scores', () => {
    projectionStore.getState().hydrate(makeState({
      pool_agents: [
        { agent_id: 'agent-alpha', merit_score: 0.95 },
        { agent_id: 'agent-beta', merit_score: 0.82 },
      ]
    }));
    
    render(<VerifierPoolConsole />);
    
    expect(screen.getByText('agent-alpha')).toBeInTheDocument();
    expect(screen.getByText('95.0%')).toBeInTheDocument();
    
    expect(screen.getByText('agent-beta')).toBeInTheDocument();
    expect(screen.getByText('82.0%')).toBeInTheDocument();
    const poolSizeCard = screen.getAllByText('Pool Size')[0].closest('.rounded-md');
    expect(within(poolSizeCard as HTMLElement).getByText('2')).toBeInTheDocument();
  });

  it('renders recent rounds with cross-verification status', () => {
    projectionStore.getState().hydrate(makeState({
      recent_rounds: [
        { 
          task_id: 'task-123', 
          verifier_id: 'agent-alpha', 
          target_agent: 'agent-gamma', 
          quality_score: 0.88, 
          cross_verification_status: 'passed' 
        },
        { 
          task_id: 'task-456', 
          verifier_id: 'agent-beta', 
          target_agent: 'agent-delta', 
          quality_score: 0.45, 
          cross_verification_status: 'failed' 
        },
      ]
    }));
    
    render(<VerifierPoolConsole />);
    
    expect(screen.getByText('task-123')).toBeInTheDocument();
    expect(screen.getByText('agent-alpha')).toBeInTheDocument();
    expect(screen.getByText('agent-gamma')).toBeInTheDocument();
    expect(screen.getByText('88.0%')).toBeInTheDocument();
    expect(screen.getByText('passed')).toBeInTheDocument();
    
    expect(screen.getByText('task-456')).toBeInTheDocument();
    expect(screen.getByText('agent-beta')).toBeInTheDocument();
    expect(screen.getByText('agent-delta')).toBeInTheDocument();
    expect(screen.getByText('45.0%')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    const recentRoundsCard = screen.getAllByText('Recent Rounds')[0].closest('.rounded-md');
    expect(within(recentRoundsCard as HTMLElement).getByText('2')).toBeInTheDocument();
  });

  it('renders surveillance triggers with relative time', () => {
    const now = Date.now();
    const fiveMinsAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    
    projectionStore.getState().hydrate(makeState({
      surveillance_triggers: [
        { agent_id: 'agent-epsilon', reason: 'Trust score below threshold', fired_at: fiveMinsAgo },
        { agent_id: 'agent-zeta', reason: 'Failed cross-verification', fired_at: twoDaysAgo },
      ]
    }));
    
    render(<VerifierPoolConsole />);
    
    expect(screen.getByText('agent-epsilon')).toBeInTheDocument();
    expect(screen.getByText('Trust score below threshold')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();
    
    expect(screen.getByText('agent-zeta')).toBeInTheDocument();
    expect(screen.getByText('Failed cross-verification')).toBeInTheDocument();
    expect(screen.getByText('2d ago')).toBeInTheDocument();
    const triggersCard = screen.getAllByText('Surveillance Triggers')[0].closest('.rounded-md');
    expect(within(triggersCard as HTMLElement).getByText('2')).toBeInTheDocument();
  });
});
