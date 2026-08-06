import { describe, it, expect } from 'vitest';
import { primaryAction } from './studioStages';
import type { StudioIngress } from '@/ipc/types';

function at(state: string): StudioIngress {
  return { ingress_id: 'x', display_name: 'x', state, health: 'ok', pinned_release: '' };
}

describe('one decision per stage', () => {
  // Getting from samples to armed used to be: accept the draft, confirm the
  // mapping, start the dry run, accept & dry run, arm — five actions, three of
  // them meaning roughly "yes", spread across two panes. The mapping could only
  // be created from Lifecycle & History, which is the last place anyone looks.
  it('names each action by its consequence, never by its transition', () => {
    expect(primaryAction({ summary: at('DRAFT'), abstentions: 0, samples: 0 }).label)
      .toBe('Start capturing');
    expect(primaryAction({ summary: at('CAPTURING'), abstentions: 0, samples: 9 }).label)
      .toBe('Use this mapping');
    expect(primaryAction({ summary: at('MAPPED'), abstentions: 0, samples: 9 }).label)
      .toBe('Try it on live arrivals');
    // Arming says what it will DO. "Arm" alone is a transition name, and the
    // one action whose consequence an operator most needs spelled out.
    expect(primaryAction({ summary: at('DRY_RUN'), abstentions: 0, samples: 9 }).label)
      .toBe('Arm it — it starts writing');
  });

  it('creates the mapping from the stage you are standing in', () => {
    // The whole point of #1: CAPTURING offers the mapping, so nobody has to go
    // to Lifecycle & History to make one.
    const a = primaryAction({ summary: at('CAPTURING'), abstentions: 0, samples: 200 });
    expect(a.kind).toBe('confirm_mapping');
    expect(a.blocked).toBe('');
  });

  it('blocks with the reason rather than hiding the action', () => {
    // A disabled control with its reason attached beats a missing one: an
    // operator has to be able to tell "not yet, because X" from "not a thing".
    const noSamples = primaryAction({ summary: at('CAPTURING'), abstentions: 0, samples: 0 });
    expect(noSamples.blocked).toMatch(/cannot map a source you have not seen/);

    const undecided = primaryAction({ summary: at('CAPTURING'), abstentions: 2, samples: 9 });
    expect(undecided.blocked).toMatch(/2 decisions left/);
  });

  it('offers the reversible action on a live ingress, not another accept', () => {
    expect(primaryAction({ summary: at('ARMED'), abstentions: 0, samples: 9 }).kind).toBe('pause');
    expect(primaryAction({ summary: at('PAUSED'), abstentions: 0, samples: 9 }).kind).toBe('resume');
    // Retired is terminal: offering anything would imply a way back.
    expect(primaryAction({ summary: at('RETIRED'), abstentions: 0, samples: 9 }).kind).toBe('none');
  });
});
