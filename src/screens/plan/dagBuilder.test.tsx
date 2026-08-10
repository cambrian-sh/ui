import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DagBuilder } from './DagBuilder';
import { previewRoute, routeAdvice, routeSummary } from './routePreview';
import { clearPlanDraft, setPlanDraft } from './planDraft';
import type { AgentSummary, AuthoredStep } from '@/ipc/types';

function agent(id: string, capabilities: string[], trust = 0.7): AgentSummary {
  return {
    id,
    trait: 'Cognitive',
    scope_summary: '',
    trust_score: trust,
    last_activity_at: new Date().toISOString(),
    last_state: 'ready',
    capabilities,
  };
}

/** Add a capability through the inspector's chip field. */
function addCapability(name: string) {
  const field = screen.getByLabelText('Add a required capability');
  fireEvent.change(field, { target: { value: name } });
  fireEvent.keyDown(field, { key: 'Enter' });
}

beforeEach(() => clearPlanDraft());

describe('routePreview', () => {
  const fleet = [
    agent('retriever-2', ['research', 'analysis'], 0.81),
    agent('analyst', ['analysis'], 0.64),
    agent('calculator', ['calculation'], 0.76),
    agent('llm:deepseek', []), // a model entry is not a routing candidate
  ];

  it('is exact set containment, matching the kernel L1 gate', () => {
    // `research` alone: only retriever-2 declares it.
    expect(previewRoute(fleet, ['research']).eligible.map((a) => a.id)).toEqual(['retriever-2']);
    // `analysis` alone: two declare it.
    expect(previewRoute(fleet, ['analysis']).eligible.map((a) => a.id)).toEqual([
      'retriever-2',
      'analyst',
    ]);
  });

  it('requires ALL capabilities on one agent, not spread across the fleet', () => {
    // Both are declared by somebody, but no single agent declares both.
    const r = previewRoute(fleet, ['analysis', 'calculation']);
    expect(r.unmatched).toBeNull();
    expect(r.eligible).toHaveLength(0);
    expect(routeAdvice(r, ['analysis', 'calculation'])).toMatch(/no single agent/i);
  });

  it('names the capability nothing declares — that is what turns a card red', () => {
    const r = previewRoute(fleet, ['teleportation']);
    expect(r.unmatched).toBe('teleportation');
    expect(routeAdvice(r, ['teleportation'])).toMatch(/nothing declares "teleportation"/i);
  });

  it('excludes agents that declare nothing, so a model is never a candidate', () => {
    expect(previewRoute(fleet, []).eligible.map((a) => a.id)).not.toContain('llm:deepseek');
  });

  it('warns when a single eligible agent leaves the cascade nowhere to go', () => {
    const r = previewRoute(fleet, ['calculation']);
    expect(r.eligible).toHaveLength(1);
    expect(routeAdvice(r, ['calculation'])).toMatch(/nothing to escalate to/i);
  });

  it('never claims WHICH agent goes first — merit is not reproducible here', () => {
    const r = previewRoute(fleet, ['analysis']);
    const summary = routeSummary(r, {});
    expect(summary).toMatch(/merit decides the order/i);
    // It must not name a winner it cannot compute.
    expect(summary).not.toMatch(/retriever-2|analyst/);
  });

  it('names a pinned agent, because that one IS decided here', () => {
    const r = previewRoute(fleet, ['calculation']);
    expect(routeSummary(r, { preferred_agent: 'calculator', agent_pin: 'hard' })).toMatch(
      /pinned to calculator/,
    );
    expect(routeSummary(r, { preferred_agent: 'calculator' })).toMatch(/calculator goes first/);
  });

  it('says eligibility cannot be checked when no agent has reported', () => {
    const r = previewRoute([], ['research']);
    expect(routeAdvice(r, ['research'])).toMatch(/no agent has reported/i);
  });
});

