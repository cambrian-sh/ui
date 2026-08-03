import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { StudioIngress, StudioStatus } from '@/ipc/types';

// The console shell pulls in the router; these tests exercise the panes,
// where the gate's acceptance criteria actually land.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

const setCredential = vi.fn().mockResolvedValue({ ok: true, error: '', detail: 'stored' });
const lifecycle = vi.fn().mockResolvedValue({ ok: false, error: 'lifecycle: no transition ARMED → DRAFT', detail: '' });
const captureStatus = vi.fn();
const draftMapping = vi.fn();
const captureSamples = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    studioLifecycle: (...args: unknown[]) => lifecycle(...args),
    studioArm: vi.fn(),
    studioRollback: vi.fn(),
    studioSetCredential: (...args: unknown[]) => setCredential(...args),
    studioClearCredential: vi.fn(),
    studioCaptureStatus: (...args: unknown[]) => captureStatus(...args),
    studioDraftMapping: (...args: unknown[]) => draftMapping(...args),
    studioCaptureSamples: (...args: unknown[]) => captureSamples(...args),
    studioSaveSpec: vi.fn().mockResolvedValue({ ok: true, error: '', revision: 2 }),
  },
}));

import { LifecyclePane, parseRevision } from './LifecyclePane';
import { StateBadge } from './IngressStudioConsole';
import { StudioColumn } from './StudioColumn';

/**
 * The column is driven by the SERVER's lifecycle, so a test has to say which
 * stage it is standing in. MAPPED is the mapping stage — the one 15b used to be
 * a whole tab for.
 */
function ingress(id: string, state = 'MAPPED'): StudioIngress {
  return { ingress_id: id, display_name: id, state, health: 'ok', pinned_release: '' };
}

describe('parseRevision', () => {
  it('accepts plain positive integers and refuses everything else', () => {
    // `Number('r2')` is NaN, NaN serializes as null, and the kernel answers
    // a type error instead of a named refusal — the regression this pins.
    expect(parseRevision('2')).toBe(2);
    expect(parseRevision(' 2 ')).toBe(2);
    for (const bad of ['r2', '2.5', '', '0', '-1', 'two', '2x']) {
      expect(parseRevision(bad)).toBeNull();
    }
  });
});

function status(over: Partial<StudioStatus> = {}): StudioStatus {
  return {
    summary: {
      ingress_id: 'gh',
      display_name: 'GitHub',
      state: 'DRY_RUN',
      health: 'ok',
      pinned_release: '',
    },
    latest_transport_revision: 1,
    latest_mapping_revision: 1,
    release_id: '',
    armed_transport_revision: 0,
    armed_mapping_revision: 0,
    capture_samples: 2,
    failure_count: 0,
    credentials: [{ name: 'secret', configured: false, last_four: '' }],
    egress_policy_json: '',
    ...over,
  };
}

