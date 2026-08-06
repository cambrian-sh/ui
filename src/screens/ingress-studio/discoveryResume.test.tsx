/**
 * A running session survives a tab switch.
 *
 * `DiscoverSource` unmounts when the operator visits another tab. Everything it
 * held in `useState` died with it — including a session still running in the
 * kernel — so coming back showed an empty form and a run that was minutes from
 * proposing looked like it had never happened.
 */
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverySession } from '@/ipc/types';

const startDiscovery = vi.fn();
const getDiscovery = vi.fn();
const answerDiscovery = vi.fn();

vi.mock('@/ipc/client', () => ({
  ipc: {
    studioStartDiscovery: (...a: unknown[]) => startDiscovery(...a),
    studioGetDiscovery: (...a: unknown[]) => getDiscovery(...a),
    studioAcceptDiscovery: vi.fn(),
    studioAnswerDiscovery: (...a: unknown[]) => answerDiscovery(...a),
    studioApproveOrigin: vi.fn(),
  },
}));

import { DiscoverSource } from './DiscoverSource';
import { clearDiscoverySessions } from './discoverySession';

function session(over: Partial<DiscoverySession> = {}): DiscoverySession {
  return {
    ok: true, error: '', session_id: 'disc-9', outcome: '', reason: '',
    findings: [], gaps: [], questions: [], proposal: null,
    pending_origins: [], requests_used: 0, model_calls_used: 0,
    running: true, steps: [],
    ...over,
  };
}

const RUNNING = session({
  steps: [{
    n: 1, action: '', summary: 'asking the planner what to do next',
    refusal: '', observed_ref: '', at: '', in_flight: true,
  }],
});

beforeEach(() => {
  clearDiscoverySessions();
  startDiscovery.mockReset();
  getDiscovery.mockReset();
  answerDiscovery.mockReset();
});
afterEach(cleanup);

async function startARun() {
  startDiscovery.mockResolvedValue(RUNNING);
  render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
  fireEvent.change(screen.getByLabelText('Endpoint'), {
    target: { value: 'https://api.open-meteo.com/v1/forecast' },
  });
  fireEvent.click(screen.getByText('Inspect this source'));
  await screen.findByText(/asking the planner/i);
}

describe('a running session survives leaving the tab', () => {
  it('rejoins the run instead of showing an empty form', async () => {
    await startARun();

    // The operator leaves. The kernel keeps going.
    cleanup();
    getDiscovery.mockResolvedValue(session({
      steps: [{
        n: 2, action: 'probe_parameters', summary: 'probing t1 with latitude, longitude',
        refusal: '', observed_ref: 'disc-9/ev-2', at: '', in_flight: true,
      }],
    }));

    // And comes back.
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    expect(await screen.findByText(/probing t1 with latitude/i)).toBeTruthy();
    // Re-fetched, not restored from a stale copy: the step shown is the one the
    // kernel has NOW, not the one on screen when they left.
    expect(screen.queryByText(/asking the planner/i)).toBeNull();
  });

  it('asks the kernel for the remembered session id', async () => {
    await startARun();
    cleanup();
    getDiscovery.mockResolvedValue(session());
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    await waitFor(() => expect(getDiscovery).toHaveBeenCalled());
    expect(getDiscovery.mock.calls[0]).toEqual(['usgs', 'disc-9']);
  });

  it('forgets a session the kernel no longer has, rather than complaining', async () => {
    // Kernel sessions are in-memory, so a restart legitimately drops them. The
    // right answer is an empty form, not an error about a session nobody asked
    // to resume.
    await startARun();
    cleanup();
    getDiscovery.mockResolvedValue(session({ error: 'no session disc-9', ok: false }));

    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    await waitFor(() => expect(getDiscovery).toHaveBeenCalled());
    expect(screen.queryByText(/no session disc-9/i)).toBeNull();
    expect(screen.getByLabelText('Endpoint')).toBeTruthy();
  });

  it('does not resume another ingress\'s session', async () => {
    await startARun();
    cleanup();
    render(<DiscoverSource ingressId="other" onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('Endpoint')).toBeTruthy());
    expect(getDiscovery).not.toHaveBeenCalled();
  });
});

