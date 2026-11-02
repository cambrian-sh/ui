import type { EventTimeFields } from '@/ipc/types';

/**
 * Event time, rendered honestly (ADR-0134, contract 0099).
 *
 * Three rules this module exists to keep in one place:
 *
 * 1. **Precision is respected.** A `day`-precision time is a date; showing it as
 *    "00:00" invents a clock time nobody stated. `year`/`month`/`day` render as
 *    calendar dates and nothing finer.
 * 2. **Coarse precisions are read in UTC.** The kernel stores every event time as
 *    a UTC instant, and a date-only time is that date's UTC midnight (this
 *    console's ingest form sends exactly that). Rendering it in the operator's
 *    zone would show 11 January for a document dated 12 January anywhere west of
 *    Greenwich. Instants (`hour` and finer) render in the operator's zone, named.
 * 3. **The source is said when it is not the caller's word.** `ingest_default`
 *    is the ingest clock, not when the content happened; `clamped_future` is a
 *    claimed future date the kernel refused. Neither may read like a real date.
 *
 * Never a UI-side clock: every time here came from the kernel.
 */

export type TimePrecision = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

const DATE_ONLY: ReadonlySet<string> = new Set(['year', 'month', 'day']);

/** Options for tests and for callers that must pin the zone. */
export interface FormatOptions {
  /** IANA zone for instant precisions. Defaults to the operator's own zone. */
  timeZone?: string;
  locale?: string;
}

/** Format one kernel event time at its precision. */
export function formatEventTime(
  ms: number,
  precision: string | undefined,
  opts: FormatOptions = {},
): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return 'invalid time';
  const locale = opts.locale;
  switch (precision) {
    case 'year':
      return new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }).format(d);
    case 'month':
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(d);
    case 'day':
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    default: {
      // hour | minute | second, and an empty precision (the kernel's default is
      // second). An hour precision still shows minutes (":00") — "14h" reads worse.
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...(precision === 'second' || !precision ? { second: '2-digit' } : {}),
        timeZone: opts.timeZone,
        timeZoneName: 'short',
      }).format(d);
    }
  }
}

/**
 * The subtle label for a time whose source is not the caller's own statement.
 * Null for `explicit` (and for an absent source on a kernel that sends none).
 */
export function timeSourceLabel(source: string | undefined): string | null {
  switch (source) {
    case undefined:
    case '':
    case 'explicit':
      return null;
    case 'source_metadata':
      return 'from source metadata';
    case 'inferred':
      return 'inferred';
    case 'ingest_default':
      return 'date unknown, ingested';
    case 'clamped_future':
      return 'claimed future date clamped';
    default:
      // A vocabulary word this build does not know: show it rather than hide it.
      return source;
  }
}

export interface EventTimeDisplay {
  /** "12 Jan 2024" or "12 Jan 2024 – 14 Jan 2024". */
  text: string;
  /** Subtle source label, or null when the caller stated the time. */
  sourceLabel: string | null;
  /** ISO instant for a `<time dateTime>` attribute. */
  iso: string;
  /** True when the time is the ingest clock, not when the content happened. */
  isIngestTime: boolean;
}

/**
 * Everything a view needs to render a hit's or citation's event time, or null
 * when the kernel sent none (a pre-0099 kernel): unknown is not a date.
 */
export function describeEventTime(
  t: EventTimeFields,
  opts: FormatOptions = {},
): EventTimeDisplay | null {
  const start = t.event_time_unix_ms;
  if (start == null) return null;
  const startText = formatEventTime(start, t.time_precision, opts);
  let text = startText;
  const end = t.event_time_end_unix_ms;
  if (end != null && end !== start) {
    const endText = formatEventTime(end, t.time_precision, opts);
    // Two parts on the same day at day precision are one date, not a span.
    if (endText !== startText) text = `${startText} – ${endText}`;
  }
  return {
    text,
    sourceLabel: timeSourceLabel(t.time_source),
    iso: new Date(start).toISOString(),
    isIngestTime: t.time_source === 'ingest_default',
  };
}

/** True when a precision renders as a date only. */
export function isDateOnly(precision: string | undefined): boolean {
  return precision != null && DATE_ONLY.has(precision);
}

/**
 * The ingest form's "when did this happen" → the wire (`occurred_at` +
 * `time_precision`).
 *
 * - `date` ("2024-01-12", from `<input type="date">`) → that date's UTC midnight,
 *   precision `day`. A date has no zone; UTC midnight is how the kernel and this
 *   console both represent a date-only time (see rule 2 above).
 * - `datetime` ("2024-01-12T14:05", from `<input type="datetime-local">`) → that
 *   wall-clock time IN THE OPERATOR'S ZONE, precision `minute`. The form names
 *   the zone next to the input, so the conversion is never silent.
 *
 * Returns null for an empty or unparseable value (nothing is sent; the kernel
 * dates the document by its ingest clock).
 */
export function occurredAtFromInput(
  mode: 'date' | 'datetime',
  value: string,
): { occurred_at_unix_ms: number; time_precision: TimePrecision } | null {
  const v = value.trim();
  if (!v) return null;
  if (mode === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(ms) ? null : { occurred_at_unix_ms: ms, time_precision: 'day' };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  // Constructed from parts, not `new Date(string)`, so the local-zone reading is
  // explicit rather than an artefact of how a browser parses ISO-ish strings.
  const ms = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  ).getTime();
  return Number.isNaN(ms) ? null : { occurred_at_unix_ms: ms, time_precision: 'minute' };
}

/** The operator's zone, for the label beside a date-time input. */
export function localTimeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  } catch {
    return 'local time';
  }
}
