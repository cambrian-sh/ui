import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PipelineStep } from '@/ipc/types';
import { projectionStore } from '@/store/projection';
import { StepFlow } from './StepFlow';

function step(over: Partial<PipelineStep> = {}): PipelineStep {
  return {
    pipeline_id: 'ingress:usgs',
    revision: 1,
    run_id: 'run-1',
    item_key: 'quake-a',
    node: 'gate',
    kind: 'choice',
    port: 'true',
    outcome: 'routed',
    reason: '',
    duration_ms: 3,
    payload: '',
    payload_bytes: 0,
    dropped: 0,
    at_unix_ms: 1785287993258,
    ...over,
  };
}

function push(pipeline_steps: PipelineStep[] | undefined) {
  projectionStore.getState().hydrate({
    connection: { status: 'live' }, role: 'operator',
    kernel_version: '', contract_version: '', capabilities: [], contract_skew: 0,
    plugins: [], cursor: 1, plans: [], sessions: [], audit_tail: [],
    pending_hitl: [], agents: [], tools: [], skills: [], mcp_servers: [],
    scope: {}, watch_configs: [],
    lifecycle: {} as never, verifier_pool: {} as never, cost_dashboard: {} as never,
    pipeline_steps,
  } as never);
}

/**
 * The flow view (ADR-0114 D38). It answers what the counters cannot: which
 * branch THIS item took, and what it carried.
 */
describe('the step flow', () => {
  beforeEach(() => push([]));

  it('groups steps into a path per item, not a flat list', () => {
    push([
      step({ item_key: 'quake-a', node: 'trigger', kind: 'trigger', port: 'out' }),
      step({ item_key: 'quake-a', node: 'gate', port: 'true' }),
      step({ item_key: 'quake-b', node: 'gate', port: 'false', outcome: 'terminated',
             reason: 'under the reporting threshold' }),
    ]);
    render(<StepFlow pipelineID="ingress:usgs" />);
    expect(screen.getByText('quake-a')).toBeInTheDocument();
    expect(screen.getByText('quake-b')).toBeInTheDocument();
    // The path, not just the nodes: the port is the whole point.
    expect(screen.getByText('→ false')).toBeInTheDocument();
    expect(screen.getByText(/“under the reporting threshold”/)).toBeInTheDocument();
    expect(screen.getByText('2 steps')).toBeInTheDocument();
  });

  it('narrows to one node, which is the per-step log', () => {
    push([
      step({ item_key: 'a', node: 'trigger', kind: 'trigger' }),
      step({ item_key: 'a', node: 'save', kind: 'save_to_memory' }),
    ]);
    render(<StepFlow pipelineID="ingress:usgs" nodeID="save" />);
    expect(screen.getByText('save')).toBeInTheDocument();
    expect(screen.queryByText('trigger')).not.toBeInTheDocument();
  });

  it('says how many steps it is not showing, rather than hiding the gap', () => {
    push([step({ dropped: 340 })]);
    render(<StepFlow pipelineID="ingress:usgs" />);
    expect(screen.getByText(/340 steps are not shown/)).toBeInTheDocument();
    expect(screen.getByText(/a sample of the traffic, not all of it/)).toBeInTheDocument();
  });

  it('shows a payload only on request, and says when it is clipped', () => {
    push([step({ payload: '{"mag":5.1}', payload_bytes: 47000 })]);
    render(<StepFlow pipelineID="ingress:usgs" />);
    expect(screen.queryByText(/"mag":5.1/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/payload/));
    expect(screen.getByText(/"mag":5.1/)).toBeInTheDocument();
    // A clipped payload must never be mistakable for a whole one.
    expect(screen.getByText(/Showing 11 of 47000 bytes/)).toBeInTheDocument();
  });

  it('offers no payload control when tracing is off', () => {
    push([step({ payload: '' })]);
    render(<StepFlow pipelineID="ingress:usgs" />);
    expect(screen.queryByText(/· payload/)).not.toBeInTheDocument();
  });

  it('reads an empty trace as "not right now", never "never"', () => {
    push([]);
    render(<StepFlow pipelineID="ingress:usgs" />);
    expect(screen.getByText(/means "not right now", not\s*"never"/)).toBeInTheDocument();
  });

  it('distinguishes a kernel that cannot trace from one that is idle', () => {
    push(undefined);
    render(<StepFlow pipelineID="ingress:usgs" />);
    expect(
      screen.getByText(/does not publish a step trace/),
    ).toBeInTheDocument();
  });
});

/**
 * The discrepancy an operator reads as a bug.
 *
 * The counters accumulate from when the KERNEL started; the trace holds only
 * what has moved since this console connected. "3 seen" beside an empty trace
 * looks broken until something says why.
 */
describe('the empty trace beside a non-zero counter', () => {
  beforeEach(() => push([]));

  it('explains why the counter and the trace disagree', () => {
    render(<StepFlow pipelineID="ingress:usgs" nodeID="turn" seen={3} />);
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
    expect(screen.getByText(/accumulate from when the KERNEL started/)).toBeInTheDocument();
    expect(screen.getByText(/Send something through and it will appear here/)).toBeInTheDocument();
  });

  it('says nothing extra when the counter agrees that nothing ran', () => {
    render(<StepFlow pipelineID="ingress:usgs" nodeID="turn" seen={0} />);
    expect(screen.queryByText(/accumulate from when the KERNEL started/)).not.toBeInTheDocument();
  });

  it('says nothing extra when there is no counter to compare against', () => {
    render(<StepFlow pipelineID="ingress:usgs" nodeID="turn" />);
    expect(screen.queryByText(/accumulate from when the KERNEL started/)).not.toBeInTheDocument();
  });
});