describe('a running session is never a blank panel', () => {
  it('says it is working before the first step exists', async () => {
    // The deterministic probe runs before the loop emits anything, so gating the
    // trace on steps left a running session rendering nothing — which reads as a
    // dead screen, and is exactly when an operator concludes it is broken.
    startDiscovery.mockResolvedValue(session({ running: true, steps: [] }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'https://api.open-meteo.com/v1/forecast' },
    });
    fireEvent.click(screen.getByText('Inspect this source'));

    expect(await screen.findByText(/Inspecting the endpoint/i)).toBeTruthy();
    expect(screen.getByText(/^Working$/)).toBeTruthy();
  });

  it('keeps polling the kernel while the session runs', async () => {
    startDiscovery.mockResolvedValue(session({ running: true, steps: [] }));
    getDiscovery.mockResolvedValue(session({
      running: true,
      steps: [{ n: 1, action: 'fetch_target', summary: 'fetching t1',
                refusal: '', observed_ref: 'disc-9/ev-1', at: '', in_flight: false }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'https://x/feed' },
    });
    fireEvent.click(screen.getByText('Inspect this source'));

    // The step arrives from a poll, not from the start response.
    expect(await screen.findByText(/fetching t1/i, {}, { timeout: 4000 })).toBeTruthy();
  });
});

