import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PipelinesConsole } from './PipelinesConsole';
import { DryRunPane } from './DryRunPane';
import { emptyPipeline } from './pipelineModel';
import type { PipelineSummary, WatchConfigFull, WatchMetrics } from '@/ipc/types';

const listWatchConfigs = vi.fn();
const getWatchMetrics = vi.fn();
const listWatchDeadLetters = vi.fn();
const listPipelines = vi.fn();
const dryRunPipeline = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listWatchConfigs: () => listWatchConfigs(),
    getWatchMetrics: () => getWatchMetrics(),
    listWatchDeadLetters: () => listWatchDeadLetters(),
    listPipelines: () => listPipelines(),
    dryRunPipeline: (...a: unknown[]) => dryRunPipeline(...a),
  },
}));

function pipeline(over: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    pipeline_id: 'ingress:usgs-quakes',
    revision: 1,
    name: 'USGS Earthquakes',
    state: 'armed',
    trigger_type: 'ingress',
    trigger_ref: 'usgs-quakes',
    node_count: 2,
    edge_count: 1,
    effect_node_count: 1,
    mapping_revision: 1,
    plan_checksum: 'abc',
    semantics_checksum: 'def',
    generated: true,
    dry_run: false,
    approved: true,
    ...over,
  };
}

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
    listPipelines.mockResolvedValue([]);
  });

  it('reads an empty plane as a correct deployment', async () => {
    render(<PipelinesConsole />);
    await waitFor(() =>
      expect(screen.getByText(/correct deployment, not a missing step/)).toBeInTheDocument(),
    );
  });

  it('calls out a pipeline bound to no stream, which looks like coverage and is not', async () => {
    // The list reads PIPELINES now — one list, whatever authored it.
    listPipelines.mockResolvedValue([pipeline({ trigger_type: 'stream', trigger_ref: '' })]);
    render(<PipelinesConsole />);

    await waitFor(() => expect(screen.getByText('broken')).toBeInTheDocument());
    // Said twice on purpose: once in the header count, once on the row.
    expect(screen.getAllByText(/can never fire/).length).toBeGreaterThan(0);
  });

  it('says a dry run has decided N times and acted zero times', async () => {
    // The whole point of surfacing dry run as a ribbon rather than a checkbox.
    listPipelines.mockResolvedValue([pipeline({ dry_run: true })]);
    getWatchMetrics.mockResolvedValue([metrics({ watch_id: 'ingress:usgs-quakes' })]);
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
    listPipelines.mockRejectedValue(new Error('Unimplemented'));
    render(<PipelinesConsole />);

    await waitFor(() =>
      expect(screen.getByText(/does not run the reactive plugin/)).toBeInTheDocument(),
    );
  });

  it('renders per-pipeline counters when metrics are served', async () => {
    listPipelines.mockResolvedValue([pipeline({ dry_run: false })]);
    getWatchMetrics.mockResolvedValue([metrics({ watch_id: 'ingress:usgs-quakes' })]);
    render(<PipelinesConsole />);

    // seen · passed · held · dead — the design's column, not prose.
    // The column header carries the labels, so the cell is the numbers.
    await waitFor(() =>
      expect(screen.getByText(/100 · 12 · 88 ·/)).toBeInTheDocument(),
    );
    expect(screen.getByText('Seen · passed · in flight · failed')).toBeInTheDocument();
    expect(screen.getAllByText(/12 passed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/88 held/).length).toBeGreaterThan(0);
  });
});

