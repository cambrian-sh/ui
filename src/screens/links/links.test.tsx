import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Link, LinkPair, StateOfRecord } from '@/ipc/types';
import { projectionStore } from '@/store/projection';
import { queryClient } from '@/lib/queryClient';

const listLinkPairs = vi.fn();
const confirmLinkPair = vi.fn();
const rejectLinkPair = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    listLinkPairs: (...a: unknown[]) => listLinkPairs(...a),
    confirmLinkPair: (...a: unknown[]) => confirmLinkPair(...a),
    rejectLinkPair: (...a: unknown[]) => rejectLinkPair(...a),
  },
}));

import { LinkReviewConsole, orderCandidates, orderPairs } from './LinkReviewConsole';

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'lnk_1',
    namespace_id: 'default',
    family: 'identity',
    from_ref: 'entity:customer/C-1042',
    to_ref: 'entity:customer/C-9001',
    relation: 'same_as',
    state: 'candidate',
    mechanism: 'derived',
    producer: 'normalizer@1',
    confidence: 0.62,
    evidence_id: 'ev_77',
    asserted_by: 'identity-producers',
    asserted_at_unix_ms: 1_700_000_000_000,
    recorded_at_unix_ms: 1_700_000_000_500,
    valid_from_unix_ms: 0,
    valid_to_unix_ms: 0,
    retracted_at_unix_ms: 0,
    source_ref: 'norm:C-1042',
    ...overrides,
  };
}

/** One claim per link, as the kernel groups them (contract 0109). */
function pairOf(links: Link[], already_confirmed = false): LinkPair {
  const l = links[0];
  return {
    pair: { namespace_id: l.namespace_id, family: l.family, from_ref: l.from_ref, to_ref: l.to_ref, relation: l.relation },
    confidence: Math.max(...links.map((x) => x.confidence)),
    candidates: links,
    confirmations: [],
    already_confirmed,
  };
}

const pairs = (...links: Link[]): LinkPair[] => links.map((l) => pairOf([l]));

function makeState(role: string, capabilities: string[]): StateOfRecord {
  return {
    connection: {
      status: 'live',
      endpoint: 'mock://localhost',
      last_known_state_at: new Date().toISOString(),
      reason: null,
    },
    role,
    kernel_version: '0.6.9-alpha',
    contract_version: '0098',
    capabilities,
    contract_skew: 0,
    plugins: [],
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    scope: {},
    watch_configs: [],
  } as unknown as StateOfRecord;
}

/** 16 characters is the console-wide reason gate (`REASON_MIN`). */
const REASON = 'Verified against the source order';