describe('a long wait reads as working, not stuck', () => {
  it('shows elapsed time and says the agent may be researching', async () => {
    // The agent's whole research phase — every web search and page read — happens
    // inside ONE controller call, so the trace shows a single line for as long as
    // it takes. Measured in a live kernel: tool calls every ~5s for over half a
    // minute, all under one step. Without this the line reads as a hang.
    const startedAt = new Date(Date.now() - 42_000).toISOString();
    startDiscovery.mockResolvedValue(session({
      running: true,
      steps: [{
        n: 1, action: '', summary: 'asking the planner what to do next',
        refusal: '', observed_ref: '', at: startedAt, in_flight: true,
      }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), {
      target: { value: 'https://api.open-meteo.com/v1/forecast' },
    });
    fireEvent.click(screen.getByText('Inspect this source'));

    expect(await screen.findByText(/asking the planner/i)).toBeTruthy();
    expect(screen.getByText(/^4[0-9]s$/)).toBeTruthy();
    expect(screen.getByText(/searching the web and reading documentation/i)).toBeTruthy();
  });

  it('does not claim research on a step that is a real action', async () => {
    startDiscovery.mockResolvedValue(session({
      running: true,
      steps: [{
        n: 1, action: 'fetch_target', summary: 'fetching t1',
        refusal: '', observed_ref: '', at: new Date().toISOString(), in_flight: true,
      }],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/f' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    expect(await screen.findByText(/fetching t1/i)).toBeTruthy();
    expect(screen.queryByText(/searching the web/i)).toBeNull();
  });
});

describe('the agent\'s research reads as subordinate work', () => {
  const withResearch = () => session({
    running: true,
    steps: [
      { n: 1, action: 'agent_tool',
        summary: 'calling firecrawl_search (query=open-meteo forecast parameters)',
        refusal: '', observed_ref: '', at: new Date().toISOString(), in_flight: false },
      { n: 1, action: '', summary: 'asking the planner what to do next',
        refusal: '', observed_ref: '', at: new Date().toISOString(), in_flight: true },
    ],
  });

  it('shows the tool and its arguments', async () => {
    // The arguments are the substance: "searched the web" says nothing an
    // operator can act on; the query is what they are watching for.
    startDiscovery.mockResolvedValue(withResearch());
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/f' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    expect(await screen.findByText(/firecrawl_search/)).toBeTruthy();
    expect(screen.getByText(/query=open-meteo forecast parameters/)).toBeTruthy();
  });

  it('counts turns and tool calls separately', async () => {
    // A single planner call can make six web requests. Counting those as steps
    // would make a two-turn run look like an eight-turn one.
    startDiscovery.mockResolvedValue(session({
      running: false, outcome: 'abstained',
      steps: [
        { n: 1, action: 'fetch_target', summary: 'fetching t1', refusal: '',
          observed_ref: '', at: '', in_flight: false },
        { n: 1, action: 'agent_tool', summary: 'finished firecrawl_search', refusal: '',
          observed_ref: '', at: '', in_flight: false },
        { n: 2, action: 'abstain', summary: 'stopping rather than guessing: x',
          refusal: '', observed_ref: '', at: '', in_flight: false },
      ],
    }));
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/f' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    expect(await screen.findByText(/2 steps, 1 tool call/)).toBeTruthy();
  });

  it('drops the speculative hint once real tool lines are streaming', async () => {
    // "It may be searching the web" beside the actual searches is noise.
    startDiscovery.mockResolvedValue(withResearch());
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/f' } });
    fireEvent.click(screen.getByText('Inspect this source'));

    await screen.findByText(/firecrawl_search/);
    expect(screen.queryByText(/may be searching the web/i)).toBeNull();
  });
});

describe('a question the operator can actually answer', () => {
  // The console could ask and never listen. The render was "secret, or else map
  // the options", and a free_text question HAS no options — so it produced an
  // empty div: the prompt on screen with nothing to reply into. Every question
  // that matters is free text (where you want the data, how fresh it must be),
  // so in practice no question was answerable at all.
  const asking = (over = {}) => session({
    running: true,
    questions: [{
      id: 'q:disc-1:0', shape: 'free_text',
      prompt: 'Which location do you want the forecast for? A city name is fine.',
      options: [], path: 'param.latitude', status: 'open', version: 1,
      asked_at_revision: 1, from_untrusted: true, auth_scheme_ref: '',
      ...over,
    }],
  });

  async function show(s: DiscoverySession) {
    startDiscovery.mockResolvedValue(s);
    render(<DiscoverSource ingressId="usgs" onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'https://x/f' } });
    fireEvent.click(screen.getByText('Inspect this source'));
    await screen.findByText(/Which location do you want/i);
  }

  it('offers somewhere to type the answer', async () => {
    await show(asking());
    const box = screen.getByLabelText(/Which location do you want/i);
    expect(box).toBeTruthy();
    expect(screen.getByText('Answer')).toBeTruthy();
  });

  it('sends what was typed', async () => {
    answerDiscovery.mockResolvedValue({ ok: true, detail: 'recorded', error: '' });
    await show(asking());
    fireEvent.change(screen.getByLabelText(/Which location do you want/i), {
      target: { value: 'Istanbul' },
    });
    fireEvent.click(screen.getByText('Answer'));
    await waitFor(() => expect(answerDiscovery).toHaveBeenCalled());
    expect(answerDiscovery.mock.calls[0]).toContain('Istanbul');
  });

  it('refuses to submit an empty answer', async () => {
    // An empty submission would record "the operator chose nothing" as a choice.
    await show(asking());
    fireEvent.click(screen.getByText('Answer'));
    expect(answerDiscovery).not.toHaveBeenCalled();
  });

  it('still renders choices as buttons', async () => {
    await show(asking({
      shape: 'choice', options: ['hourly', 'daily'],
      prompt: 'Which location do you want the forecast for?',
    }));
    expect(screen.getByText('hourly')).toBeTruthy();
    expect(screen.getByText('daily')).toBeTruthy();
  });

  it('never offers an input for a secret', async () => {
    // The value goes to the credential store, never through this screen.
    await show(asking({ shape: 'secret', auth_scheme_ref: 'auth:bearer' }));
    expect(screen.queryByText('Answer')).toBeNull();
    expect(screen.getByText(/credential store/i)).toBeTruthy();
  });
});
