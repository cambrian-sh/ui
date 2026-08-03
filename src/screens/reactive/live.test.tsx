import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { PipelineMeters, PipelineSummary } from '@/ipc/types';
import { projectionStore } from '@/store/projection';

const listWatchConfigs = vi.fn().mockResolvedValue([]);
const getWatchMetrics = vi.fn().mockResolvedValue([]);
const listPipelines = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listWatchConfigs: () => listWatchConfigs(),
    getWatchMetrics: () => getWatchMetrics(),
    listWatchDeadLetters: vi.fn(),
    listPipelines: () => listPipelines(),
  },
}));

import { PipelinesConsole } from './PipelinesConsole';

function pipeline(over: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    pipeline_id: 'ingress:usgs', revision: 1, name: 'USGS', state: 'armed',
    trigger_type: 'ingress', trigger_ref: 'usgs', node_count: 3, edge_count: 2,
    effect_node_count: 1, mapping_revision: 1, plan_checksum: '',
    semantics_checksum: '', generated: true, dry_run: false, approved: false,
    ...over,
  };
}

function meters(over: Partial<PipelineMeters> = {}): PipelineMeters {
  return {
    pipeline_id: 'ingress:usgs',
    revision: 1,
    nodes: [
      { node: 'trigger', entered: 52, in_flight: 0, failed: 0, passed_on: 52, ports: {}, mean_latency_ms: 1 },
      { node: 'save', entered: 47, in_flight: 6, failed: 2, passed_on: 39, ports: {}, mean_latency_ms: 820 },
    ],
    ...over,
  };
}

/** Push a feed state into the store the way the Shell does. */
function pushLive(pipeline_meters: Record<string, PipelineMeters> | undefined) {
  projectionStore.getState().hydrate({
    connection: { status: 'live' },
    role: 'operator',
    kernel_version: '', contract_version: '', capabilities: [], contract_skew: 0,
    plugins: [], cursor: 1, plans: [], sessions: [], audit_tail: [],
    pending_hitl: [], agents: [], tools: [], skills: [], mcp_servers: [],
    scope: {}, watch_configs: [],
    lifecycle: {} as never, verifier_pool: {} as never, cost_dashboard: {} as never,
    pipeline_meters,
  } as never);
}

/**
 * The live readings (ADR-0114 D37). The point of putting them on the feed is
 * that they are current and they exist for every pipeline — the per-watch RPC
 * was neither.
 */
describe('live pipeline counters', () => {
  beforeEach(() => {
    listPipelines.mockClear();
    listPipelines.mockResolvedValue([pipeline()]);
    pushLive(undefined);
  });

  it('prefers the pushed reading over the mount-time snapshot', async () => {
    pushLive({ 'ingress:usgs': meters() });
    render(<PipelinesConsole />);
    // 99 seen, 91 passed on, 6 in flight, 2 failed — summed across nodes.
    await waitFor(() => expect(screen.getByText(/99 · 91 ·/)).toBeInTheDocument());
    expect(screen.getByText('Seen · passed · in flight · failed')).toBeInTheDocument();
  });

  it('distinguishes "nothing has run" from "this kernel cannot tell"', async () => {
    // The op exists and nothing has run through this pipeline.
    pushLive({});
    const { unmount } = render(<PipelinesConsole />);
    await waitFor(() => expect(screen.getByText('nothing yet')).toBeInTheDocument());
    unmount();

    // A core predating the op says nothing at all — which is a different claim.
    pushLive(undefined);
    render(<PipelinesConsole />);
    await waitFor(() => expect(screen.getByText('not counted')).toBeInTheDocument());
  });

  it('updates when a new reading arrives, without a refetch', async () => {
    pushLive({ 'ingress:usgs': meters() });
    render(<PipelinesConsole />);
    await waitFor(() => expect(screen.getByText(/99 · 91 ·/)).toBeInTheDocument());

    // Absolute state: the new reading REPLACES the last rather than adding to it.
    pushLive({
      'ingress:usgs': meters({
        nodes: [
          { node: 'trigger', entered: 60, in_flight: 0, failed: 0, passed_on: 60, ports: {}, mean_latency_ms: 1 },
          { node: 'save', entered: 55, in_flight: 0, failed: 2, passed_on: 53, ports: {}, mean_latency_ms: 810 },
        ],
      }),
    });
    await waitFor(() => expect(screen.getByText(/115 · 113 ·/)).toBeInTheDocument());
    // The list was read once, at mount. Every number after that arrived pushed.
    expect(listPipelines).toHaveBeenCalledTimes(1);
  });
});
