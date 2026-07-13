import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CostConsole } from '@/screens/cost/CostConsole';
import { projectionStore } from '@/store/projection';
import type { StateOfRecord } from '@/ipc/types';

function makeState(costDashboardOverrides: Partial<StateOfRecord['cost_dashboard']> = {}): StateOfRecord {
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
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: {
      spend_rate_usd: 0,
      circuit_breakers: [],
      max_energy_per_step: 0.5,
      price_ledger: [],
      recent_acquires: [],
      ...costDashboardOverrides,
    },
  };
}

describe('CostConsole', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
  });

  it('renders dashboard cards with default values', () => {
    projectionStore.getState().hydrate(makeState());
    render(<CostConsole />);
    
    expect(screen.getByText('Cost & Energy')).toBeInTheDocument();
    expect(screen.getByText('$0.00/hr')).toBeInTheDocument();
    expect(screen.getByText('$0.50')).toBeInTheDocument();
    expect(screen.getByText('No circuit breakers')).toBeInTheDocument();
    expect(screen.getByText('No price ledger entries')).toBeInTheDocument();
    expect(screen.getByText('No acquire outcomes')).toBeInTheDocument();
  });

  it('shows spend rate and max energy', () => {
    projectionStore.getState().hydrate(makeState({
      spend_rate_usd: 12.34,
      max_energy_per_step: 1.5,
    }));
    render(<CostConsole />);
    
    expect(screen.getByText('$12.34/hr')).toBeInTheDocument();
    expect(screen.getByText('$1.50')).toBeInTheDocument();
  });

  it('shows circuit breakers', () => {
    projectionStore.getState().hydrate(makeState({
      circuit_breakers: [
        { model_id: 'gpt-4', state: 'ok', reason: '' },
        { model_id: 'claude-3', state: 'warn', reason: 'High latency' },
      ],
    }));
    render(<CostConsole />);
    
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
    expect(screen.getByText('High latency')).toBeInTheDocument();
    expect(screen.queryByText('No circuit breakers')).not.toBeInTheDocument();
  });

  it('shows price ledger entries', () => {
    projectionStore.getState().hydrate(makeState({
      price_ledger: [
        { model_id: 'gpt-4', cost_per_token: 0.03, currency: 'USD' },
      ],
    }));
    render(<CostConsole />);
    
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('0.03 USD/tok')).toBeInTheDocument();
    expect(screen.queryByText('No price ledger entries')).not.toBeInTheDocument();
  });

  it('shows acquire outcomes', () => {
    projectionStore.getState().hydrate(makeState({
      recent_acquires: [
        { model_id: 'gpt-4', acquired: true, latency_ms: 150, timestamp: new Date().toISOString() },
      ],
    }));
    render(<CostConsole />);
    
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('150ms')).toBeInTheDocument();
    expect(screen.getByText('Just now')).toBeInTheDocument();
    expect(screen.queryByText('No acquire outcomes')).not.toBeInTheDocument();
  });

  it('shows link-out buttons', () => {
    projectionStore.getState().hydrate(makeState());
    render(<CostConsole />);
    
    const langfuseLink = screen.getByText('View in Langfuse ↗');
    expect(langfuseLink).toHaveAttribute('href', 'https://langfuse.com');
    expect(langfuseLink).toHaveAttribute('target', '_blank');
    
    const otelLink = screen.getByText('View in OTel ↗');
    expect(otelLink).toHaveAttribute('href', 'https://opentelemetry.io');
    expect(otelLink).toHaveAttribute('target', '_blank');
  });

  it('renders without crashing when dashboard numeric fields are undefined', () => {
    projectionStore.getState().hydrate(
      makeState({
        spend_rate_usd: undefined as unknown as number,
        max_energy_per_step: undefined as unknown as number,
      }),
    );

    render(<CostConsole />);

    expect(screen.getByText('Cost & Energy')).toBeInTheDocument();
    expect(screen.getByText('$0.00/hr')).toBeInTheDocument();
  });

  it('has no a11y violations', async () => {
    projectionStore.getState().hydrate(makeState({
      spend_rate_usd: 12.34,
      max_energy_per_step: 1.5,
      circuit_breakers: [
        { model_id: 'gpt-4', state: 'ok', reason: '' },
        { model_id: 'claude-3', state: 'warn', reason: 'High latency' },
      ],
      price_ledger: [
        { model_id: 'gpt-4', cost_per_token: 0.03, currency: 'USD' },
      ],
      recent_acquires: [
        { model_id: 'gpt-4', acquired: true, latency_ms: 150, timestamp: new Date().toISOString() },
      ],
    }));
    const { container } = render(<CostConsole />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
