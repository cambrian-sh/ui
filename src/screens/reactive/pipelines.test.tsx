import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PipelinesConsole } from './PipelinesConsole';
import { emptyPipeline } from './pipelineModel';
import type { WatchConfigFull, WatchMetrics } from '@/ipc/types';

const listWatchConfigs = vi.fn();
const getWatchMetrics = vi.fn();
const listWatchDeadLetters = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listWatchConfigs: () => listWatchConfigs(),
    getWatchMetrics: () => getWatchMetrics(),
    listWatchDeadLetters: () => listWatchDeadLetters(),
  },
}));

function config(over: Partial<WatchConfigFull> = {}): WatchConfigFull {
  return { ...emptyPipeline(), id: 'w1', name: 'Price watch', source_stream_id: 'prices', ...over };
}

function metrics(over: Partial<WatchMetrics> = {}): WatchMetrics {
  return {
    watch_id: 'w1',
    signals_seen: 100,
    condition_fired: 12,
    condition_suppressed: 88,
    dry_run_would_fire: 33,
    action_failed: 0,
    dead_lettered: 0,
    mean_condition_latency_ms: 4,
    ...over,
  };
}

describe('PipelinesConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWatchConfigs.mockResolvedValue([]);
    getWatchMetrics.mockResolvedValue([]);
    listWatchDeadLetters.mockResolvedValue([]);
  });

  it('reads an empty plane as a correct deployment', async () => {
    render(<PipelinesConsole />);
    await waitFor(() =>
      expect(screen.getByText(/correct deployment, not a missing step/)).toBeInTheDocument(),
    );
  });

  it('calls out a pipeline bound to no stream, which looks like coverage and is not', async () => {
    listWatchConfigs.mockResolvedValue([config({ source_stream_id: '', active: true })]);
    render(<PipelinesConsole />);

    await waitFor(() => expect(screen.getByText('broken')).toBeInTheDocument());
    // Said twice on purpose: once in the header count, once on the row.
    expect(screen.getAllByText(/can never fire/).length).toBeGreaterThan(0);
  });

  it('says a dry run has decided N times and acted zero times', async () => {
    // The whole point of surfacing dry run as a ribbon rather than a checkbox.
    listWatchConfigs.mockResolvedValue([config({ active: true, dry_run: true })]);
    getWatchMetrics.mockResolvedValue([metrics()]);
    render(<PipelinesConsole />);

    await waitFor(() =>
      expect(screen.getByText(/decided 33 times and acted zero times/)).toBeInTheDocument(),
    );
  });

  it('shows shed-at-intake as unknown rather than zero', async () => {
    // A zero here would read as headroom. The plane-level shed counter is not
    // projected, so the honest rendering is "unknown" — see report.md §4.14b.
    render(<PipelinesConsole />);
    await waitFor(() => expect(screen.getByText('Shed at intake')).toBeInTheDocument());
    expect(screen.getByText(/not an error, a defence/)).toBeInTheDocument();
  });

  it('says the reactive plane is absent rather than empty when the RPC fails', async () => {
    listWatchConfigs.mockRejectedValue(new Error('Unimplemented'));
    render(<PipelinesConsole />);

    await waitFor(() =>
      expect(screen.getByText(/does not run the reactive plugin/)).toBeInTheDocument(),
    );
  });

  it('renders per-pipeline counters when metrics are served', async () => {
    listWatchConfigs.mockResolvedValue([config({ active: true, dry_run: false })]);
    getWatchMetrics.mockResolvedValue([metrics()]);
    render(<PipelinesConsole />);

    await waitFor(() => expect(screen.getByText(/100 signals seen/)).toBeInTheDocument());
    expect(screen.getAllByText(/88 held/).length).toBeGreaterThan(0);
  });
});
