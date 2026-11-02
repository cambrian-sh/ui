import { describe, expect, it } from 'vitest';
import {
  describeEventTime,
  formatEventTime,
  occurredAtFromInput,
  timeSourceLabel,
} from './eventTime';

const JAN12 = Date.UTC(2024, 0, 12); // 2024-01-12T00:00:00Z
const opts = { locale: 'en-GB', timeZone: 'UTC' };

describe('formatEventTime', () => {
  it('renders a day precision as a date, never a clock time', () => {
    const text = formatEventTime(JAN12, 'day', opts);
    expect(text).toContain('2024');
    expect(text).toContain('12');
    expect(text).not.toMatch(/\d{2}:\d{2}/);
  });

  it('reads date-only precisions in UTC, so a west-of-Greenwich zone does not shift the day', () => {
    // Even when the caller pins a zone far west of UTC.
    expect(formatEventTime(JAN12, 'day', { locale: 'en-GB', timeZone: 'America/Los_Angeles' })).toBe(
      formatEventTime(JAN12, 'day', opts),
    );
    expect(formatEventTime(JAN12, 'day', opts)).toMatch(/^12/);
  });

  it('renders year and month precision coarsely', () => {
    expect(formatEventTime(JAN12, 'year', opts)).toBe('2024');
    const month = formatEventTime(JAN12, 'month', opts);
    expect(month).toContain('Jan');
    expect(month).not.toContain('12');
  });

  it('renders instants with a clock time and a named zone', () => {
    const t = Date.UTC(2024, 0, 12, 14, 5, 9);
    expect(formatEventTime(t, 'minute', opts)).toMatch(/14:05/);
    expect(formatEventTime(t, 'minute', opts)).not.toMatch(/14:05:09/);
    expect(formatEventTime(t, 'second', opts)).toMatch(/14:05:09/);
    expect(formatEventTime(t, 'minute', opts)).toMatch(/UTC/);
  });
});

describe('timeSourceLabel', () => {
  it('stays quiet for an explicit time and labels everything else', () => {
    expect(timeSourceLabel('explicit')).toBeNull();
    expect(timeSourceLabel(undefined)).toBeNull();
    expect(timeSourceLabel('ingest_default')).toBe('date unknown, ingested');
    expect(timeSourceLabel('clamped_future')).toBe('claimed future date clamped');
    expect(timeSourceLabel('source_metadata')).toBe('from source metadata');
    expect(timeSourceLabel('inferred')).toBe('inferred');
    // An unknown word is shown, not hidden.
    expect(timeSourceLabel('carbon_dated')).toBe('carbon_dated');
  });
});

describe('describeEventTime', () => {
  it('returns null when the kernel sent no time (a pre-0099 kernel)', () => {
    expect(describeEventTime({})).toBeNull();
    expect(describeEventTime({ event_time_unix_ms: null })).toBeNull();
  });

  it('shows a span only when the end differs at the stated precision', () => {
    const span = describeEventTime(
      {
        event_time_unix_ms: JAN12,
        event_time_end_unix_ms: Date.UTC(2024, 0, 14),
        time_precision: 'day',
        time_source: 'explicit',
      },
      opts,
    )!;
    expect(span.text).toContain('–');
    expect(span.sourceLabel).toBeNull();

    const sameDay = describeEventTime(
      {
        event_time_unix_ms: JAN12,
        event_time_end_unix_ms: JAN12 + 3_600_000,
        time_precision: 'day',
      },
      opts,
    )!;
    expect(sameDay.text).not.toContain('–');
  });

  it('flags the ingest clock as the ingest time', () => {
    const d = describeEventTime({ event_time_unix_ms: JAN12, time_source: 'ingest_default' }, opts)!;
    expect(d.isIngestTime).toBe(true);
    expect(d.sourceLabel).toBe('date unknown, ingested');
  });
});

describe('occurredAtFromInput', () => {
  it('sends a date as its UTC midnight at day precision', () => {
    expect(occurredAtFromInput('date', '2024-01-12')).toEqual({
      occurred_at_unix_ms: JAN12,
      time_precision: 'day',
    });
  });

  it('reads a date-time in the operator zone at minute precision', () => {
    expect(occurredAtFromInput('datetime', '2024-01-12T14:05')).toEqual({
      occurred_at_unix_ms: new Date(2024, 0, 12, 14, 5).getTime(),
      time_precision: 'minute',
    });
  });

  it('sends nothing for an empty or malformed value', () => {
    expect(occurredAtFromInput('date', '')).toBeNull();
    expect(occurredAtFromInput('date', '12/01/2024')).toBeNull();
    expect(occurredAtFromInput('datetime', '2024-01-12')).toBeNull();
  });
});
