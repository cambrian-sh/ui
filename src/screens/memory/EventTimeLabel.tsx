import type { EventTimeFields } from '@/ipc/types';
import { describeEventTime } from '@/lib/eventTime';

/**
 * A hit's or citation's event time (ADR-0134), at its precision, with a subtle
 * source label when the caller did not state it.
 *
 * Renders nothing when the kernel sent no time — "unknown" is not a date, and a
 * pre-0099 kernel sends none. An `ingest_default` time is the ingest clock, so
 * it is prefixed "ingested" rather than presented as when the content happened.
 */
export function EventTimeLabel({ time }: { time: EventTimeFields }) {
  const d = describeEventTime(time);
  if (!d) return null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] text-[var(--fg-muted)]">
      <time dateTime={d.iso} title={d.isIngestTime ? 'Ingest time' : 'When this happened'}>
        {d.isIngestTime ? `ingested ${d.text}` : d.text}
      </time>
      {d.sourceLabel && !d.isIngestTime && (
        <span className="italic">· {d.sourceLabel}</span>
      )}
      {d.isIngestTime && <span className="italic">· date unknown</span>}
    </span>
  );
}
