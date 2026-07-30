import { describe, expect, it } from 'vitest';
import { consequenceOf, formatIdle, idleSeconds } from './hitl';
import type { HITLIntervention } from '@/ipc/types';

function hitl(overrides: Partial<HITLIntervention> = {}): HITLIntervention {
  return {
    intervention_id: 'h1',
    plan_id: 'p1',
    step_id: '04',
    agent_id: 'a1',
    nature: 'dangerous_tool',
    proposed_action: {},
    intended_action: null,
    reason: 'The kernel raised this for review.',
    raised_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('consequenceOf', () => {
  it('names the tool and the thing it would touch', () => {
    const c = consequenceOf(
      hitl({ proposed_action: { tool: 'fs.write', path: '/workspace/notes.md' } }),
    );
    expect(c.sentence).toBe('Step 04 wants to run fs.write against /workspace/notes.md.');
    expect(c.derived).toBe(true);
  });

  it('reads the same fact under any of the names the payload might use', () => {
    // proposed_action is an open map and the kernel is free to key it however
    // the tool does, so the derivation checks several spellings of one idea.
    expect(consequenceOf(hitl({ proposed_action: { tool_name: 'telegram.send' } })).sentence).toContain(
      'telegram.send',
    );
    expect(consequenceOf(hitl({ proposed_action: { command: 'rm -rf /tmp' } })).sentence).toContain(
      'rm -rf /tmp',
    );
    expect(consequenceOf(hitl({ proposed_action: { target: 'customers' } })).sentence).toContain(
      'customers',
    );
  });

  it('falls back to the kernel reason when nothing is recognisable, and says so', () => {
    // The fallback matters more than the happy path: an unrecognised payload
    // must never produce an empty or invented sentence, because the operator is
    // approving a consequence they can only read here.
    const c = consequenceOf(hitl({ proposed_action: { some_future_shape: { a: 1 } } }));
    expect(c.sentence).toBe('The kernel raised this for review.');
    expect(c.derived).toBe(false);
  });

  it('never returns an empty sentence, even with no payload and no reason', () => {
    const c = consequenceOf(hitl({ proposed_action: {}, reason: '' }));
    expect(c.sentence).toBe('This step is waiting for your decision.');
  });
});

describe('idleSeconds / formatIdle', () => {
  it('measures how long the decision has been blocking', () => {
    const raised = new Date(Date.now() - 40_000).toISOString();
    expect(idleSeconds(hitl({ raised_at: raised }))).toBe(40);
  });

  it('reads zero rather than NaN when the timestamp is unusable', () => {
    expect(idleSeconds(hitl({ raised_at: 'not-a-date' }))).toBe(0);
  });

  it('formats short waits in seconds and longer ones in minutes', () => {
    expect(formatIdle(40)).toBe('40s');
    expect(formatIdle(60)).toBe('1m');
    expect(formatIdle(250)).toBe('4m 10s');
  });
});
