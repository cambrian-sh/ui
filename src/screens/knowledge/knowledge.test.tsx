import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ipc } from '@/ipc';
import type { AskOutcome, SubstrateOverview } from '@/ipc/types';
import { AskPane } from './AskPane';
import { OverviewStrip } from './OverviewStrip';
import { ContradictionsPane } from './ContradictionsPane';
import { parseRows, RowTable } from './rows';

// The console shell pulls in the router; these tests exercise the panes,
// where the acceptance criteria land. Link renders as a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  Link: ({ children, ...rest }: { children?: unknown; to?: string }) => (
    <a href={String((rest as { to?: string }).to ?? '#')}>{children as never}</a>
  ),
}));

// The panes fetch through `@/ipc` themselves (there is no feed lane for the
// substrate), so the ipc module is mocked per-file — the same isolation the
// prop-driven panes get from fake props.
vi.mock('@/ipc', () => ({
  ipc: {
    askKnowledge: vi.fn(),
    knowledgeQuery: vi.fn(),
    knowledgeOverview: vi.fn(),
    listKnowledgeEntities: vi.fn(),
  },
}));

function seedAsk(outcome: AskOutcome) {
  vi.mocked(ipc.askKnowledge).mockResolvedValue(outcome);
  vi.mocked(ipc.knowledgeQuery).mockResolvedValue({
    guarantee: outcome.guarantee,
    rows: outcome.rows,
  });
}

function answered(over: Partial<AskOutcome> = {}): AskOutcome {
  return {
    answered: true,
    guarantee: 'exact over stored data; identity and coverage epistemically uncertain',
    rows: [
      '{"entity_id":"purchase_order/PO-800","predicate":"payment_terms_days","value_number":60,"evidence_id":"ev-77"}',
    ],
    compiled: {
      kind: 'point',
      entity_id: 'purchase_order/PO-800',
      predicate: 'payment_terms_days',
      item_kind: '',
      actor: '',
      aggregate: '',
      hops: 0,
      limit: 0,
      evidence_id: '',
      as_of: '',
      from: '',
      to: '',
    },
    refusal_reason: '',
    lane_hint: '',
    ...over,
  };
}

function overview(over: Partial<SubstrateOverview> = {}): SubstrateOverview {
  return {
    evidence_count: 12,
    event_count: 4,
    observation_count: 9,
    knowledge_item_count: 6,
    live_resolution_count: 3,
    entity_count: 5,
    actor_count: 2,
    outbox_pending: 0,
    contradiction_count: 1,
    earliest: '2026-08-01T09:00:00Z',
    latest: '2026-08-06T12:00:00Z',
    sources: [
      {
        source_id: 'event:crm-webhook',
        evidence_count: 12,
        last_seen: '2026-08-06T12:00:00Z',
        classification: ['sales', 'customer_facing'],
      },
    ],
    kinds: [{ kind: 'commitment', count: 6 }],
    ...over,
  };
}

