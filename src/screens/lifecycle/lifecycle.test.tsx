import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { LifecycleConsole } from '@/screens/lifecycle/LifecycleConsole';
import { projectionStore } from '@/store/projection';
import { ipc } from '@/ipc';
import type { StateOfRecord } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    triggerConsolidation: vi.fn().mockResolvedValue({ deduped: false }),
  },
}));

function makeState(overrides: Partial<StateOfRecord> = {}): StateOfRecord {
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
    lifecycle: { 
      scheduler_state: 'idle', 
      pending_jobs: 0, 
      last_consolidation: null, 
      dormancy_events: [] 
    },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
    ...overrides,
  };
}

describe('LifecycleConsole', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    vi.clearAllMocks();
  });

  it('renders loading state when projection is empty', () => {
    render(<LifecycleConsole />);
    expect(screen.getByText('Loading lifecycle state...')).toBeInTheDocument();
  });

  it('renders dashboard cards with correct values', () => {
    projectionStore.getState().hydrate(makeState({
      lifecycle: {
        scheduler_state: 'consolidating',
        pending_jobs: 42,
        last_consolidation: {
          timestamp: new Date().toISOString(),
          duration_ms: 1500,
          status: 'completed'
        },
        dormancy_events: []
      }
    }));

    render(<LifecycleConsole />);

    expect(screen.getByTestId('scheduler-state')).toHaveTextContent('consolidating');
    expect(screen.getByTestId('pending-jobs')).toHaveTextContent('42');
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('renders dormancy events list', () => {
    projectionStore.getState().hydrate(makeState({
      lifecycle: {
        scheduler_state: 'idle',
        pending_jobs: 0,
        last_consolidation: null,
        dormancy_events: [
          { agent_id: 'agent-1', event_type: 'dormant', timestamp: new Date().toISOString() },
          { agent_id: 'agent-2', event_type: 'reactivated', timestamp: new Date().toISOString() }
        ]
      }
    }));

    render(<LifecycleConsole />);

    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('dormant')).toBeInTheDocument();
    expect(screen.getByText('agent-2')).toBeInTheDocument();
    expect(screen.getByText('reactivated')).toBeInTheDocument();
  });

  it('disables trigger button for non-operators', () => {
    projectionStore.getState().hydrate(makeState({
      role: 'viewer',
      lifecycle: {
        scheduler_state: 'idle',
        pending_jobs: 0,
        last_consolidation: null,
        dormancy_events: []
      }
    }));

    render(<LifecycleConsole />);

    const button = screen.getByRole('button', { name: 'Trigger Consolidation' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Operator role required')).toBeInTheDocument();
  });

  it('calls ipc.triggerConsolidation when trigger button is clicked by operator', async () => {
    projectionStore.getState().hydrate(makeState({
      role: 'operator',
      lifecycle: {
        scheduler_state: 'idle',
        pending_jobs: 0,
        last_consolidation: null,
        dormancy_events: []
      }
    }));

    render(<LifecycleConsole />);

    const button = screen.getByRole('button', { name: 'Trigger Consolidation' });
    expect(button).not.toBeDisabled();
    
    fireEvent.click(button);
    
    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Manual trigger from UI' } });
    
    const confirmButton = screen.getByRole('button', { name: 'Consolidate' });
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(ipc.triggerConsolidation).toHaveBeenCalledWith({
        command_id: expect.any(String),
        reason: 'Manual trigger from UI'
      });
    });
  });

  it('shows ErrorState when consolidation fails', async () => {
    vi.mocked(ipc.triggerConsolidation).mockRejectedValueOnce(new Error('PermissionDenied'));
    
    projectionStore.getState().hydrate(makeState({
      role: 'operator',
      lifecycle: {
        scheduler_state: 'idle',
        pending_jobs: 0,
        last_consolidation: null,
        dormancy_events: []
      }
    }));

    render(<LifecycleConsole />);

    const button = screen.getByRole('button', { name: 'Trigger Consolidation' });
    fireEvent.click(button);
    
    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Manual trigger from UI' } });
    
    const confirmButton = screen.getByRole('button', { name: 'Consolidate' });
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(screen.getByText('PermissionDenied')).toBeInTheDocument();
    });
  });

  it('closes the dialog after a successful consolidation', async () => {
    projectionStore.getState().hydrate(makeState({
      role: 'operator',
      lifecycle: {
        scheduler_state: 'idle',
        pending_jobs: 0,
        last_consolidation: null,
        dormancy_events: [],
      },
    }));

    render(<LifecycleConsole />);

    const button = screen.getByRole('button', { name: 'Trigger Consolidation' });
    fireEvent.click(button);

    const reasonInput = screen.getByLabelText(/Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Manual trigger from UI' } });

    const confirmButton = screen.getByRole('button', { name: 'Consolidate' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Reason/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the dashboard with minimal lifecycle state without crashing', () => {
    projectionStore.getState().hydrate(makeState({
      role: 'operator',
      lifecycle: {
        scheduler_state: 'idle',
        pending_jobs: 0,
        last_consolidation: null,
        dormancy_events: [],
      },
    }));

    render(<LifecycleConsole />);

    expect(screen.getByRole('button', { name: 'Trigger Consolidation' })).toBeInTheDocument();
    expect(screen.getByTestId('scheduler-state')).toHaveTextContent('idle');
  });

  it('has no a11y violations', async () => {
    projectionStore.getState().hydrate(makeState({
      role: 'operator',
      lifecycle: {
        scheduler_state: 'consolidating',
        pending_jobs: 42,
        last_consolidation: {
          timestamp: new Date().toISOString(),
          duration_ms: 1500,
          status: 'completed',
        },
        dormancy_events: [
          { agent_id: 'agent-1', event_type: 'dormant', timestamp: new Date().toISOString() },
          { agent_id: 'agent-2', event_type: 'reactivated', timestamp: new Date().toISOString() },
        ],
      },
    }));
    const { container } = render(<LifecycleConsole />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