// One list. A watch is one shape a pipeline can be written in, not a second kind
// of thing shown beside it — showing both was the duplication this replaces.
describe('the reactive plane is one list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWatchConfigs.mockResolvedValue([]);
    getWatchMetrics.mockResolvedValue([]);
    listWatchDeadLetters.mockResolvedValue([]);
    listPipelines.mockResolvedValue([]);
  });

  it('renders every pipeline in a single list', async () => {
    listPipelines.mockResolvedValue([
      pipeline({ pipeline_id: 'ingress:usgs', name: 'USGS', trigger_ref: 'usgs' }),
      pipeline({
        pipeline_id: 'telegram_ingress_agent',
        name: 'Telegram',
        trigger_ref: 'telegram_ingress_agent',
        effect_node_count: 1,
      }),
    ]);
    render(<PipelinesConsole />);

    expect(await screen.findByText('USGS')).toBeInTheDocument();
    expect(screen.getByText('Telegram')).toBeInTheDocument();
    // No second section — the ingress rows ARE the list.
    expect(screen.queryByText('Ingress pipelines')).not.toBeInTheDocument();
  });

  it('does not read the watch list to build the list', async () => {
    listWatchConfigs.mockResolvedValue([config({ id: 'ghost', name: 'Should not appear' })]);
    listPipelines.mockResolvedValue([]);
    render(<PipelinesConsole />);

    await waitFor(() =>
      expect(screen.getByText(/correct deployment, not a missing step/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });
});

// Turn 15d — the engine list.
//
// These assert the rules the handoff calls non-negotiable, so a later
// "decluttering" pass has to argue with a test rather than a preference.
describe('15d — the engine list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWatchConfigs.mockResolvedValue([]);
    getWatchMetrics.mockResolvedValue([]);
    listWatchDeadLetters.mockResolvedValue([]);
    listPipelines.mockResolvedValue([]);
  });

  // 6.1 — node count says how complicated a pipeline is; effect count says how
  // much it can do to you. It belongs beside the state, on the row.
  it('shows how many nodes can touch the world, on the row', async () => {
    listPipelines.mockResolvedValue([pipeline({ effect_node_count: 3 })]);
    render(<PipelinesConsole />);
    // The cell says '3 effects'; the COLUMN header says what that means.
    expect(await screen.findByText('3 effects')).toBeInTheDocument();
    expect(screen.getByText('Can touch world')).toBeInTheDocument();
  });

  // 2.2 — a zero is content. "This pipeline changes nothing" is a fact worth
  // seeing, not an absence to infer.
  it('says zero rather than hiding the reach when nothing can touch the world', async () => {
    listPipelines.mockResolvedValue([pipeline({ effect_node_count: 0 })]);
    render(<PipelinesConsole />);
    expect(await screen.findByText('0 effects')).toBeInTheDocument();
  });

  // 6.2 — broken is worse than paused because it is invisible as a gap.
  it('separates broken from paused, and says what broken means', async () => {
    listPipelines.mockResolvedValue([
      pipeline({ trigger_type: 'stream', trigger_ref: '' }),
    ]);
    render(<PipelinesConsole />);
    expect(await screen.findByText('broken')).toBeInTheDocument();
    expect(screen.getAllByText(/can never fire/).length).toBeGreaterThan(0);
    expect(screen.getByText('looks like coverage, provides none')).toBeInTheDocument();
  });

  // 6.2 — daemon lifetime is ref-counted; taught on the row rather than hidden.
  it('tells the operator that pausing released the daemon', async () => {
    listPipelines.mockResolvedValue([pipeline({ state: 'retired' })]);
    render(<PipelinesConsole />);
    expect(await screen.findByText(/keeping it paused costs nothing/)).toBeInTheDocument();
  });

  // Published is NOT paused: one was stopped, the other never ran. Collapsing
  // them is the same error as calling a broken pipeline paused.
  it('keeps published out of paused, and says it is inspectable not live', async () => {
    listPipelines.mockResolvedValue([pipeline({ state: 'published' })]);
    render(<PipelinesConsole />);
    expect(await screen.findByText(/inspectable, not live/)).toBeInTheDocument();
    expect(screen.queryByText(/keeping it paused costs nothing/)).not.toBeInTheDocument();
  });

  // 6.3 — the ribbon sits under the row it belongs to, never in settings.
  it('states the dry-run count as decided-versus-acted', async () => {
    listPipelines.mockResolvedValue([pipeline({ dry_run: true, revision: 8 })]);
    getWatchMetrics.mockResolvedValue([
      metrics({ watch_id: 'ingress:usgs-quakes', dry_run_would_fire: 33 }),
    ]);
    render(<PipelinesConsole />);
    expect(
      await screen.findByText(/it has decided 33 times and acted zero times/),
    ).toBeInTheDocument();
  });

  // 6 — one engine, one vocabulary.
  it('says the plane is one engine in the subtitle', async () => {
    render(<PipelinesConsole />);
    expect(await screen.findByText(/One engine, one vocabulary/)).toBeInTheDocument();
  });

  // 6 — a storm is the failure mode of the plane, not of one pipeline. Shedding
  // is a defence, and the copy has to say so or a non-zero reads as a fault.
  it('describes shedding as a defence rather than an error', async () => {
    render(<PipelinesConsole />);
    expect(await screen.findByText('Shed at intake')).toBeInTheDocument();
    expect(screen.getByText(/not an error, a defence/)).toBeInTheDocument();
  });
});

