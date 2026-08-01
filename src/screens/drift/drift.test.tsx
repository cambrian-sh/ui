import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type {
  Alert,
  AlertCitation,
  DriftStats,
  KindPushStatus,
  RetentionRunEvent,
  SourceCoverage,
} from '@/ipc/types';
import { OutcomeLedger } from './OutcomeLedger';
import { AlertEvidence } from './AlertEvidence';
import { AlertFeed, applyFilter } from './AlertFeed';
import { RetentionPane } from './RetentionPane';
import { CoveragePane } from './CoveragePane';
import {
  consecutiveBounded,
  consecutiveFailures,
  groupEvidence,
  mergeRetentionRuns,
  parseCitedText,
  unanchoredCitations,
  describeReason,
  deltaNote,
  medianLatencyMs,
  describeHorizon,
  pushFreshness,
} from './drift-format';

// The console shell itself pulls in the router; these tests exercise the panes,
// which is where every acceptance criterion actually lands.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

function citation(over: Partial<AlertCitation> = {}): AlertCitation {
  return { index: 1, kind: 'message', ref: 'm-1', quote: '', at: '', version_id: 0, ...over };
}

function makeAlert(over: Partial<Alert> = {}): Alert {
  return {
    id: 1,
    kind: 'purchase_order',
    record_key: 'PO-4471',
    owner: 'acme',
    speaker: 'rep@acme',
    message_id: 'm-1',
    delta_days: 11,
    promised: '2026-08-14T00:00:00Z',
    recorded: '2026-08-25T00:00:00Z',
    slip_count: 3,
    text: 'rep@acme promised 14 August [1], but PO-4471 records 25 August [2].',
    citations: [
      citation({ index: 1, kind: 'message', quote: 'we can ship the 14th', at: '2026-08-01T09:00:00Z' }),
      citation({ index: 2, kind: 'record', ref: 'PO-4471@2026-08-25', version_id: 9001, quote: '' }),
    ],
    tags: ['customer-pii', 'contracts'],
    raised_at: '2026-08-01T14:02:00Z',
    detect_latency_ms: 4,
    ...over,
  };
}

function makeStats(over: Partial<DriftStats> = {}): DriftStats {
  return {
    consistent: 1160,
    drift: 3,
    refused: 6,
    unresolved: [
      { reason: 'ambiguous_match', count: 41 },
      { reason: 'record_not_found', count: 41 },
      { reason: 'record_older_than_commitment', count: 26 },
      { reason: 'record_missing_promised_date', count: 5 },
      { reason: 'no_record_reference', count: 2 },
    ],
    total: 1284,
    available: true,
    ...over,
  };
}

