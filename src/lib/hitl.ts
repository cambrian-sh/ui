import type { HITLIntervention, HITLNature } from '@/ipc/types';

/** The kicker above a HITL card. Uppercase, spelled out — never colour alone. */
export const NATURE_LABEL: Record<HITLNature, string> = {
  destructive_command: 'destructive command',
  approval_request: 'approval request',
  dangerous_tool: 'dangerous tool',
};

/**
 * How loudly to draw it.
 *
 * A destructive command is not the same decision as a tool grant: one is
 * reversible by re-running, the other is not reversible at all. `err` is
 * reserved for the irreversible ones so that the tone means something.
 */
export const NATURE_TONE: Record<HITLNature, 'warn' | 'err'> = {
  destructive_command: 'err',
  approval_request: 'warn',
  dangerous_tool: 'warn',
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** First present key, for payloads that name the same thing differently. */
function pick(action: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const hit = asString(action[key]);
    if (hit) return hit;
  }
  return null;
}

export interface Consequence {
  /** One plain-English sentence about what will happen if this is approved. */
  sentence: string;
  /** True when the sentence was derived; false when it is the kernel's reason. */
  derived: boolean;
}

/**
 * What approving this actually does, in a sentence.
 *
 * A HITL card used to render `proposed_action` as minified JSON next to
 * `intended_action` as minified JSON, which asks the operator to diff two blobs
 * to work out what they are agreeing to. The decision they are being asked for
 * is about a consequence, so the card leads with the consequence.
 *
 * The derivation is best-effort by design: `proposed_action` is an open map and
 * the kernel is free to put anything in it. When nothing recognisable is there
 * this falls back to the kernel's own `reason`, which is always populated — and
 * the raw payload stays available verbatim behind a disclosure either way, so
 * nothing here can hide what is really being approved.
 */
export function consequenceOf(intervention: HITLIntervention): Consequence {
  const action = intervention.proposed_action ?? {};

  const tool = pick(action, ['tool', 'tool_name', 'name', 'command']);
  const target = pick(action, ['path', 'file', 'target', 'url', 'resource', 'table']);
  const operation = pick(action, ['operation', 'op', 'verb', 'method', 'action']);

  const step = intervention.step_id ? `Step ${intervention.step_id}` : 'A step';

  if (tool && target) {
    return {
      sentence: `${step} wants to run ${tool} against ${target}.`,
      derived: true,
    };
  }
  if (tool) {
    return {
      sentence: operation
        ? `${step} wants to ${operation} using ${tool}.`
        : `${step} wants to run ${tool}.`,
      derived: true,
    };
  }
  if (target) {
    return {
      sentence: `${step} wants to ${operation ?? 'act on'} ${target}.`,
      derived: true,
    };
  }

  return {
    sentence: intervention.reason || 'This step is waiting for your decision.',
    derived: false,
  };
}

/** How long this has been blocked, in seconds. Idle time is the cost of waiting. */
export function idleSeconds(intervention: HITLIntervention, now = Date.now()): number {
  const raised = new Date(intervention.raised_at).getTime();
  if (!Number.isFinite(raised)) return 0;
  return Math.max(0, Math.round((now - raised) / 1000));
}

/** `40s`, `4m 10s`. Short enough to sit in a card header. */
export function formatIdle(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem ? `${mins}m ${rem}s` : `${mins}m`;
}