describe('LifecyclePane', () => {
  it('shows the arm form only in DRY_RUN, and arming demands a reason', () => {
    render(
      <LifecyclePane ingressId="gh" state="DRY_RUN" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    // The arm form is present with revision inputs and a disabled button
    // until the reason gate is satisfied.
    expect(screen.getByText('Arm', { selector: 'button' })).toBeDisabled();
    expect(screen.getByLabelText('Transport revision')).toBeInTheDocument();
    expect(screen.getByLabelText('Mapping revision')).toBeInTheDocument();
  });

  it('never renders an arm form outside DRY_RUN — pause appears when armed', () => {
    render(
      <LifecyclePane ingressId="gh" state="ARMED" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    expect(screen.queryByLabelText('Transport revision')).not.toBeInTheDocument();
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('renders the kernel-named refusal inline, never a generic error', async () => {
    render(
      <LifecyclePane ingressId="gh" state="ARMED" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() =>
      expect(screen.getByText('lifecycle: no transition ARMED → DRAFT')).toBeInTheDocument(),
    );
  });

  it('reports an unconfigured credential as the 503 it causes', () => {
    render(
      <LifecyclePane ingressId="gh" state="DRAFT" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    expect(screen.getByText(/not configured — deliveries answer 503/)).toBeInTheDocument();
  });

  it('clears the credential input on success — a secret never lingers', async () => {
    render(
      <LifecyclePane ingressId="gh" state="DRAFT" status={status()} readOnly={false} onChanged={() => {}} />,
    );
    const input = screen.getByLabelText('Credential secret') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'whsec_xyz' } });
    fireEvent.click(screen.getByText('Store'));
    await waitFor(() => expect(input.value).toBe(''));
    expect(setCredential).toHaveBeenCalledWith('gh', 'secret', 'whsec_xyz');
  });

  it('offers no mutating controls to a read-only role', () => {
    render(
      <LifecyclePane ingressId="gh" state="DRY_RUN" status={status()} readOnly={true} onChanged={() => {}} />,
    );
    expect(screen.queryByText('Arm', { selector: 'button' })).not.toBeInTheDocument();
    expect(screen.queryByText('Store')).not.toBeInTheDocument();
  });
});

/**
 * 15b — the mapping review.
 *
 * These pin the two properties the screen exists for: an abstention is an
 * outcome rather than an empty field, and what a mapping throws away is as
 * visible as what it keeps.
 */
describe('the studio column — the mapping stage', () => {
  const profile = JSON.stringify({
    samples: 4,
    paths: {
      'properties.mag': { present: 4, types: { number: 4 } },
      'properties.place': { present: 4, types: { string: 3, null: 1 }, nulls: 1 },
      'geometry.coordinates': { present: 4, types: { array: 4 }, max_array_len: 3 },
    },
  });

  function draft(over: Record<string, unknown> = {}) {
    return {
      ok: true,
      error: '',
      abstained: '',
      field_abstentions: [],
      spec_json: JSON.stringify({
        stream: 'usgs',
        occurred_at: { path: '/properties/time' },
        discards: [{ name: 'below the reporting threshold', path: 'properties.mag' }],
      }),
      coverage_json: JSON.stringify({
        Samples: 4,
        MappedPaths: ['properties.mag'],
        UnmappedPaths: ['properties.place'],
        DiscardedPaths: [],
        MissRates: { 'properties.mag': 0, 'properties.place': 0.25 },
      }),
      ...over,
    };
  }

  it('says the drafter cannot save, transition or arm', async () => {
    captureStatus.mockResolvedValue({ samples: 4, profile_json: profile });
    render(<StudioColumn summary={ingress('m1')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() =>
      expect(
      screen.getAllByText(/cannot save, transition or arm/).length,
    ).toBeGreaterThan(0),
    );
  });

  it('renders an abstention as a first-class outcome, not an empty field', async () => {
    captureStatus.mockResolvedValue({ samples: 4, profile_json: profile });
    draftMapping.mockResolvedValue(
      draft({ abstained: 'geometry.coordinates is an unlabelled array — which element is latitude?' }),
    );
    render(<StudioColumn summary={ingress('m2')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('Propose a mapping')).toBeEnabled());
    fireEvent.click(screen.getByText('Propose a mapping'));
    await waitFor(() =>
      expect(screen.getByText(/The drafter abstained — it needs you/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/which element is latitude\?/)).toBeInTheDocument();
    // An abstention is not a proposal, so nothing is offered to save.
    expect(screen.queryByText(/Save as a new mapping revision/)).not.toBeInTheDocument();
  });

  it('names each discard rule and says it is reversible for what it merely ignores', async () => {
    captureStatus.mockResolvedValue({ samples: 4, profile_json: profile });
    draftMapping.mockResolvedValue(draft());
    render(<StudioColumn summary={ingress('m3')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('Propose a mapping')).toBeEnabled());
    fireEvent.click(screen.getByText('Propose a mapping'));
    await waitFor(() => expect(screen.getByText('What this mapping throws away')).toBeInTheDocument());
    expect(screen.getByText('“below the reporting threshold”')).toBeInTheDocument();
    expect(screen.getByText(/Still in raw\./)).toBeInTheDocument();
    // Repairability sits next to the button, where the decision is made.
    expect(screen.getByText(/shadow-reprocessed over the same evidence/)).toBeInTheDocument();
  });

  it('flags the two shapes a mapping cannot safely guess at', async () => {
    captureStatus.mockResolvedValue({ samples: 4, profile_json: profile });
    render(<StudioColumn summary={ingress('m4')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('2 shapes')).toBeInTheDocument());
    expect(screen.getByText('array[3] · unlabelled')).toBeInTheDocument();
  });

  it('explains the abstention on zero samples instead of offering a draft', async () => {
    captureStatus.mockResolvedValue({ samples: 0, profile_json: '' });
    render(<StudioColumn summary={ingress('m5')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('Propose a mapping')).toBeDisabled());
    expect(screen.getByText(/abstains on zero samples/)).toBeInTheDocument();
  });

  it('offers no mutating control to a read-only role', async () => {
    captureStatus.mockResolvedValue({ samples: 4, profile_json: profile });
    render(<StudioColumn summary={ingress('m6')} status={status()} readOnly={true} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('2 shapes')).toBeInTheDocument());
    expect(screen.queryByText('Propose a mapping')).not.toBeInTheDocument();
  });
});

describe('StateBadge', () => {
  it('renders every lifecycle state by name', () => {
    for (const s of ['DRAFT', 'CAPTURING', 'MAPPED', 'DRY_RUN', 'ARMED', 'PAUSED', 'RETIRED']) {
      const { unmount } = render(<StateBadge state={s} />);
      expect(screen.getByText(s)).toBeInTheDocument();
      unmount();
    }
  });
});

/**
 * Per-field abstentions (contract: drafter `field_abstentions`).
 *
 * The design calls these the single easiest thing to get wrong: an abstention
 * rendered as an empty field reads as an oversight and gets filled in without
 * anybody reading why the model would not.
 */
describe('the studio column — abstentions as rows', () => {
  const profile = JSON.stringify({
    samples: 214,
    paths: {
      'properties.mag': { present: 214, types: { number: 214 } },
      'properties.updated': { present: 214, types: { number: 100, string: 114 } },
      'properties.tsunami': { present: 214, types: { number: 214 }, values: [0] },
    },
  });

  function draftWithAbstentions() {
    return {
      ok: true,
      error: '',
      abstained: '',
      field_abstentions: [
        {
          path: 'properties.updated',
          reason: 'In 41 of 214 deliveries this equals time, and in the rest it is later.',
          options: ['revised at', 're-observed at'],
        },
      ],
      spec_json: JSON.stringify({
        stream: 'usgs',
        occurred_at: { path: '/properties/time' },
        observations: [{ predicate: 'magnitude', value: { path: '/properties/mag' } }],
        discards: [],
      }),
      coverage_json: JSON.stringify({
        Samples: 214,
        MappedPaths: ['properties.mag'],
        UnmappedPaths: ['properties.updated', 'properties.tsunami'],
        DiscardedPaths: [],
        MissRates: { 'properties.mag': 0 },
      }),
    };
  }

  beforeEach(() => {
    captureStatus.mockResolvedValue({ samples: 214, profile_json: profile });
    draftMapping.mockResolvedValue(draftWithAbstentions());
  });

  it('renders an abstention as a row with its reason and the decision to make', async () => {
    render(<StudioColumn summary={ingress('a1')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('Propose a mapping')).toBeEnabled());
    fireEvent.click(screen.getByText('Propose a mapping'));

    await waitFor(() => expect(screen.getByText(/Abstained/)).toBeInTheDocument());
    expect(screen.getByText(/In 41 of 214 deliveries/)).toBeInTheDocument();
    // The options are the operator's buttons.
    expect(screen.getByText('revised at')).toBeInTheDocument();
    expect(screen.getByText('re-observed at')).toBeInTheDocument();
    expect(screen.getByText('Leave it in raw')).toBeInTheDocument();
  });

  it('counts abstentions as their own third of coverage, not as ignored', async () => {
    render(<StudioColumn summary={ingress('a2')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('Propose a mapping')).toBeEnabled());
    fireEvent.click(screen.getByText('Propose a mapping'));

    await waitFor(() =>
      expect(screen.getByText(/1 abstained — need you/)).toBeInTheDocument(),
    );
    // The abstained path is NOT also counted as ignored: nobody has decided.
    expect(screen.getByText(/1 ignored, kept in raw/)).toBeInTheDocument();
  });

  it('turns a decision into guidance rather than editing the spec behind the drafter', async () => {
    render(<StudioColumn summary={ingress('a3')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('Propose a mapping')).toBeEnabled());
    fireEvent.click(screen.getByText('Propose a mapping'));
    await waitFor(() => expect(screen.getByText('revised at')).toBeInTheDocument());

    fireEvent.click(screen.getByText('revised at'));
    const box = screen.getByLabelText(/Anything the samples cannot tell it/) as HTMLInputElement;
    expect(box.value).toContain('properties.updated: revised at');
    expect(
      screen.getByText(/the drafter cannot edit a mapping, only propose one/),
    ).toBeInTheDocument();
  });

  it('shows a mapped row as a pair, not just a field that was noticed', async () => {
    render(<StudioColumn summary={ingress('a4')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('Propose a mapping')).toBeEnabled());
    fireEvent.click(screen.getByText('Propose a mapping'));
    // The arrow is its own element now, so the target is asserted on its own:
    // the pair is `path` → `target`, and the glyph between them is decoration.
    await waitFor(() => expect(screen.getByText('magnitude')).toBeInTheDocument());
  });

  it('says WHY a field was ignored, from the profile', async () => {
    render(<StudioColumn summary={ingress('a5')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() => expect(screen.getByText('Propose a mapping')).toBeEnabled());
    fireEvent.click(screen.getByText('Propose a mapping'));
    await waitFor(() =>
      expect(screen.getByText(/constant 0 across all 214/)).toBeInTheDocument(),
    );
  });
});

/**
 * §4.5 — the evidence pane's centrepiece.
 *
 * "Capture comes before mapping because you cannot map a source you have not
 * seen." The schema profile alone cannot discharge that: it says
 * `array[3] · unlabelled` where the payload shows three bare numbers, and only
 * the payload makes the abstention beside it obviously correct.
 */
describe('the studio column — a real delivery', () => {
  beforeEach(() => {
    captureStatus.mockReset();
    captureSamples.mockReset();
    draftMapping.mockReset();
    captureStatus.mockResolvedValue({
      samples: 214,
      profile_json: JSON.stringify({
        samples: 214,
        paths: { 'geometry/coordinates': { present: 214, types: { array: 214 }, max_array_len: 3 } },
      }),
    });
  });

  it('shows a captured delivery as formatted JSON, and says which one', async () => {
    captureSamples.mockResolvedValue({
      total: 214,
      bodies_json: [
        JSON.stringify({ geometry: { coordinates: ['<number:plain>', '<number:plain>', '<number:plain>'] } }),
      ],
    });
    render(<StudioColumn summary={ingress('e1')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);

    expect(await screen.findByText('A real delivery')).toBeInTheDocument();
    // Newest first, so the first row is the newest of 214.
    // findBy, not getBy: the heading renders before the samples query resolves,
    // so asserting synchronously here would test the loading state.
    expect(await screen.findByText('214 of 214')).toBeInTheDocument();
    // Formatted, not a one-line blob — the shape is the whole point.
    expect(screen.getByText(/"coordinates":/)).toBeInTheDocument();
  });

  it('says the values are type tokens, not what the source sent', async () => {
    captureSamples.mockResolvedValue({
      total: 214,
      bodies_json: [JSON.stringify({ properties: { place: '<string:place>' } })],
    });
    render(<StudioColumn summary={ingress('e2')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);

    // Without this an operator reads `<string:place>` as a literal the upstream
    // feed sent, and goes hunting a bug that is not there.
    await waitFor(() =>
      expect(
        screen.getByText(/Values are type tokens, not what the source sent/),
      ).toBeInTheDocument(),
    );
  });

  it('does not claim a delivery it no longer retains', async () => {
    // The profile counts every delivery ever captured; retention prunes the
    // bodies. Reporting "0 of 214" would blame the source for a retention
    // policy, so the pane names the actual reason.
    captureSamples.mockResolvedValue({ total: 214, bodies_json: [] });
    render(<StudioColumn summary={ingress('e3')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/retention pruned them/)).toBeInTheDocument(),
    );
  });

  it('never asks for samples when nothing was captured', async () => {
    captureStatus.mockResolvedValue({ samples: 0, profile_json: '' });
    render(<StudioColumn summary={ingress('e4')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/No delivery to show/)).toBeInTheDocument(),
    );
    expect(captureSamples).not.toHaveBeenCalled();
  });
});

/**
 * §4.4 — a number that cannot be computed must say WHY, not show a zero.
 *
 * "A rule that never fires and a rule that cannot fire look identical until you
 * count them." Here neither can be counted, because redaction removed the values
 * the rules match on — and that is a different fact from "it never fired".
 */
describe('the studio column — what it throws away', () => {
  beforeEach(() => {
    captureStatus.mockReset();
    captureSamples.mockReset();
    draftMapping.mockReset();
    captureSamples.mockResolvedValue({ total: 0, bodies_json: [] });
    captureStatus.mockResolvedValue({
      samples: 214,
      profile_json: JSON.stringify({ samples: 214, paths: {} }),
    });
    draftMapping.mockResolvedValue({
      ok: true,
      error: '',
      abstained: '',
      field_abstentions: [],
      coverage_json: JSON.stringify({ Samples: 214, MappedPaths: [], UnmappedPaths: [] }),
      spec_json: JSON.stringify({
        stream: 'quakes',
        discards: [{ name: 'Test events from the sandbox feed', path: '/properties/net', equals: 'us_test' }],
      }),
    });
  });

  it('names redaction as the reason the discard count is missing', async () => {
    render(<StudioColumn summary={ingress('d1')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    // The button renders immediately but stays disabled until the capture count
    // arrives — clicking before then is a silent no-op, so wait for enabled.
    const propose = await screen.findByText('Propose a mapping');
    await waitFor(() => expect(propose.closest('button')).toBeEnabled());
    fireEvent.click(propose);

    await waitFor(() =>
      expect(
        screen.getByText(/“Test events from the sandbox feed”/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/How often each rule has fired cannot be counted here/),
    ).toBeInTheDocument();
    // The mechanism, not a shrug: the values the rule matches on are gone.
    // getAllBy — the evidence pane makes the same point beside the payload, and
    // it belongs in both places: one explains a missing number, the other
    // explains a token an operator would otherwise read as a literal.
    expect(
      screen.getAllByText(/redacted before they are stored/).length,
    ).toBeGreaterThan(0);
  });

  it('offers both decisions, and says accepting arms nothing', async () => {
    render(<StudioColumn summary={ingress('d2')} status={status()} readOnly={false} onChanged={() => {}} onOpenPanel={() => {}} />);
    const propose = await screen.findByText('Propose a mapping');
    await waitFor(() => expect(propose.closest('button')).toBeEnabled());
    fireEvent.click(propose);

    // The sticky bar carries the one next action; the header carries the
    // terminal one. Neither is a peer of the other, which is why they are not
    // side by side.
    await waitFor(() =>
      expect(screen.getByText('Accept & dry run')).toBeInTheDocument(),
    );
    expect(screen.getByText('Discard this draft')).toBeInTheDocument();
    // The header carries the design's standing claim about who acts, rather
    // than a per-button caption: saving is not something the drafter can do.
    expect(
      screen.getByText(/saving, arming and promoting are human actions/),
    ).toBeInTheDocument();

    // Discarding is terminal, so it asks for a reason rather than confirming —
    // what makes it safe is the recorded reason, not a second click.
    fireEvent.click(screen.getByText('Discard this draft'));
    await waitFor(() =>
      expect(screen.getByText(/Discarding is terminal/)).toBeInTheDocument(),
    );
    expect(screen.getByText('Discard permanently')).toBeDisabled();
  });
});
