import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DiscoverySession } from '@/ipc/types';

const startDiscovery = vi.fn();
const acceptDiscovery = vi.fn();
const answerDiscovery = vi.fn();
const approveOrigin = vi.fn();
const getDiscovery = vi.fn();
const commentDiscovery = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    studioStartDiscovery: (...a: unknown[]) => startDiscovery(...a),
    studioAcceptDiscovery: (...a: unknown[]) => acceptDiscovery(...a),
    studioAnswerDiscovery: (...a: unknown[]) => answerDiscovery(...a),
    studioApproveOrigin: (...a: unknown[]) => approveOrigin(...a),
    studioGetDiscovery: (...a: unknown[]) => getDiscovery(...a),
    studioCommentDiscovery: (...a: unknown[]) => commentDiscovery(...a),
  },
}));

import { DiscoverSource, parseOrigin } from './DiscoverSource';

function session(over: Partial<DiscoverySession> = {}): DiscoverySession {
  return {
    ok: true, error: '', session_id: 'disc-1', outcome: 'proposed', reason: '',
    findings: [], gaps: [], questions: [], proposal: null,
    pending_origins: [], requests_used: 1, model_calls_used: 0,
    running: false, steps: [],
    ...over,
  };
}

describe('creating an ingress from a sentence and an endpoint', () => {
  beforeEach(() => {
    startDiscovery.mockReset();
    acceptDiscovery.mockReset();
    answerDiscovery.mockReset();
    approveOrigin.mockReset();
    commentDiscovery.mockReset();
  });

  it('asks for what you want and where it is, and nothing else', () => {
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    expect(screen.getByLabelText('What do you want from this source?')).toBeInTheDocument();
    expect(screen.getByLabelText('Endpoint')).toBeInTheDocument();
    // The claim that makes an operator willing to paste a URL in: this only
    // ever fetches.
    expect(screen.getByText(/never writes to the source/)).toBeInTheDocument();
  });

  it('renders an inferred value as a candidate WITH its basis', async () => {
    // The failure this prevents: "every 60 s" reading as a fact when it came
    // from a cache header, which is a freshness lifetime and not a stated
    // update frequency.
    startDiscovery.mockResolvedValue(session({
      findings: [{
        field: 'cadence_seconds', proposed_value: '60', status: 'inferred',
        confidence: 0.6, rule_id: 'cadence.cache-control',
        evidence_refs: ['disc-1/ev-1'],
        explanation: 'From Cache-Control: max-age=60. That is a cache freshness lifetime, not a stated update frequency.',
        observed_at: '', bounds_min: 30, bounds_max: 240,
      }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() => expect(screen.getByText(/inferred/)).toBeInTheDocument());
    expect(screen.getByText(/cache freshness lifetime/)).toBeInTheDocument();
    // Bounds, so the candidate has a shape rather than a number.
    expect(screen.getByText(/between 30 and 240/)).toBeInTheDocument();
    // And it is traceable: rule plus evidence.
    expect(screen.getByText(/cadence.cache-control/)).toBeInTheDocument();
  });

  it('renders an observed value as fact', async () => {
    startDiscovery.mockResolvedValue(session({
      findings: [{
        field: 'auth', proposed_value: 'auth_not_observed', status: 'observed',
        confidence: 0, rule_id: 'auth.not-observed', evidence_refs: ['disc-1/ev-1'],
        explanation: 'No authentication challenge was seen.',
        observed_at: '', bounds_min: 0, bounds_max: 0,
      }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));
    await waitFor(() => expect(screen.getByText('observed')).toBeInTheDocument());
  });

  it('separates a refusal from an open gap', async () => {
    // A gap is a question somebody can answer. A refusal is something this
    // deployment cannot do at all — showing them the same way sends an operator
    // hunting for a setting that does not exist.
    startDiscovery.mockResolvedValue(session({
      gaps: [
        { field: 'pagination', why: 'This source paginates through a Link header, which the poller cannot follow.', refusal: true },
        { field: 'cadence_seconds', why: 'Nothing observed says how often this changes.', refusal: false },
      ],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() =>
      expect(screen.getByText(/This deployment cannot ingest that/)).toBeInTheDocument(),
    );
    expect(screen.getByText('Still open')).toBeInTheDocument();
  });

  it('treats abstention as a real answer, not a failure', async () => {
    // A session that stopped rather than guess said something true. Rendering
    // it as an error teaches an operator to distrust the one honest outcome.
    startDiscovery.mockResolvedValue(session({
      outcome: 'abstained',
      reason: 'the source states no cadence and nothing else grounds one',
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() =>
      expect(screen.getByText('Cambrian stopped rather than guess')).toBeInTheDocument(),
    );
    expect(screen.getByText(/states no cadence/)).toBeInTheDocument();
  });

  it('marks a question phrased from what the source said', async () => {
    // Provenance. "Paste your token here" must never read as if Cambrian
    // composed it.
    startDiscovery.mockResolvedValue(session({
      questions: [{
        id: 'q1', shape: 'choice', prompt: 'Which ordering does this array use?',
        options: ['lon, lat, depth'], path: 'geometry.coordinates', status: 'open',
        asked_at_revision: 0, version: 0, from_untrusted: true, auth_scheme_ref: '',
      }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() =>
      expect(screen.getByText(/treat its\s+wording as a claim, not as instruction/)).toBeInTheDocument(),
    );
  });

  it('never offers to type a secret into this screen', async () => {
    // The value goes straight to the credential service. A field here would put
    // it through the conversation, the model context and the logs.
    startDiscovery.mockResolvedValue(session({
      questions: [{
        id: 'q1', shape: 'secret', prompt: 'This source requires a bearer token.',
        options: [], path: '', status: 'open', asked_at_revision: 0, version: 0,
        from_untrusted: true, auth_scheme_ref: 'auth:bearer',
      }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() =>
      expect(screen.getByText(/never through this\s+screen/)).toBeInTheDocument(),
    );
  });

  it('blocks accept while a decision is open', async () => {
    startDiscovery.mockResolvedValue(session({
      questions: [{
        id: 'q1', shape: 'choice', prompt: 'which?', options: ['a'], path: 'x',
        status: 'open', asked_at_revision: 0, version: 0, from_untrusted: false,
        auth_scheme_ref: '',
      }],
      proposal: {
        revision: 1, archetype: 'poller', protocol: 'http', format: 'json',
        cadence_seconds: 60, collection_root: '/items', cursor_path: '',
        cursor_param: '', auth_scheme_ref: '', cadence_because: '',
      },
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() => expect(screen.getByText('Accept and start capturing')).toBeInTheDocument());
    expect(screen.getByText('Accept and start capturing')).toBeDisabled();
    expect(screen.getByText(/each one changes what gets stored/)).toBeInTheDocument();
  });

  it('accepts a proposal and says what that did and did not do', async () => {
    startDiscovery.mockResolvedValue(session({
      proposal: {
        revision: 1, archetype: 'poller', protocol: 'http', format: 'geojson',
        cadence_seconds: 60, collection_root: '/features', cursor_path: '',
        cursor_param: '', auth_scheme_ref: '', cadence_because: '',
      },
    }));
    acceptDiscovery.mockResolvedValue({ ok: true, error: '', revision: 3 });
    const onChanged = vi.fn();
    render(<DiscoverSource ingressId="usgs" onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() => expect(screen.getByText('Accept and start capturing')).toBeEnabled());
    fireEvent.click(screen.getByText('Accept and start capturing'));

    await waitFor(() => expect(screen.getByText(/transport revision 3/)).toBeInTheDocument());
    // The sentence that keeps the gates legible: saving is not arming.
    expect(screen.getByText(/Nothing is armed/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  // Accept and reject were the only two verbs, and the common case is neither.
  // A proposal came back polling a weather API every five seconds: rejecting it
  // would have thrown away a run that had already asked the operator where they
  // were and been told. The comment goes to the agent as text — nothing in the
  // UI or the plane parses it — because reading "hourly is plenty" and turning
  // it into a number is the agent's job.
  it('sends an objection to the agent without accepting or discarding the run', async () => {
    startDiscovery.mockResolvedValue(session({
      proposal: {
        revision: 1, archetype: 'poller', protocol: 'http', format: 'json',
        cadence_seconds: 5, collection_root: '/hourly', cursor_path: '',
        cursor_param: '', auth_scheme_ref: '', cadence_because: '',
      },
    }));
    commentDiscovery.mockResolvedValue({
      ok: true, error: '', detail: 'passed to the agent — it is revising.',
    });
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() => expect(screen.getByText('Accept and start capturing')).toBeEnabled());
    const box = screen.getByPlaceholderText(/hourly is plenty/);
    fireEvent.change(box, { target: { value: 'every 5 seconds is far too often' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() =>
      expect(commentDiscovery).toHaveBeenCalledWith('usgs', 'disc-1', 'every 5 seconds is far too often'));
    // The proposal they were looking at is still there. A comment is not a
    // reject, and losing the run for one wrong field is the thing this avoids.
    expect(screen.getByText(/records at \/hourly/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/it is revising/)).toBeInTheDocument());
    expect(acceptDiscovery).not.toHaveBeenCalled();
  });

  it('will not send an empty objection', async () => {
    startDiscovery.mockResolvedValue(session({
      proposal: {
        revision: 1, archetype: 'poller', protocol: 'http', format: 'json',
        cadence_seconds: 5, collection_root: '/hourly', cursor_path: '',
        cursor_param: '', auth_scheme_ref: '', cadence_because: '',
      },
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() => expect(screen.getByText('Accept and start capturing')).toBeEnabled());
    // Sending nothing would re-run the agent with nothing to go on, spending the
    // operator's budget to produce the same proposal.
    expect(screen.getByText('Send')).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/hourly is plenty/), { target: { value: '   ' } });
    expect(screen.getByText('Send')).toBeDisabled();
  });

  // A number alone cannot be checked.
  //
  // You were asked "every few minutes, hourly, or once a day", you answered, and
  // the proposal said 10 seconds — with nothing on screen to contradict it. The
  // basis is shown so a wrong number is recognisable by the one person who can
  // recognise it, and its ABSENCE is shown too, because a cadence nobody chose is
  // the case that actually shipped.
  it('shows the cadence in words, with the answer it came from', async () => {
    startDiscovery.mockResolvedValue(session({
      proposal: {
        revision: 1, archetype: 'poller', protocol: 'http', format: 'json',
        cadence_seconds: 3600, collection_root: '/hourly', cursor_path: '',
        cursor_param: '', auth_scheme_ref: '', cadence_because: 'hourly is plenty',
      },
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    // "every 3600s" is not how anybody says an hour.
    await waitFor(() => expect(screen.getAllByText(/hourly/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/3600s/)).toBeNull();
    expect(screen.getByText(/hourly is plenty/)).toBeInTheDocument();
  });

  it('says plainly when nobody chose the cadence', async () => {
    startDiscovery.mockResolvedValue(session({
      proposal: {
        revision: 1, archetype: 'poller', protocol: 'http', format: 'json',
        cadence_seconds: 10, collection_root: '/hourly', cursor_path: '',
        cursor_param: '', auth_scheme_ref: '', cadence_because: '',
      },
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    // This is the openmeteo case: 10 seconds, from nobody.
    await waitFor(() => expect(screen.getByText(/Nobody chose this cadence/)).toBeInTheDocument());
  });

  it('offers a new origin as a decision, never as a step it already took', async () => {
    startDiscovery.mockResolvedValue(session({
      pending_origins: ['https://cdn.example.com:443'],
    }));
    approveOrigin.mockResolvedValue({ ok: true, error: '', detail: 'granted' });
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await waitFor(() =>
      expect(screen.getByText(/a new host is your decision, never Cambrian's/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Allow this host'));
    await waitFor(() => expect(approveOrigin).toHaveBeenCalled());
    // Exact origin — scheme, host AND port — never a domain suffix.
    expect(approveOrigin).toHaveBeenCalledWith(
      'usgs', 'disc-1', 'https', 'cdn.example.com', '443',
    );
  });

  it('surfaces a refusal from the plane verbatim', async () => {
    // Capability refusals name what is missing, and an operator needs to read
    // that rather than "something went wrong".
    startDiscovery.mockResolvedValue(session({
      error: 'sourcediscovery: principal lacks the capability: afsin requires source_discovery.run',
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/feed' } });
    fireEvent.click(screen.getByText('Inspect this source'));
    await waitFor(() =>
      expect(screen.getByText(/source_discovery.run/)).toBeInTheDocument(),
    );
  });
});

describe('origin parsing', () => {
  it('defaults the port by scheme, because an origin is exact', () => {
    expect(parseOrigin('https://cdn.example.com')).toEqual({
      scheme: 'https', host: 'cdn.example.com', port: '443',
    });
    expect(parseOrigin('http://cdn.example.com')).toEqual({
      scheme: 'http', host: 'cdn.example.com', port: '80',
    });
    expect(parseOrigin('https://cdn.example.com:8443')).toEqual({
      scheme: 'https', host: 'cdn.example.com', port: '8443',
    });
  });

  it('refuses something that is not an origin rather than guessing one', () => {
    expect(parseOrigin('cdn.example.com')).toBeNull();
    expect(parseOrigin('')).toBeNull();
  });
});


describe('watching a session while it runs', () => {
  // A discovery session that researches an API takes minutes. Before the loop
  // was made visible the console showed nothing until it finished, so a slow
  // provider and a dead kernel looked exactly the same from here.

  it('shows what it is doing right now, not just what it did', async () => {
    startDiscovery.mockResolvedValue(session({
      running: true,
      outcome: '',
      steps: [
        { n: 1, action: 'fetch_target', summary: 'fetching t1', refusal: '',
          observed_ref: 'disc-1/ev-1', at: '', in_flight: false },
        { n: 2, action: '', summary: 'asking the planner what to do next', refusal: '',
          observed_ref: '', at: '', in_flight: true },
      ],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'https://api.open-meteo.com/v1/forecast' },
    });
    fireEvent.click(screen.getByText('Inspect this source'));

    expect(await screen.findByText(/asking the planner what to do next/i)).toBeTruthy();
    expect(screen.getByText(/fetching t1/i)).toBeTruthy();
    // The evidence reference is shown, so a step can be traced to what it recorded.
    expect(screen.getByText(/disc-1\/ev-1/)).toBeTruthy();
  });

  it('does not claim an outcome while the session is still running', async () => {
    // Saying "Cambrian stopped rather than guess" mid-run would be a lie, and
    // the operator would act on it.
    startDiscovery.mockResolvedValue(session({
      running: true, outcome: '',
      steps: [{ n: 1, action: '', summary: 'asking the planner what to do next',
                refusal: '', observed_ref: '', at: '', in_flight: true }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'https://api.open-meteo.com/v1/forecast' },
    });
    fireEvent.click(screen.getByText('Inspect this source'));

    expect(await screen.findByText(/asking the planner/i)).toBeTruthy();
    expect(screen.queryByText(/Cambrian has a proposal/i)).toBeNull();
    expect(screen.queryByText(/stopped rather than guess/i)).toBeNull();
  });

  it('shows a refusal as an adaptation, not a failure', async () => {
    // A refused action is recorded, handed back to the planner, and the loop
    // continues. The console should show the loop adapting.
    startDiscovery.mockResolvedValue(session({
      running: true, outcome: '',
      steps: [{
        n: 1, action: 'probe_parameters', summary: 'probing t1 with api_key',
        refusal: 'api_key looks like a credential — request one with request_credential instead',
        observed_ref: '', at: '', in_flight: false,
      }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'https://example.com/' },
    });
    fireEvent.click(screen.getByText('Inspect this source'));

    expect(await screen.findByText(/looks like a credential/i)).toBeTruthy();
  });
});
