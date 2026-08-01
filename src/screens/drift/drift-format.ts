import type { Alert, AlertCitation, RetentionRunEvent } from '@/ipc/types';

/**
 * Derivations for the drift surfaces.
 *
 * Everything here exists because the alternative was a hardcoded literal, and on
 * this screen a hardcoded literal is a defect rather than a shortcut: the marker
 * run, the delta sentence and the reason copy all have to follow the data or the
 * page argues for an invariant it then breaks in its own markup.
 */

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

/**
 * The evidence, split into the three roles the inspector renders.
 *
 * Derived from `kind` and position rather than assumed by index, because an
 * alert with no earlier dates has no `[3]` at all and an inspector that assumed
 * one would render a marker pointing at nothing.
 */
export interface EvidenceGroups {
  /** `[1]` — the promise, as quoted from the message. */
  promise?: AlertCitation;
  /** `[2]` — the record as it currently stands. */
  record?: AlertCitation;
  /** `[3..n]` — every earlier DISTINCT recorded date, with the day it was written. */
  history: AlertCitation[];
}

/**
 * Split an alert's citations into promise / current record / earlier dates.
 *
 * The contract (DRIFT-02 §3) is `[1]` message, `[2]` current record, `[3..n]`
 * superseded records. This reads that off the array rather than trusting the
 * indices to be exactly 1, 2, 3… — the invariant the page depends on is that
 * markers are contiguous, and a defensive read here means a lane that ever
 * broke it degrades to fewer cards instead of a mis-attributed quote.
 */
export function groupEvidence(citations: readonly AlertCitation[]): EvidenceGroups {
  const ordered = [...citations].sort((a, b) => a.index - b.index);
  const promise = ordered.find((c) => c.kind === 'message');
  const records = ordered.filter((c) => c.kind === 'record');
  const [record, ...history] = records;
  return { promise, record, history };
}

/** One run of an alert's sentence: plain prose, or a marker with its citation. */
export type CitedSegment =
  | { kind: 'text'; text: string }
  | { kind: 'marker'; index: number; citation: AlertCitation }
  /**
   * A marker in the text with no citation behind it.
   *
   * Rendered as PLAIN TEXT rather than as a superscript, deliberately. The page
   * argues that every marker has a citation an operator can follow; drawing an
   * unfollowable one in citation styling would break that claim in the one place
   * it is most visible. This is the case a hardcoded `[3][4]` produced during
   * review on two alerts out of three.
   */
  | { kind: 'orphan'; index: number; text: string };

const MARKER = /\[(\d+)\]/g;

/**
 * Parse an alert's `text` into segments, resolving each `[n]` against the
 * citations it actually has.
 *
 * The marker run is DERIVED here and nowhere else. Nothing downstream may emit a
 * literal `[3]`.
 */
export function parseCitedText(text: string, citations: readonly AlertCitation[]): CitedSegment[] {
  const byIndex = new Map(citations.map((c) => [c.index, c]));
  const out: CitedSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MARKER)) {
    const at = match.index ?? 0;
    if (at > cursor) out.push({ kind: 'text', text: text.slice(cursor, at) });
    const index = Number(match[1]);
    const citation = byIndex.get(index);
    out.push(
      citation
        ? { kind: 'marker', index, citation }
        : { kind: 'orphan', index, text: match[0] },
    );
    cursor = at + match[0].length;
  }

  if (cursor < text.length) out.push({ kind: 'text', text: text.slice(cursor) });
  return out;
}

/**
 * Citations carrying no marker in the sentence.
 *
 * The other half of the invariant. These are still evidence and still render as
 * cards — dropping them would hide the thing an operator takes to a supplier —
 * but their absence from the prose is worth knowing about, so the inspector can
 * say the sentence does not reach them.
 */
export function unanchoredCitations(
  text: string,
  citations: readonly AlertCitation[],
): AlertCitation[] {
  const marked = new Set(Array.from(text.matchAll(MARKER), (m) => Number(m[1])));
  return citations.filter((c) => !marked.has(c.index));
}

// ---------------------------------------------------------------------------
// Delta
// ---------------------------------------------------------------------------

/** `+11 d` / `−3 d` / `0 d`. Uses a true minus sign, not a hyphen. */
export function formatDelta(days: number): string {
  if (days > 0) return `+${days} d`;
  if (days < 0) return `−${Math.abs(days)} d`;
  return '0 d';
}

/**
 * Which alarm tone a delta carries.
 *
 * Positive is `err`: the record is LATER than promised, which is the direction a
 * customer feels. Negative is `warn` — a disagreement worth knowing about, rarely
 * urgent. They are never the same colour, and never the same sentence.
 */
export function deltaTone(days: number): 'err' | 'warn' | 'idle' {
  if (days > 0) return 'err';
  if (days < 0) return 'warn';
  return 'idle';
}

/** The sentence under the three-cell date strip. Changes with the sign. */
export function deltaNote(days: number): string {
  if (days > 0) {
    return 'The record is LATER than the promise — this is the direction that hurts a customer.';
  }
  if (days < 0) {
    return 'The record is EARLIER than the promise — rarely urgent, still a disagreement worth knowing about.';
  }
  return 'The two agree on the day. This alert was raised on something other than the date.';
}