describe('DagBuilder', () => {
  it('starts with one step and reports it as not yet routable', () => {
    render(<DagBuilder />);
    // With no fleet in the projection, eligibility is unknown rather than false.
    expect(screen.getByText(/no agent has reported/i)).toBeInTheDocument();
  });

  it('adds and removes required capabilities as chips', () => {
    render(<DagBuilder />);
    addCapability('file_read');
    expect(screen.getAllByText(/file_read/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /remove file_read/i }));
    expect(screen.queryByText('file_read')).not.toBeInTheDocument();
  });

  it('carries a dependency as text, not only as a drawn rail', () => {
    render(<DagBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    // Step 02 is selected; depend it on 01.
    fireEvent.click(screen.getByRole('button', { name: '01' }));
    expect(screen.getByText('waits on 01')).toBeInTheDocument();
  });

  it('offers no self-dependency, so a cycle cannot be drawn', () => {
    render(<DagBuilder />);
    // The only step is 01 and it is selected — it must not offer itself.
    const dependsOn = screen.getByText('Depends on').parentElement!;
    expect(within(dependsOn).queryByRole('button', { name: '01' })).not.toBeInTheDocument();
  });

  it('pinning warns, and preferring does not', () => {
    render(<DagBuilder />);
    fireEvent.click(screen.getByRole('radio', { name: /prefer an agent/i }));
    expect(screen.getByText(/a crash cascades normally/i)).toBeInTheDocument();
    expect(screen.queryByText(/unless the reason to pin/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /pin it hard/i }));
    expect(screen.getByText(/the step dies if it is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/unless the reason to pin/i)).toBeInTheDocument();
  });

  it('switching from pin to prefer does not leave both set', () => {
    render(<DagBuilder />);
    fireEvent.click(screen.getByRole('radio', { name: /pin it hard/i }));
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'retriever-2' } });
    expect(screen.getByText('hard')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /prefer an agent/i }));
    expect(screen.getByText('soft')).toBeInTheDocument();
    expect(screen.queryByText('hard')).not.toBeInTheDocument();
  });

  // Was: "describes the model field as an override on an inherited value". It is no longer
  // an override — the kernel resolves model choice from what the step declares it needs and
  // does not read `recommended_model` (deprecated in the contract 2026-08-07). The field is
  // kept editable so an authored plan carrying a value round-trips instead of silently
  // losing it, which is exactly why the SCREEN has to say it will not be applied. A control
  // that looks like it changes behaviour and does not is worse than no control.
  it('presents the model field as advisory, not as an override that takes effect', () => {
    render(<DagBuilder />);
    expect(screen.getByText(/inherits the router role/i)).toBeInTheDocument();

    // Still editable, and no longer labelled as an override.
    expect(screen.getByPlaceholderText(/note a model/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/override/i)).not.toBeInTheDocument();

    // The status is stated on the screen, not just in the accessible name.
    expect(screen.getByText(/advisory/i)).toBeInTheDocument();
    expect(screen.getByText(/recorded, not applied/i)).toBeInTheDocument();
    expect(screen.getByText(/saved with the plan but never applied/i)).toBeInTheDocument();

    // And in the accessible name, so it is not a visual-only caveat.
    expect(
      screen.getByLabelText(/advisory, the kernel does not apply it/i),
    ).toBeInTheDocument();
  });

  it('gates both run and dry run behind a reason', () => {
    render(<DagBuilder />);
    expect(screen.getByRole('button', { name: 'Run this plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeDisabled();
  });

  it('fan-out defaults to the -1 sentinel, so step 01 is not a fan-out source', () => {
    render(<DagBuilder />);
    const select = screen.getByLabelText('Fan out over') as HTMLSelectElement;
    // -1, not 0 — emitting 0 for "absent" would fan every step out over the first.
    expect(select.value).toBe('-1');
    expect(screen.queryByText(/fans out/i)).not.toBeInTheDocument();
  });

  it('warns when a fan-out source is not also a dependency', () => {
    render(<DagBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    // Step 02 fans out over 01 without depending on it.
    fireEvent.change(screen.getByLabelText('Fan out over'), { target: { value: '0' } });
    expect(screen.getByText(/may run before that output exists/i)).toBeInTheDocument();
  });

  it('opens a proposal handed over from chat', () => {
    const steps: AuthoredStep[] = [
      {
        query: 'Find every refund record in Q2',
        required_capabilities: ['research'],
        depends_on: [],
        max_energy: 0,
        recommended_model: '',
        checkpoint_after: false,
        checkpoint_query: '',
        is_thought: false,
        preferred_agent: '',
        agent_pin: '',
        fan_out_over: -1,
        fan_out_var: '',
      },
    ];
    setPlanDraft({ title: 'Duplicate refunds, Q2', steps });

    render(<DagBuilder />);
    expect(screen.getByDisplayValue('Duplicate refunds, Q2')).toBeInTheDocument();
    // The query shows on the card AND in the inspector, so both are expected.
    expect(screen.getAllByText('Find every refund record in Q2').length).toBeGreaterThan(0);
  });

  it('consumes the draft once, so revisiting does not resurrect it', () => {
    setPlanDraft({ title: 'One shot', steps: [] });
    const first = render(<DagBuilder />);
    expect(first.getByDisplayValue('One shot')).toBeInTheDocument();
    first.unmount();

    // Revisiting the builder must NOT reopen a proposal the operator already
    // dealt with — the slot was emptied when it was taken.
    const second = render(<DagBuilder />);
    expect(second.getByDisplayValue('Untitled plan')).toBeInTheDocument();
  });
});