/**
 * 15c — the dry run.
 *
 * The properties pinned here are the ones the screen exists for: it leads with
 * the collision rather than the totals, a refusal replaces the report instead of
 * showing four zeros beside it, and declared is never merged with carried out.
 */
describe('15c — the dry run', () => {
  function report(over: Record<string, unknown> = {}) {
    return {
      refused: '',
      run_id: 'dryrun:ingress:usgs-quakes@1',
      samples: 52,
      effects: [
        {
          node: 'save',
          kind: 'save_to_memory',
          effect_key: 'proj:usgs:ridgecrest-2026-08-01',
          item_key: 'a1',
          summary: 'save_to_memory · place, mag',
        },
        {
          node: 'save',
          kind: 'save_to_memory',
          effect_key: 'proj:usgs:ridgecrest-2026-08-01',
          item_key: 'a2',
          summary: 'save_to_memory · place, mag',
        },
      ],
      duplicates: [
        {
          effect_key: 'proj:usgs:ridgecrest-2026-08-01',
          count: 3,
          nodes: ['save'],
        },
      ],
      terminations: [
        { node: 'gate', port: 'false', reason: 'under the reporting threshold', count: 3 },
      ],
      failures: [],
      elapsed_ms: 120,
      ...over,
    };
  }

  beforeEach(() => {
    dryRunPipeline.mockReset();
  });

  it('leads with the collision and says what it would cost', async () => {
    dryRunPipeline.mockResolvedValue(report());
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/One key is used by more than one write/)).toBeInTheDocument(),
    );
    // 3 writes on one key means 2 records replaced.
    expect(screen.getByText(/2 records would be silently replaced/)).toBeInTheDocument();
    expect(
      screen.getByText(/no evidence there were ever two/),
    ).toBeInTheDocument();
    // Both resolutions, because either can be the right one.
    expect(screen.getByText(/Add something that separates them/)).toBeInTheDocument();
    expect(screen.getByText(/Keep last-write-wins/)).toBeInTheDocument();
  });

  it('states the guarantee before anything it qualifies', async () => {
    dryRunPipeline.mockResolvedValue(report());
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    expect(screen.getByText('nothing reached the world')).toBeInTheDocument();
    // And says what WAS real, so a reader does not discount the finding.
    expect(
      screen.getByText(/every gate, branch, aggregate and key derivation below was real/i),
    ).toBeInTheDocument();
  });

  it('names each discard in the operator’s own words', async () => {
    dryRunPipeline.mockResolvedValue(report());
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/“under the reporting threshold”/)).toBeInTheDocument(),
    );
  });

  it('keeps declared and carried out in separate columns', async () => {
    dryRunPipeline.mockResolvedValue(report());
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('The effect ledger')).toBeInTheDocument());
    expect(screen.getByText('2 declared')).toBeInTheDocument();
    expect(screen.getByText(/0 carried out/)).toBeInTheDocument();
  });

  it('replaces the report with the refusal instead of showing four zeros', async () => {
    dryRunPipeline.mockResolvedValue(
      report({ refused: 'usgs-quakes has captured nothing yet', samples: 0, effects: [], duplicates: [], terminations: [] }),
    );
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/There is nothing to dry-run yet/)).toBeInTheDocument(),
    );
    // Four zeros would read as "this pipeline would do nothing" — the opposite.
    expect(screen.queryByText('Would save')).not.toBeInTheDocument();
    expect(screen.queryByText('The effect ledger')).not.toBeInTheDocument();
  });

  it('says a clean run is clean rather than leaving it to be inferred', async () => {
    dryRunPipeline.mockResolvedValue(report({ duplicates: [] }));
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('No key collisions')).toBeInTheDocument());
  });

  it('distinguishes backtest as a different question', async () => {
    dryRunPipeline.mockResolvedValue(report());
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    expect(screen.getByText(/replays journaled history to argue for a change/)).toBeInTheDocument();
    expect(screen.getByText(/Neither ever executes an arm/)).toBeInTheDocument();
  });

  it('explains why there is no unrouted count instead of showing a permanent zero', async () => {
    dryRunPipeline.mockResolvedValue(report());
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/refuses a graph with an unwired port/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Unrouted')).not.toBeInTheDocument();
  });
});