// ---------------------------------------------------------------------------
// The five unresolved reasons
// ---------------------------------------------------------------------------

/**
 * What each unresolved reason means, and WHOSE PROBLEM it is.
 *
 * The owner tag is the point of this table. An operator who cannot tell "your
 * exporter is misconfigured" from "someone promised against a phantom order"
 * reads both as noise and stops looking — and two reasons at the same count are
 * completely different work, one an integration ticket this week and the other a
 * naming decision.
 *
 * These strings are the console handoff's set, which cites the proto
 * (`GetDriftStatsResponse.unresolved`). The product handoff lists three
 * different names for the same slots; that disagreement is unsettled and is a
 * kernel ask, so an unknown key must degrade rather than disappear — see
 * {@link describeReason}.
 */
export const UNRESOLVED_REASONS: Record<string, { owner: string; sentence: string }> = {
  record_not_found: {
    owner: 'your ERP export',
    sentence:
      'A promise names an order the export has never carried. Either the export is stale, or someone committed against a phantom order — and those are worth telling apart.',
  },
  record_older_than_commitment: {
    owner: 'changed-rows-only export',
    sentence:
      'The record predates the promise, so there is nothing newer to compare against. Almost always an exporter that only sends changed rows — one full push clears the lot.',
  },
  ambiguous_match: {
    owner: 'counterparty naming',
    sentence:
      'The reference matched more than one record and the lane refuses to guess. Mostly "Acme" vs "Acme Corp" vs "ACME Ltd" — an alias, not a code change.',
  },
  record_missing_promised_date: {
    owner: 'field mapping',
    sentence:
      'The record exists but carries no date in the field the lane reads. A mapping fix, not a data fix.',
  },
  no_record_reference: {
    owner: "nobody's fault",
    sentence:
      'A date was promised with no order named at all. Detection worked; there was simply nothing to reconcile against.',
  },
  /**
   * The only reason in this table whose owner is US.
   *
   * Every other entry names something on the customer's side — a stale export, a
   * field mapping, a naming alias — and the operator's move is to fix it. This one
   * says the detector could not read the sentence, and there is nothing for the
   * customer to do about it.
   *
   * It is also the reason that carries the precision story. These abstentions are
   * why precision rose from 0.42 to 0.62 on the deceptive corpus: the rows did not
   * disappear, they moved here. Rendering the count is what keeps that trade
   * visible rather than letting it read as a detector that simply got better.
   */
  commitment_uncertain: {
    owner: 'the detector, not your data',
    sentence:
      'A date was found, but the sentence around it reads as a hypothetical, a negation, or quoted correspondence — so it was not treated as a promise. Nothing to fix on your side; this is the deterministic detector declining to guess.',
  },
};

/**
 * Copy for one reason key, including keys this build does not know.
 *
 * An unrecognised reason renders with its raw key and an explicit "this console
 * has no description" line rather than being dropped. A count that vanishes
 * because the vocabulary moved is exactly the silent loss this whole surface
 * exists to prevent, and the two handoffs already disagree on three of the five
 * names.
 */