function run(over: Partial<RetentionRunEvent> = {}): RetentionRunEvent {
  return {
    source: 'records',
    run_id: 1,
    started_at: '2026-08-01T13:00:00Z',
    finished_at: '2026-08-01T13:00:01Z',
    deleted: [{ category: 'record_versions', count: 5000 }],
    bounded: false,
    error: '',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Invariant: `available=false` must never render as a tally of zeros
// ---------------------------------------------------------------------------

describe('the not-configured state', () => {
  it('replaces the whole page — no outcome cards, no reasons, no refusals', () => {
    render(<OutcomeLedger stats={makeStats({ available: false, consistent: 0, drift: 0, refused: 0, unresolved: [], total: 0 })} refusals={[]} />);

    expect(screen.getByText('No reconciler in this deployment')).toBeInTheDocument();
    expect(screen.getByText('available = false')).toBeInTheDocument();

    // The four outcome cards must be absent entirely, not rendered as zeros.
    expect(screen.queryByText('consistent')).not.toBeInTheDocument();
    expect(screen.queryByText('drift')).not.toBeInTheDocument();
    expect(screen.queryByText('unresolved')).not.toBeInTheDocument();
    expect(screen.queryByText('refused')).not.toBeInTheDocument();
  });

  it('says "not nothing was found", so an absent detector cannot read as a clean bill of health', () => {
    render(<OutcomeLedger stats={makeStats({ available: false })} refusals={[]} />);
    expect(screen.getByText(/not “nothing was found”/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Invariant: the four outcomes stay distinct; refused is never an error
// ---------------------------------------------------------------------------

describe('the outcome ledger', () => {
  it('renders all four outcomes with their counts', () => {
    render(<OutcomeLedger stats={makeStats()} refusals={[]} />);
    expect(screen.getByText('consistent')).toBeInTheDocument();
    expect(screen.getByText('1 160')).toBeInTheDocument();
    expect(screen.getByText('drift')).toBeInTheDocument();
    expect(screen.getByText('unresolved')).toBeInTheDocument();
    expect(screen.getByText('refused')).toBeInTheDocument();
  });

  it('states that refused is working as intended, and never calls it an error', () => {
    render(<OutcomeLedger stats={makeStats()} refusals={[]} />);
    expect(screen.getByText('Working as intended.')).toBeInTheDocument();
    expect(screen.getByText(/Not an error — do not/)).toBeInTheDocument();
  });

  it('separates the five unresolved reasons and labels whose problem each is', () => {
    render(<OutcomeLedger stats={makeStats()} refusals={[]} />);
    for (const reason of [
      'record_not_found',
      'record_older_than_commitment',
      'ambiguous_match',
      'record_missing_promised_date',
      'no_record_reference',
    ]) {
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
    expect(screen.getByText('your ERP export')).toBeInTheDocument();
    expect(screen.getByText('counterparty naming')).toBeInTheDocument();
    expect(screen.getByText("nobody's fault")).toBeInTheDocument();
  });

  it('names the two tied reasons rather than summing them away', () => {
    render(<OutcomeLedger stats={makeStats()} refusals={[]} />);
    // 41 ambiguous_match and 41 record_not_found are the same number and
    // completely different work — the sentence has to say so with the names.
    expect(screen.getByText(/are the same number — 41 each — and completely different work/)).toBeInTheDocument();
  });

  it('says the tally is process-lifetime rather than implying a trend', () => {
    render(<OutcomeLedger stats={makeStats()} refusals={[]} />);
    expect(screen.getByText(/process-lifetime, not durable/)).toBeInTheDocument();
  });

  it('keeps the benchmark figure distinct from this deployment', () => {
    render(<OutcomeLedger stats={makeStats()} refusals={[]} />);
    expect(screen.getByText(/that figure is the harness — worth keeping distinct/)).toBeInTheDocument();
  });

  it('reports an unrecognised reason instead of dropping its count', () => {
    // The two handoffs disagree on three of five reason names. A count that
    // vanishes because the vocabulary moved is the silent loss this page exists
    // to prevent.
    render(<OutcomeLedger stats={makeStats({ unresolved: [{ reason: 'scope_missing', count: 7 }] })} refusals={[]} />);
    const row = screen.getByText('scope_missing').closest('button');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('7')).toBeInTheDocument();
    expect(within(row!).getByText('unrecognised')).toBeInTheDocument();
  });

  it('groups refusals by boundary so one policy conversation is one row', () => {
    render(
      <OutcomeLedger
        stats={makeStats()}
        refusals={[
          { id: 1, at: '', kind: 'drift_alert', ref: 'PO-1', boundary: ['customer-pii', 'supplier-confidential'], reason: 'closed boundary' },
          { id: 2, at: '', kind: 'drift_alert', ref: 'PO-2', boundary: ['supplier-confidential', 'customer-pii'], reason: 'closed boundary' },
          { id: 3, at: '', kind: 'drift_alert', ref: 'PO-3', boundary: ['legal-hold'], reason: 'held material' },
        ]}
      />,
    );
    // Two rows, not three: the first two share a boundary regardless of order.
    const pair = screen.getByText('supplier-confidential').closest('li');
    expect(pair).not.toBeNull();
    expect(within(pair!).getByText('2')).toBeInTheDocument();
    const held = screen.getByText('legal-hold').closest('li');
    expect(within(held!).getByText('1')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Invariant: citation markers are derived, never hardcoded
// ---------------------------------------------------------------------------

describe('citations', () => {
  it('derives the [3..n] run from the history, so one earlier date renders [3] and none renders nothing', () => {
    const none = groupEvidence([citation({ index: 1 }), citation({ index: 2, kind: 'record' })]);
    expect(none.history).toHaveLength(0);

    const one = groupEvidence([
      citation({ index: 1 }),
      citation({ index: 2, kind: 'record' }),
      citation({ index: 3, kind: 'record' }),
    ]);
    expect(one.history.map((c) => c.index)).toEqual([3]);

    const two = groupEvidence([
      citation({ index: 1 }),
      citation({ index: 2, kind: 'record' }),
      citation({ index: 3, kind: 'record' }),
      citation({ index: 4, kind: 'record' }),
    ]);
    expect(two.history.map((c) => c.index)).toEqual([3, 4]);
  });

  it('resolves every marker in the sentence against a real citation', () => {
    const segs = parseCitedText('a [1] b [2] c', [citation({ index: 1 }), citation({ index: 2, kind: 'record' })]);
    const markers = segs.filter((s) => s.kind === 'marker');
    expect(markers).toHaveLength(2);
    expect(segs.some((s) => s.kind === 'orphan')).toBe(false);
  });

  it('marks a marker with no citation as an orphan rather than drawing it as followable', () => {
    // This is the exact defect review caught: a hardcoded [3][4] produced two
    // markers with no citations on two of three alerts.
    const segs = parseCitedText('it has moved 3 times[3][4]', [citation({ index: 1 })]);
    const orphans = segs.filter((s) => s.kind === 'orphan');
    expect(orphans).toHaveLength(2);
    expect(segs.some((s) => s.kind === 'marker')).toBe(false);
  });

  it('reports citations that carry no marker in the sentence', () => {
    const orphaned = unanchoredCitations('only [1] here', [
      citation({ index: 1 }),
      citation({ index: 2, kind: 'record' }),
    ]);
    expect(orphaned.map((c) => c.index)).toEqual([2]);
  });

  it('renders no third evidence card when the alert has no earlier dates', () => {
    render(<AlertEvidence alert={makeAlert()} />);
    expect(screen.queryByText('every earlier date this record carried')).not.toBeInTheDocument();
  });

  it('renders each earlier date with the day it was written, not just the count', () => {
    const alert = makeAlert({
      text: 'promised [1], records [2], moved before[3]',
      citations: [
        citation({ index: 1, quote: 'the 14th' }),
        citation({ index: 2, kind: 'record', ref: 'PO-4471@2026-08-25' }),
        citation({ index: 3, kind: 'record', ref: 'PO-4471@2026-08-18', at: '2026-07-20T00:00:00Z' }),
      ],
    });
    render(<AlertEvidence alert={alert} />);
    expect(screen.getByText('every earlier date this record carried')).toBeInTheDocument();
    // The date AND the day it was written — the count alone is an assertion,
    // these two together are the argument.
    const historyRow = screen.getByText('PO-4471@2026-08-18').closest('li');
    expect(historyRow).not.toBeNull();
    expect(within(historyRow!).getByText(/^written /)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Invariant: nothing implies an action the product does not take
// ---------------------------------------------------------------------------

describe('the evidence inspector', () => {
  it('offers no Resolve, acknowledge, dismiss or snooze affordance', () => {
    render(<AlertEvidence alert={makeAlert()} />);
    for (const word of [/resolve/i, /acknowledge/i, /dismiss/i, /snooze/i, /mark as read/i]) {
      expect(screen.queryByRole('button', { name: word })).not.toBeInTheDocument();
    }
  });

  it('says outright that the alert does not email, amend or touch the CRM', () => {
    render(<AlertEvidence alert={makeAlert()} />);
    expect(screen.getByText(/it does not email/)).toBeInTheDocument();
  });

  it('puts the two dates before the prose, and changes the sentence with the delta sign', () => {
    expect(deltaNote(11)).toMatch(/LATER than the promise/);
    expect(deltaNote(-3)).toMatch(/EARLIER than the promise/);
    expect(deltaNote(0)).toMatch(/agree on the day/);
  });

  it('shows the inherited classification and says every share honours it', () => {
    render(<AlertEvidence alert={makeAlert()} />);
    expect(screen.getByText('customer-pii')).toBeInTheDocument();
    expect(screen.getByText(/never more visible than the material behind it/)).toBeInTheDocument();
  });

  it('states the missing conversation deep link in place rather than drawing a dead link', () => {
    render(<AlertEvidence alert={makeAlert()} />);
    expect(screen.getByText('opening the thread needs a new RPC')).toBeInTheDocument();
  });

  it('does not claim a commitment was superseded when the kernel never said so', () => {
    render(<AlertEvidence alert={makeAlert()} />);
    expect(screen.queryByText('This commitment was later superseded')).not.toBeInTheDocument();
  });

  it('says so when the alert does carry a supersession flag', () => {
    render(<AlertEvidence alert={makeAlert({ superseded: true })} />);
    expect(screen.getByText('This commitment was later superseded')).toBeInTheDocument();
    expect(screen.getByText(/stays raised/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

describe('the alert feed', () => {
  const feedProps = {
    stats: makeStats(),
    filter: 'all' as const,
    onFilter: vi.fn(),
    selectedId: null,
    onSelect: vi.fn(),
    onOpenLedger: vi.fn(),
    polledAt: new Date('2026-08-01T14:02:00Z'),
    newSinceLastLook: 2,
  };

  it('says it is polling rather than drawing a live indicator', () => {
    render(<AlertFeed {...feedProps} alerts={[makeAlert()]} />);
    expect(screen.getByText(/no live feed for alerts yet — this is a poll/)).toBeInTheDocument();
  });

  it('never renders a bare empty list — it points at the ledger instead', () => {
    render(<AlertFeed {...feedProps} alerts={[]} />);
    expect(screen.getByText(/That is not the same as “nothing was compared”/)).toBeInTheDocument();
    expect(screen.getByText('An empty feed is not an answer')).toBeInTheDocument();
  });

  it('keeps the ledger pointer even when alerts exist', () => {
    render(<AlertFeed {...feedProps} alerts={[makeAlert()]} />);
    expect(screen.getByText(/is not the whole picture/)).toBeInTheDocument();
  });

  it('reports "since you last looked" instead of a read/unread flag', () => {
    render(<AlertFeed {...feedProps} alerts={[makeAlert()]} />);
    expect(screen.getByText('2 since you last looked')).toBeInTheDocument();
  });

  it('shows the signed delta and the keeps-moving badge on the row', () => {
    render(<AlertFeed {...feedProps} alerts={[makeAlert()]} />);
    expect(screen.getByText('+11 d')).toBeInTheDocument();
    expect(screen.getByText('moved 3×')).toBeInTheDocument();
  });

  it('reports median detection latency, and an em-dash when nothing was measured', () => {
    expect(medianLatencyMs([makeAlert({ detect_latency_ms: 4 }), makeAlert({ id: 2, detect_latency_ms: 8 })])).toBe(6);
    expect(medianLatencyMs([])).toBeNull();
  });

  it('filters client-side without claiming the server did it', () => {
    const alerts = [
      makeAlert({ id: 1, delta_days: 11, slip_count: 3 }),
      makeAlert({ id: 2, delta_days: -3, slip_count: 1 }),
    ];
    expect(applyFilter(alerts, 'later').map((a) => a.id)).toEqual([1]);
    expect(applyFilter(alerts, 'moved').map((a) => a.id)).toEqual([1]);
    expect(applyFilter(alerts, 'all')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Retention: a failed pass must be impossible to miss
// ---------------------------------------------------------------------------

describe('retention', () => {
  it('makes a failed pass the loudest thing on the page', () => {
    render(
      <RetentionPane
        hasFeed
        backfilledRuns={[]}
        fedRuns={[
          run({ run_id: 3, source: 'reactive_journal', error: 'delete journal_signals: context deadline exceeded', started_at: '2026-08-01T14:00:02Z' }),
          run({ run_id: 2, started_at: '2026-08-01T13:45:00Z', bounded: true }),
        ]}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Retention has stopped happening')).toBeInTheDocument();
    expect(within(alert).getByText(/context deadline exceeded/)).toBeInTheDocument();
  });

  it('counts only an unbroken run of failures, so a recovered one is history', () => {
    expect(consecutiveFailures([run({ error: 'x' }), run({ error: 'y' }), run({})])).toBe(2);
    expect(consecutiveFailures([run({}), run({ error: 'y' })])).toBe(0);
  });

  it('treats a run of bounded passes as a capacity warning, not a status line', () => {
    const bounded = Array.from({ length: 12 }, (_, i) => run({ run_id: i, bounded: true }));
    expect(consecutiveBounded(bounded)).toBe(12);
    render(<RetentionPane hasFeed fedRuns={bounded} backfilledRuns={[]} />);
    expect(screen.getByText('The backlog is not draining')).toBeInTheDocument();
    expect(screen.getByText(/bounded on 12 of the last 12/)).toBeInTheDocument();
  });

  it('does not warn on a single bounded pass', () => {
    render(<RetentionPane hasFeed fedRuns={[run({ bounded: true })]} backfilledRuns={[]} />);
    expect(screen.queryByText('The backlog is not draining')).not.toBeInTheDocument();
  });

  it('separates "cannot report" from "no pass has run"', () => {
    render(<RetentionPane hasFeed={false} fedRuns={undefined} backfilledRuns={undefined} />);
    expect(screen.getByText('This kernel does not publish retention passes')).toBeInTheDocument();
    expect(screen.getByText(/not a statement that no data was deleted/)).toBeInTheDocument();
  });

  it('states that an empty run list is not evidence about deletion', () => {
    render(<RetentionPane hasFeed fedRuns={[]} backfilledRuns={[]} />);
    expect(screen.getByText(/not a statement that nothing has ever been deleted/)).toBeInTheDocument();
  });

  it('merges the feed and the backfill without double-counting a pass', () => {
    const merged = mergeRetentionRuns(
      [run({ run_id: 7, started_at: '2026-08-01T13:00:00Z' })],
      [run({ run_id: 7, started_at: '2026-08-01T13:00:00Z' }), run({ run_id: 6, started_at: '2026-08-01T12:00:00Z' })],
    );
    expect(merged.map((r) => r.run_id)).toEqual([7, 6]);
  });

  it('keeps two sources with the same run id apart', () => {
    const merged = mergeRetentionRuns([
      run({ run_id: 1, source: 'records' }),
      run({ run_id: 1, source: 'reactive_journal' }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('renders "ran, removed nothing" rather than a blank cell', () => {
    render(<RetentionPane hasFeed fedRuns={[run({ deleted: [] })]} backfilledRuns={[]} />);
    expect(screen.getByText('ran, removed nothing')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Reason vocabulary
// ---------------------------------------------------------------------------

describe('describeReason', () => {
  it('carries an owner and a remedy sentence for each known reason', () => {
    for (const r of [
      'record_not_found',
      'record_older_than_commitment',
      'ambiguous_match',
      'record_missing_promised_date',
      'no_record_reference',
      'commitment_uncertain',
    ]) {
      const d = describeReason(r);
      expect(d.known).toBe(true);
      expect(d.owner).toBeTruthy();
      expect(d.sentence.length).toBeGreaterThan(20);
    }
  });


  /**
   * `commitment_uncertain` is the only reason whose owner is OURS.
   *
   * Every other entry sends the operator to fix something on their side. This one
   * says the detector declined to guess, and telling a customer to fix their export
   * because the regex could not read "if we slipped to the 28th" would be actively
   * misleading. The owner string is the thing under test, not the prose.
   */
  it('attributes commitment_uncertain to the detector, not to the customer data', () => {
    const d = describeReason('commitment_uncertain');
    expect(d.known).toBe(true);
    expect(d.owner).toMatch(/detector/i);
    // Must NOT read as an integration problem, which is what every other reason is.
    expect(d.owner).not.toMatch(/export|mapping|naming/i);
    expect(d.sentence).toMatch(/hypothetical|negation|quoted/i);
  });

  it('degrades rather than dropping a reason it does not recognise', () => {
    const d = describeReason('materiality_suppressed');
    expect(d.known).toBe(false);
    expect(d.sentence).toMatch(/no description for/);
  });
});

// ---------------------------------------------------------------------------
// Coverage (14c) — the denominator
// ---------------------------------------------------------------------------

function coverage(over: Partial<SourceCoverage> = {}): SourceCoverage {
  return {
    source: 'slack',
    connector: 'slack-ingress',
    invited_channels: ['sales', 'ops'],
    channel_count: 2,
    plan_tier: 'free',
    retention_horizon_days: 90,
    horizon_unlimited: false,
    discovery_api: false,
    limits: ['Reads only channels the bot has been invited to — Slack has no read-the-whole-workspace scope.'],
    reported_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    ...over,
  };
}

function push(over: Partial<KindPushStatus> = {}): KindPushStatus {
  return {
    kind: 'purchase_orders',
    last_push_id: 'p-1',
    transport: 'webhook',
    record_count: 1204,
    received_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    live_records: 900,
    ...over,
  };
}

describe('the horizon, which has three states and not two', () => {
  it('reads a bounded horizon as a number of days', () => {
    const h = describeHorizon({ retention_horizon_days: 90, horizon_unlimited: false });
    expect(h.kind).toBe('bounded');
    expect(h.value).toBe('90');
  });

  it('reads unlimited as "no limit", never as a number', () => {
    // The connector maps pro/business/enterprise_grid to None — no cap. The
    // design mockup drew "90 d · plan tier: pro", which is the wrong claim.
    const h = describeHorizon({ retention_horizon_days: -1, horizon_unlimited: true });
    expect(h.kind).toBe('unlimited');
    expect(h.value).toBe('no limit');
  });

  it('never prints -1, and never reads "not reported" as "unlimited"', () => {
    const h = describeHorizon({ retention_horizon_days: -1, horizon_unlimited: false });
    expect(h.kind).toBe('unknown');
    expect(h.value).toBe('unknown');
    expect(h.note).toMatch(/not the same as “no limit”/);
  });

  it('keeps zero distinct from not-reported', () => {
    const h = describeHorizon({ retention_horizon_days: 0, horizon_unlimited: false });
    expect(h.kind).toBe('bounded');
    expect(h.note).toMatch(/nothing is retained/);
  });
});

describe('the coverage pane', () => {
  it('renders the connector own limits verbatim rather than re-deriving them', () => {
    render(<CoveragePane sources={[coverage()]} pushes={[push()]} loaded />);
    expect(screen.getByText(/read-the-whole-workspace scope/)).toBeInTheDocument();
  });

  it('states how old the report is, because coverage is computed at daemon start', () => {
    render(<CoveragePane sources={[coverage()]} pushes={[push()]} loaded />);
    expect(screen.getByText(/reported 4 min ago/)).toBeInTheDocument();
  });

  it('does not render an absent connector as a tally of zeros', () => {
    render(<CoveragePane sources={[]} pushes={[]} loaded />);
    expect(screen.getByText('No connector is reporting coverage')).toBeInTheDocument();
    expect(screen.queryByText('Channels')).not.toBeInTheDocument();
    expect(screen.getByText(/not that nothing is connected, and not that everything is/)).toBeInTheDocument();
  });

  it('says an empty coverage answer is not "everything is covered"', () => {
    render(<CoveragePane sources={[]} pushes={[]} loaded />);
    expect(screen.getByText(/That is not the same as “everything is covered”/)).toBeInTheDocument();
  });

  it('separates "still loading" from "nothing reported"', () => {
    render(<CoveragePane sources={undefined} pushes={undefined} loaded={false} />);
    expect(screen.getByText('Reading coverage…')).toBeInTheDocument();
    expect(screen.queryByText('No connector is reporting coverage')).not.toBeInTheDocument();
  });

  it('attaches the consequence to a stale kind, not just a timestamp', () => {
    const twoDaysAgo = new Date(Date.now() - 50 * 3_600_000).toISOString();
    render(
      <CoveragePane sources={[coverage()]} pushes={[push({ kind: 'shipments', received_at: twoDaysAgo })]} loaded />,
    );
    expect(screen.getByText('every promise about shipments has been unresolvable since')).toBeInTheDocument();
  });

  it('leaves a fresh kind without an alarm sentence', () => {
    render(<CoveragePane sources={[coverage()]} pushes={[push()]} loaded />);
    expect(screen.queryByText(/has been unresolvable since/)).not.toBeInTheDocument();
  });

  it('says the push list is not exhaustive, because a never-pushed kind cannot appear', () => {
    render(<CoveragePane sources={[coverage()]} pushes={[push()]} loaded />);
    expect(screen.getByText(/an absence you cannot see from this page/)).toBeInTheDocument();
  });

  it('states that no import at all makes every order-naming promise unresolvable', () => {
    render(<CoveragePane sources={[coverage()]} pushes={[]} loaded />);
    expect(screen.getByText(/unresolvable by construction/)).toBeInTheDocument();
  });

  it('grades push freshness by age', () => {
    const now = new Date('2026-08-03T12:00:00Z');
    expect(pushFreshness('2026-08-03T09:00:00Z', now)).toBe('fresh');
    expect(pushFreshness('2026-08-02T06:00:00Z', now)).toBe('stale');
    expect(pushFreshness('2026-07-30T12:00:00Z', now)).toBe('cold');
    expect(pushFreshness('', now)).toBe('cold');
  });
});

// ---------------------------------------------------------------------------
// A failing poll must degrade honestly, not blank the feed
// ---------------------------------------------------------------------------

describe('when the poll stops working', () => {
  const base = {
    alerts: [makeAlert()],
    stats: makeStats(),
    filter: 'all' as const,
    onFilter: vi.fn(),
    selectedId: null,
    onSelect: vi.fn(),
    onOpenLedger: vi.fn(),
    polledAt: new Date(Date.now() - 4 * 60_000),
    newSinceLastLook: 0,
  };

  it('keeps the alerts on screen — they are still the last thing the lane said', () => {
    render(<AlertFeed {...base} pollError="kernel unreachable" />);
    expect(screen.getByText('PO-4471')).toBeInTheDocument();
  });

  it('says the refresh is failing, where the freshness claim is made', () => {
    render(<AlertFeed {...base} pollError="kernel unreachable" />);
    expect(screen.getByText(/not refreshing · last good 4 min ago/)).toBeInTheDocument();
  });

  it('warns that an absent alert is not a finding while the poll is down', () => {
    // On this screen silence IS a finding, so a list that stopped refreshing
    // must not be read as "nothing new happened".
    render(<AlertFeed {...base} pollError="kernel unreachable" />);
    expect(screen.getByText(/an absence of new alerts below is not a finding right now/)).toBeInTheDocument();
  });

  it('still says it is a poll when the poll is healthy', () => {
    render(<AlertFeed {...base} pollError={null} />);
    expect(screen.getByText(/this is a poll, and it says so/)).toBeInTheDocument();
    expect(screen.queryByText(/not refreshing/)).not.toBeInTheDocument();
  });
});
