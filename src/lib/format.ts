export function formatRelativeTime(iso: string): string {
  if (!iso) return 'Unknown';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'Unknown';

  const now = Date.now();
  const diffMs = now - then;

  if (diffMs < 0) return 'Just now';
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

/** How long a session subject may run before it stops being a heading. */
const SUBJECT_MAX_CHARS = 48;

/**
 * A short heading derived from a session's goal.
 *
 * The kernel's SessionSummaryOp carries `{id, goal, status}` — no subject. The
 * console used to render the raw goal as the title, which meant a 200-character
 * instruction clipped mid-word at every call site.
 *
 * A goal and a subject are different things and the UI needs both: this returns
 * the subject, and the goal is always rendered verbatim beneath it, quoted and
 * clamped. Never show the derived subject *instead of* the goal — derivation is
 * a display convenience, and the operator has to be able to read the exact
 * instruction they gave.
 *
 * The derivation takes the first clause (up to a sentence or clause boundary),
 * caps it, and breaks on a word so nothing is cut mid-word.
 */
export function sessionSubject(goal: string): string {
  const trimmed = (goal ?? '').trim();
  if (!trimmed) return 'Untitled session';

  // First clause: whichever boundary comes first. An em dash is included
  // because instructions are often written "Do X — because Y".
  const boundary = trimmed.search(/[.,;:]\s|\s—\s|\n/);
  let subject = boundary > 0 ? trimmed.slice(0, boundary) : trimmed;

  if (subject.length > SUBJECT_MAX_CHARS) {
    const cut = subject.slice(0, SUBJECT_MAX_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    // Only break on a word when doing so leaves something readable; otherwise a
    // single very long token would collapse the subject to almost nothing.
    subject = (lastSpace > SUBJECT_MAX_CHARS * 0.5 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

/**
 * A token count: `842`, `208k`, `1.4M`.
 *
 * Every "cost" figure in this console is a token count, not money. A completion
 * response carries token counts and never a price — neither OpenAI's nor
 * Anthropic's usage object contains a currency amount — so any `$` this UI drew
 * was a number the console invented from a rate nobody reconciled.
 *
 * That is not a rounding problem, it is a wrong-units problem: cached input,
 * cache writes, reasoning tokens and batch all bill differently, so a single
 * in/out rate would be wrong even with correct numbers. Until there is a real
 * price source — a catalogue reconciled against the provider's own usage API —
 * the honest unit is the one the provider actually reports.
 */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return '0';
  if (tokens < 1_000) return String(Math.round(tokens));
  if (tokens < 1_000_000) {
    const k = tokens / 1_000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
  }
  const m = tokens / 1_000_000;
  return `${m < 10 ? m.toFixed(1) : Math.round(m)}M`;
}

/** `208k tokens`, for places with room for the unit. */
export function formatTokenCount(tokens: number): string {
  return `${formatTokens(tokens)} tokens`;
}

/** `1.4M tok/hr` — a rate, for the header and the spend card. */
export function formatTokenRate(tokensPerHour: number): string {
  return `${formatTokens(tokensPerHour)} tok/hr`;
}

/** `4m 20s`, `41s`, `2h 5m`. Durations are read, not computed with. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return secs % 60 ? `${mins}m ${secs % 60}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  return mins % 60 ? `${hours}h ${mins % 60}m` : `${hours}h`;
}

/**
 * A count for a badge, or `null` when there is nothing to say.
 *
 * A rendered `0` is not the same as an absent badge: a zero badge draws the eye
 * to a thing that is not happening, which is exactly backwards for an inbox.
 * Call sites branch on `null` rather than on `count > 0` so the rule lives in
 * one place.
 */
export function badgeCount(n: number): number | null {
  return Number.isFinite(n) && n > 0 ? n : null;
}