export function describeReason(reason: string): { owner: string; sentence: string; known: boolean } {
  const known = UNRESOLVED_REASONS[reason];
  if (known) return { ...known, known: true };
  return {
    owner: 'unrecognised',
    sentence:
      'This kernel reports a reason this console has no description for. The count is real; the explanation has not been written here yet.',
    known: false,
  };
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Merge the feed's retention runs with the plane's backfill.
 *
 * Keyed on `(source, run_id)` because the same pass legitimately arrives on both
 * lanes — the feed carries it live, the RPC carries it after a cold connect —
 * and a merge on time alone would double every recent row. Newest first.
 */
export function mergeRetentionRuns(
  ...lanes: readonly (readonly RetentionRunEvent[] | undefined)[]
): RetentionRunEvent[] {
  const byKey = new Map<string, RetentionRunEvent>();
  for (const lane of lanes) {
    for (const run of lane ?? []) byKey.set(`${run.source}:${run.run_id}`, run);
  }
  return [...byKey.values()].sort((a, b) => {
    const at = Date.parse(b.started_at) - Date.parse(a.started_at);
    return Number.isNaN(at) || at === 0 ? b.run_id - a.run_id : at;
  });
}

/**
 * How many of the most recent passes, in an unbroken run from newest, failed.
 *
 * A run rather than a total: one failure that has since recovered is history,
 * while three in a row means retention is CURRENTLY not happening — and only the
 * second needs to be the loudest thing on the page.
 */
export function consecutiveFailures(runs: readonly RetentionRunEvent[]): number {
  let n = 0;
  for (const run of runs) {
    if (!run.error) break;
    n += 1;
  }
  return n;
}

/**
 * How many of the most recent passes, in an unbroken run from newest, hit the cap.
 *
 * One bounded pass is normal. Twelve in a row means the cap is smaller than the
 * arrival rate and the backlog grows no matter how often the pass runs — a
 * capacity warning rather than a status line.
 */
export function consecutiveBounded(runs: readonly RetentionRunEvent[]): number {
  let n = 0;
  for (const run of runs) {
    if (run.error || !run.bounded) break;
    n += 1;
  }
  return n;
}

/** `record_versions 5 000 · push_commands 812`, or "" when nothing was removed. */
export function summariseDeletions(run: RetentionRunEvent): string {
  return run.deleted
    .map((d) => `${d.category} ${formatCount(d.count)}`)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/** The retention horizon, as one of three genuinely different statements. */
export type Horizon =
  /** The source retains `days` days; older history cannot be ingested at all. */
  | { kind: 'bounded'; days: number; value: string; note: string }
  /** No product-imposed limit. */
  | { kind: 'unlimited'; value: string; note: string }
  /** The connector did not report one. NOT the same as "unlimited". */
  | { kind: 'unknown'; value: string; note: string };

/**
 * Read the horizon without collapsing its three states.
 *
 * `-1` is "not reported" and is deliberately distinct from `0` ("retains
 * nothing"); `horizon_unlimited` overrides the number entirely. A console that
 * printed "unknown" as "unlimited" — or as `-1 d` — would be making a recall
 * claim against the wrong denominator, on the one page whose job is stating the
 * denominator accurately.
 *
 * This is also where the design's own mockup was wrong: it drew `90 d · plan
 * tier: pro`, but only `free` is 90 days in the connector's table. Deriving from
 * the reported fields rather than from the tier name is what stops that shipping.
 */
export function describeHorizon(c: {
  retention_horizon_days: number;
  horizon_unlimited: boolean;
}): Horizon {
  if (c.horizon_unlimited) {
    return {
      kind: 'unlimited',
      value: 'no limit',
      note: 'this plan imposes no retention cap',
    };
  }
  if (c.retention_horizon_days < 0) {
    return {
      kind: 'unknown',
      value: 'unknown',
      note: 'the connector did not report one — this is not the same as “no limit”',
    };
  }
  if (c.retention_horizon_days === 0) {
    return {
      kind: 'bounded',
      days: 0,
      value: '0',
      note: 'nothing is retained, so nothing historical can be ingested',
    };
  }
  return {
    kind: 'bounded',
    days: c.retention_horizon_days,
    value: String(c.retention_horizon_days),
    note: 'older history cannot be ingested at all, at any price',
  };
}

/** How stale a record kind's last push is, and what that costs. */
export type PushFreshness = 'fresh' | 'stale' | 'cold';

/**
 * Grade a push by age.
 *
 * The thresholds are deliberately generous: pushes are a customer's exporter on
 * a schedule this console does not know, so anything under a day is unremarkable
 * and only a multi-day gap is worth a colour. What matters is not the boundary
 * but that a stale kind reads as a SILENT HOLE rather than as a timestamp.
 */
export function pushFreshness(iso: string, now: Date = new Date()): PushFreshness {
  if (!iso) return 'cold';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'cold';
  const hours = (now.getTime() - then) / 3_600_000;
  if (hours >= 48) return 'cold';
  if (hours >= 24) return 'stale';
  return 'fresh';
}

/**
 * What a stale kind COSTS, in the operator's terms.
 *
 * `shipments · 2 days ago` is not a timestamp — it is "every promise about
 * shipping dates has been unresolvable since", and that is the sentence the page
 * exists to say.
 */
export function pushConsequence(kind: string, freshness: PushFreshness): string {
  if (freshness === 'fresh') return '';
  const subject = kind.replace(/_/g, ' ');
  return freshness === 'cold'
    ? `every promise about ${subject} has been unresolvable since`
    : `promises about ${subject} may already be unresolvable`;
}

// ---------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------

/** Thin-space thousands, matching the design's `1 284`. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-GB').replace(/,/g, ' ');
}

/** A date, or an em-dash when the kernel sent nothing. */
export function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A clock time, or an em-dash. */
export function formatTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** `14:02 today` / `yesterday` / a date. Relative to `now` for testability. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const days = daysBetween(d, now);
  if (days === 0) {
    return `${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} today`;
  }
  if (days === 1) return 'yesterday';
  return formatDate(iso);
}

/** `4 min ago` / `2 days ago` / `never`. */
export function formatAgo(iso: string, now: Date = new Date()): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const secs = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (secs < 60) return `${secs} s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function daysBetween(a: Date, b: Date): number {
  const day = (d: Date) => Math.floor(new Date(d).setHours(0, 0, 0, 0) / 86_400_000);
  return day(b) - day(a);
}

/**
 * The median detection latency across the alerts on screen.
 *
 * Median rather than mean: one slow outlier should not be able to make a
 * single-digit-millisecond detector look slow, and this number is shown as a
 * proof point.
 */
export function medianLatencyMs(alerts: readonly Alert[]): number | null {
  const values = alerts.map((a) => a.detect_latency_ms).filter((v) => v > 0).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}