describe('LinkReviewConsole (contract 0098 — the identity plane review lane)', () => {
  beforeEach(() => {
    projectionStore.getState().reset();
    projectionStore.getState().hydrate(makeState('operator', ['links']));
    queryClient.clear();
    listLinkPairs.mockReset();
    confirmLinkPair.mockReset();
    rejectLinkPair.mockReset();
  });

  it('orders the queue by confidence, then by age, then by id', () => {
    // The kernel already sorts. Sorting here too is what stops the rows moving
    // between two polls — a queue that reshuffles while you read it is one an
    // operator stops working from.
    const rows = orderCandidates([
      makeLink({ id: 'b', confidence: 0.4, asserted_at_unix_ms: 10 }),
      makeLink({ id: 'c', confidence: 0.9, asserted_at_unix_ms: 30 }),
      makeLink({ id: 'a', confidence: 0.4, asserted_at_unix_ms: 5 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('renders the grounds, not just the claim — mechanism, producer and evidence', async () => {
    listLinkPairs.mockResolvedValue(pairs(
      makeLink({ id: 'lnk_1', confidence: 0.62 }),
      makeLink({
        id: 'lnk_2',
        confidence: 0.91,
        mechanism: 'correlation',
        producer: 'correlator@1',
        relation: 'preceded_and_shares_entities',
        from_ref: 'event:ev_a',
        to_ref: 'event:ev_b',
        family: 'lineage',
        evidence_id: 'ev_88',
      }),
    ));

    render(<LinkReviewConsole />);

    // Strongest first, whatever order the kernel handed them over in.
    const relations = await screen.findAllByText(/same_as|preceded_and_shares_entities/);
    expect(relations[0]).toHaveTextContent('preceded_and_shares_entities');

    // The half that decides whether to believe the claim.
    expect(screen.getByText('derived')).toBeInTheDocument();
    expect(screen.getByText('normalizer@1')).toBeInTheDocument();
    expect(screen.getByText('ev_77')).toBeInTheDocument();
    expect(screen.getByText('ev_88')).toBeInTheDocument();
    expect(screen.getByText('0.91')).toBeInTheDocument();
    // Correlation says so in words — colour and jargon are not the only carrier.
    expect(screen.getByText(/Co-occurrence is not causation/)).toBeInTheDocument();
  });

  it('a rejection carries the operator’s reason to the kernel', async () => {
    listLinkPairs.mockResolvedValue(pairs(makeLink({ id: 'lnk_1' })));
    rejectLinkPair.mockResolvedValue({ command_id: 'c', deduped: false, retracted: 1 });

    render(<LinkReviewConsole />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    // The reason is a gate, not a formality: the button stays dead until it is
    // long enough to mean something in the audit log.
    const submit = screen.getByRole('button', { name: 'Reject link' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Why reject'), { target: { value: REASON } });
    expect(screen.getByRole('button', { name: 'Reject link' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reject link' }));

    await waitFor(() => expect(rejectLinkPair).toHaveBeenCalledTimes(1));
    expect(rejectLinkPair).toHaveBeenCalledWith(
      { namespace_id: 'default', family: 'identity', from_ref: 'entity:customer/C-1042', to_ref: 'entity:customer/C-9001', relation: 'same_as' },
      REASON,
    );
  });

  it('a confirmation carries the reason too, and re-reads the queue', async () => {
    listLinkPairs.mockResolvedValue(pairs(makeLink({ id: 'lnk_1' })));
    confirmLinkPair.mockResolvedValue({ command_id: 'c1', deduped: false, confirmations: [] });

    render(<LinkReviewConsole />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    fireEvent.change(screen.getByLabelText('Why confirm'), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));

    await waitFor(() => expect(confirmLinkPair).toHaveBeenCalledTimes(1));
    expect(confirmLinkPair).toHaveBeenCalledWith(
      { namespace_id: 'default', family: 'identity', from_ref: 'entity:customer/C-1042', to_ref: 'entity:customer/C-9001', relation: 'same_as' },
      REASON,
    );
    // Nothing is removed optimistically: candidates are not on the feed, so the
    // queue is re-read rather than guessed at.
    await waitFor(() => expect(listLinkPairs).toHaveBeenCalledTimes(2));
  });

  it('a viewer can read the queue but not decide', async () => {
    projectionStore.getState().hydrate(makeState('viewer', ['links']));
    listLinkPairs.mockResolvedValue(pairs(makeLink()));

    render(<LinkReviewConsole />);
    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.getByText('Reviewing is operator-only.')).toBeInTheDocument();
  });

  it('zero candidates is calm, and says nothing is wrong', async () => {
    listLinkPairs.mockResolvedValue([]);
    render(<LinkReviewConsole />);
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument();
    expect(screen.getByText(/every proposal has been decided/)).toBeInTheDocument();
  });

  it('without the capability the lane is hidden, and the kernel is not called', async () => {
    projectionStore.getState().hydrate(makeState('operator', []));
    render(<LinkReviewConsole />);

    expect(
      await screen.findByText('This kernel has no link review lane'),
    ).toBeInTheDocument();
    // A deployment with no link store is CORRECT. Probing it would turn a
    // correct deployment into an error on screen.
    expect(listLinkPairs).not.toHaveBeenCalled();
  });

  it('shows a claim supported by several sources ONCE, with its strongest row and the count', async () => {
    // Contract 0109: a payroll row and a directory row of the same claim are two
    // rows (each its own classification) and one card.
    listLinkPairs.mockResolvedValue([
      pairOf([
        makeLink({ id: 'lnk_hr', confidence: 0.6, evidence_id: 'ev_payroll' }),
        makeLink({ id: 'lnk_dir', confidence: 0.85, evidence_id: 'ev_directory' }),
      ]),
    ]);
    render(<LinkReviewConsole />);
    expect(await screen.findAllByRole('button', { name: 'Confirm' })).toHaveLength(1);
    expect(screen.getByText(/2 sources support this claim/)).toBeInTheDocument();
    // The strongest row's grounds are on the card.
    expect(screen.getByText('ev_directory')).toBeInTheDocument();
    expect(screen.queryByText(/Already confirmed via another source/)).not.toBeInTheDocument();
  });

  it('flags a new source of an already-confirmed claim as "extend the confirmation?"', async () => {
    listLinkPairs.mockResolvedValue([pairOf([makeLink({ id: 'lnk_new', evidence_id: 'ev_crm' })], true)]);
    confirmLinkPair.mockResolvedValue({ command_id: 'c2', deduped: false, confirmations: [] });
    render(<LinkReviewConsole />);
    expect(await screen.findByText(/Already confirmed via another source — extend the confirmation/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Extend confirmation' }));
    fireEvent.change(screen.getByLabelText('Why confirm'), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm link' }));
    await waitFor(() => expect(confirmLinkPair).toHaveBeenCalledTimes(1));
  });

  it('orders claims by their best row, then by age', () => {
    const a = pairOf([makeLink({ id: 'a', from_ref: 'entity:x/1', confidence: 0.4, asserted_at_unix_ms: 9 })]);
    const b = pairOf([makeLink({ id: 'b', from_ref: 'entity:x/2', confidence: 0.4, asserted_at_unix_ms: 3 })]);
    const c = pairOf([
      makeLink({ id: 'c1', from_ref: 'entity:x/3', confidence: 0.2 }),
      makeLink({ id: 'c2', from_ref: 'entity:x/3', confidence: 0.9 }),
    ]);
    expect(orderPairs([a, b, c]).map((p) => p.pair.from_ref)).toEqual(['entity:x/3', 'entity:x/2', 'entity:x/1']);
  });
});