/**
 * 15c additions: the run's own cost, and a denominator for the collisions.
 */
describe('15c — reading the run', () => {
  beforeEach(() => {
    dryRunPipeline.mockReset();
  });

  it('says what the run cost, so replaying more is a decision with a number', async () => {
    dryRunPipeline.mockResolvedValue({
      refused: '', run_id: 'r', samples: 52, elapsed_ms: 4130,
      effects: [], duplicates: [], terminations: [], failures: [],
    });
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/52 items · r1 · 4\.1 s/)).toBeInTheDocument(),
    );
  });

  it('gives the collisions a denominator', async () => {
    dryRunPipeline.mockResolvedValue({
      refused: '', run_id: 'r', samples: 52, elapsed_ms: 900,
      effects: Array.from({ length: 47 }, (_, i) => ({
        node: 'save', kind: 'save_to_memory',
        effect_key: i < 3 ? 'proj:shared' : `proj:${i}`,
        item_key: `i${i}`, summary: '',
      })),
      duplicates: [{ effect_key: 'proj:shared', count: 3, nodes: ['save'] }],
      terminations: [], failures: [],
    });
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    // Three collided; the other forty-four each wrote once. Without that line
    // "3 collisions" reads the same whether the run made four keys or four hundred.
    await waitFor(() => expect(screen.getByText('3 writes')).toBeInTheDocument());
    expect(screen.getByText('44 other keys')).toBeInTheDocument();
    expect(screen.getByText('1 write each')).toBeInTheDocument();
  });

  it('says the ledger records decisions, not attempts', async () => {
    dryRunPipeline.mockResolvedValue({
      refused: '', run_id: 'r', samples: 1, elapsed_ms: 10,
      effects: [], duplicates: [], terminations: [], failures: [],
    });
    render(<DryRunPane pipeline={pipeline()} onClose={() => {}} />);
    await waitFor(() =>
      expect(
        screen.getByText('what it decided, not which attempt carried it'),
      ).toBeInTheDocument(),
    );
  });
});

/**
 * "Armed" over a stopped daemon.
 *
 * The graph is armed either way, so the pipeline store alone cannot tell these
 * apart. It is the most confusing shape of "looks like coverage, provides none",
 * because the coverage was real yesterday.
 */
describe('the entry organ', () => {
  it('says so when a pipeline is armed but nothing is feeding it', async () => {
    listPipelines.mockResolvedValue([
      pipeline({ trigger_ref: 'telegram_bot_a', entry_live: false }),
    ]);
    render(<PipelinesConsole />);
    await waitFor(() =>
      expect(screen.getByText(/Armed, but nothing is feeding it/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/the entry organ is switched off/)).toBeInTheDocument();
  });

  it('says nothing when the daemon is running', async () => {
    listPipelines.mockResolvedValue([pipeline({ entry_live: true })]);
    render(<PipelinesConsole />);
    await waitFor(() => expect(screen.getByText('armed')).toBeInTheDocument());
    expect(screen.queryByText(/nothing is feeding it/)).not.toBeInTheDocument();
  });

  it('calls a pipeline orphaned when its ingress no longer exists', async () => {
    // Not paused, not stopped: the entry organ is GONE. Left as "armed" this
    // was the most misleading row on the page — a bot that does not exist,
    // reading as live coverage.
    listPipelines.mockResolvedValue([
      pipeline({ state: 'orphaned', trigger_ref: 'telegram_ingress_bot1', entry_live: false }),
    ]);
    render(<PipelinesConsole />);
    await waitFor(() =>
      expect(screen.getByText(/no longer registered/)).toBeInTheDocument(),
    );
    expect(screen.getByText('orphaned')).toBeInTheDocument();
    expect(screen.getByText('looks like coverage, provides none')).toBeInTheDocument();
    // The stopped-daemon note would be redundant — the orphan already explains
    // itself, and more strongly.
    expect(screen.queryByText(/Armed, but nothing is feeding it/)).not.toBeInTheDocument();
  });

  it('says nothing when nobody can tell — a guess would be a false alarm', async () => {
    listPipelines.mockResolvedValue([pipeline({ entry_live: undefined })]);
    render(<PipelinesConsole />);
    await waitFor(() => expect(screen.getByText('armed')).toBeInTheDocument());
    expect(screen.queryByText(/nothing is feeding it/)).not.toBeInTheDocument();
  });
});
