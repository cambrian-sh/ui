import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PipelineStep } from '@/ipc/types';
import { projectionStore } from '@/store/projection';
import { ItemHistory } from './ItemHistory';

function step(over: Partial<PipelineStep> = {}): PipelineStep {
  return {
    pipeline_id: 'ingress:usgs', revision: 1, run_id: 'r1',
    item_key: 'quake-a', node: 'gate', kind: 'choice', port: 'true',
    outcome: 'routed', reason: '', duration_ms: 3,
    payload: '', payload_bytes: 0, dropped: 0, at_unix_ms: 1785287993258,
    ...over,
  };
}

function push(pipeline_steps: PipelineStep[]) {
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
 * One item's journey. The flow view answers "what is moving"; this answers
 * "what happened to THIS one" — the question asked when a specific delivery
 * went wrong.
 */
describe('the item log', () => {
  beforeEach(() => push([]));

  it('reads forwards, because a single item is a story', () => {
    push([
      step({ node: 'trigger', kind: 'trigger', port: 'out', at_unix_ms: 1000 }),
      step({ node: 'gate', port: 'true', at_unix_ms: 2000 }),
      step({ node: 'save', kind: 'save_to_memory', port: '', outcome: 'routed', at_unix_ms: 3000 }),
    ]);
    // With onSelectNode the node names are buttons, which distinguishes them
    // from the `kind` label beside them — a trigger node's kind is also
    // "trigger", so a text match alone reads it twice.
    render(
      <ItemHistory
        pipelineID="ingress:usgs" itemKey="quake-a"
        onClear={() => {}} onSelectNode={() => {}}
      />,
    );
    const nodes = screen
      .getAllByTitle('Show this node on the canvas')
      .map((e) => e.textContent);
    // Oldest first: reading a path backwards is how you mistake the last step
    // for the cause.
    expect(nodes).toEqual(['trigger', 'gate', 'save']);
    expect(screen.getByText(/3 steps/)).toBeInTheDocument();
  });

  it('says an item is still travelling rather than leaving it ambiguous', () => {
    push([step({ node: 'gate', outcome: 'routed' })]);
    render(
      <ItemHistory pipelineID="ingress:usgs" itemKey="quake-a" onClear={() => {}} />,
    );
    expect(screen.getByText(/last seen leaving gate/)).toBeInTheDocument();
    expect(screen.getByText(/still travelling when/)).toBeInTheDocument();
  });

  it('says where a settled item stopped, and why', () => {
    push([
      step({ node: 'gate', port: 'false', outcome: 'terminated',
             reason: 'under the reporting threshold' }),
    ]);
    render(
      <ItemHistory pipelineID="ingress:usgs" itemKey="quake-a" onClear={() => {}} />,
    );
    expect(screen.getByText(/stopped at gate/)).toBeInTheDocument();
    expect(screen.getByText(/“under the reporting threshold”/)).toBeInTheDocument();
    expect(screen.queryByText(/still travelling/)).not.toBeInTheDocument();
  });

  it('shows a failure as a failure, not as a discard', () => {
    push([step({ node: 'save', outcome: 'failed', port: '', reason: 'connection refused' })]);
    render(
      <ItemHistory pipelineID="ingress:usgs" itemKey="quake-a" onClear={() => {}} />,
    );
    expect(screen.getByText(/failed at save/)).toBeInTheDocument();
    // A failure reason is not the operator's chosen wording, so it is not quoted.
    expect(screen.getByText('connection refused')).toBeInTheDocument();
  });

  it('opens what an item carried, and flags a clipped payload', () => {
    push([step({ payload: '{"mag":5.1}', payload_bytes: 47000 })]);
    render(
      <ItemHistory pipelineID="ingress:usgs" itemKey="quake-a" onClear={() => {}} />,
    );
    expect(screen.queryByText(/"mag":5.1/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('what it carried'));
    expect(screen.getByText(/"mag":5.1/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 11 of 47000 bytes/)).toBeInTheDocument();
  });

  it('jumps to the node a step happened at, without losing the item', () => {
    const onSelectNode = vi.fn();
    push([step({ node: 'gate' })]);
    render(
      <ItemHistory
        pipelineID="ingress:usgs" itemKey="quake-a"
        onClear={() => {}} onSelectNode={onSelectNode}
      />,
    );
    fireEvent.click(screen.getByTitle('Show this node on the canvas'));
    expect(onSelectNode).toHaveBeenCalledWith('gate');
  });

  it('says an aged-out item aged out, rather than implying it vanished', () => {
    push([step({ item_key: 'someone-else' })]);
    render(
      <ItemHistory pipelineID="ingress:usgs" itemKey="quake-a" onClear={() => {}} />,
    );
    expect(screen.getByText(/it did not vanish, it aged out/)).toBeInTheDocument();
  });

  it('shows only this item, not the whole pipeline', () => {
    push([
      step({ item_key: 'quake-a', node: 'gate' }),
      step({ item_key: 'quake-b', node: 'save' }),
    ]);
    render(
      <ItemHistory pipelineID="ingress:usgs" itemKey="quake-a" onClear={() => {}} />,
    );
    expect(screen.getByText('gate')).toBeInTheDocument();
    expect(screen.queryByText('save')).not.toBeInTheDocument();
  });
});