async function ask(question: string) {
  fireEvent.change(screen.getByLabelText('Ask the knowledge substrate'), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  await waitFor(() => expect(screen.getByLabelText('Answer')).toBeInTheDocument());
}

// ---------------------------------------------------------------------------
// Invariant: an answer always carries its guarantee AND its compiled query
// ---------------------------------------------------------------------------

describe('the ask box, answered', () => {
  it('renders the exact value, the guarantee verbatim, and the compiled query', async () => {
    seedAsk(answered());
    render(<AskPane onOpenReceipt={() => {}} />);
    await ask('What are the payment terms for PO-800?');

    expect(screen.getByText('60')).toBeInTheDocument();
    expect(
      screen.getByText(/exact over stored data; identity and coverage epistemically uncertain/),
    ).toBeInTheDocument();
    const chip = screen.getByLabelText('Compiled query');
    expect(chip).toHaveTextContent('point');
    expect(chip).toHaveTextContent('purchase_order/PO-800');
  });

  it('makes the evidence receipt one click from the value', async () => {
    seedAsk(answered());
    const onOpenReceipt = vi.fn();
    render(<AskPane onOpenReceipt={onOpenReceipt} />);
    await ask('What are the payment terms for PO-800?');

    fireEvent.click(screen.getByRole('button', { name: 'ev-77' }));
    expect(onOpenReceipt).toHaveBeenCalledWith('ev-77');
  });

  it('has no axe violations', async () => {
    seedAsk(answered());
    const { container } = render(<AskPane onOpenReceipt={() => {}} />);
    await ask('What are the payment terms for PO-800?');
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Invariant: a refusal is the plane WORKING — rendered as design, not error,
// with the memory lane named for open-ended questions
// ---------------------------------------------------------------------------

describe('the ask box, refused', () => {
  it('names the reason, says "by design", and links the memory lane', async () => {
    seedAsk(
      answered({
        answered: false,
        rows: [],
        compiled: null,
        refusal_reason: 'Open-ended improvement question, not answerable from typed rows.',
        lane_hint: 'memory',
      }),
    );
    render(<AskPane onOpenReceipt={() => {}} />);
    await ask('What should we improve about onboarding?');

    expect(screen.getByText('Refused — by design')).toBeInTheDocument();
    expect(screen.getByText(/not answerable from typed rows/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'search memory' })).toBeInTheDocument();
    // A refusal must never render an answer table.
    expect(screen.queryByLabelText('Answer rows')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Holdings: per-source surfaces carry their classification tags
// ---------------------------------------------------------------------------

describe('the overview strip', () => {
  it('shows each source surface with its classification tags', () => {
    render(<OverviewStrip overview={overview()} />);
    expect(screen.getByText('event:crm-webhook')).toBeInTheDocument();
    expect(screen.getByText('sales')).toBeInTheDocument();
    expect(screen.getByText('customer_facing')).toBeInTheDocument();
  });

  it('headlines contradictions with a word, not a colour', () => {
    render(<OverviewStrip overview={overview({ contradiction_count: 2 })} />);
    expect(screen.getByText('2 contradictions')).toBeInTheDocument();
  });

  it('reports materializing ingest only when the outbox is non-empty', () => {
    const { rerender } = render(<OverviewStrip overview={overview({ outbox_pending: 0 })} />);
    expect(screen.queryByText(/materializing/)).not.toBeInTheDocument();
    rerender(<OverviewStrip overview={overview({ outbox_pending: 7 })} />);
    expect(screen.getByText('7 materializing')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Contradictions: both sides shown, neither styled as wrong
// ---------------------------------------------------------------------------

describe('the contradictions pane', () => {
  it('shows both actors side by side and says resolving is a human call', async () => {
    // The mock's knowledgeQuery answers with a point row; a contradictions row
    // is shaped differently, so seed via the ask outcome the mock echoes.
    seedAsk(
      answered({
        rows: [
          '{"entity_id":"purchase_order/PO-800","predicate":"promised_date","actors":{"ops@acme":"2026-08-16","rep@acme":"2026-08-27"}}',
        ],
      }),
    );
    render(<ContradictionsPane kinds={[{ kind: 'commitment', count: 6 }]} />);
    await waitFor(() =>
      expect(screen.getByText(/ops@acme currently asserts/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/rep@acme currently asserts/)).toBeInTheDocument();
    expect(screen.getByText('2026-08-16')).toBeInTheDocument();
    expect(screen.getByText('2026-08-27')).toBeInTheDocument();
    expect(screen.getByText(/resolving it is a\s*human call/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Row rendering: dynamic columns, undecodable rows stay visible
// ---------------------------------------------------------------------------

describe('row rendering', () => {
  it('keeps an undecodable row visible instead of dropping it', () => {
    const rows = parseRows(['not json at all']);
    render(<RowTable rows={rows} ariaLabel="test rows" />);
    expect(screen.getByText('not json at all')).toBeInTheDocument();
  });

  it('renders zero rows as an answer, not an error', () => {
    render(<RowTable rows={[]} ariaLabel="test rows" />);
    expect(screen.getByText(/an answer, not an error/)).toBeInTheDocument();
  });
});
