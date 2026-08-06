import type { MappingSpec, ValueSource } from "./mappingTypes";
import { SectionLabel } from "./MappingReviewView";

/**
 * What this mapping will write, read straight off the saved spec.
 *
 * # Why this exists
 *
 * The mapping stage rendered rows only from a COVERAGE report, which only a
 * draft made in the current browser session produces. So a mapping that arrived
 * any other way — restored on reload, or drafted on the operator's behalf when
 * they confirmed the stage — displayed nothing at all. The question "what will
 * this actually save to my knowledge base" could only be answered by reading
 * Postgres, and a mapping that keyed observations on a longitude and stored a
 * temperature as text was armed because nobody could see it.
 *
 * Coverage answers a different question, and a good one: what did the mapping
 * IGNORE. This answers what it does. They are not substitutes, which is why
 * this renders whenever there is a spec and coverage renders when there is one.
 *
 * # The shape follows the sentence
 *
 * A mapping says: every delivery becomes an EVENT of some type, stamped at some
 * time, about some entity, carrying these facts. Rendering it in that order
 * lets an operator check it by reading rather than by decoding JSON — and the
 * defects worth catching are all visible in that reading. A predicate called
 * `has_observation`, a temperature typed `text`, an entity keyed on `/longitude`
 * are each obviously wrong in a sentence and easy to miss in a spec.
 */
export function MappingSummary({ spec }: { spec: MappingSpec | null }) {
  if (!spec) return null;

  const obs = spec.observations ?? [];
  const roles = Object.entries(spec.roles ?? {});

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel note="read this before arming: it is what reaches your knowledge base">
        What this mapping writes
      </SectionLabel>

      <dl className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 text-[11.5px] leading-[1.6]">
        <Line term="Each delivery becomes">
          <strong className="font-medium text-[var(--fg-primary)]">
            {describe(spec.event_type) || "an event with no declared type"}
          </strong>
          {spec.stream ? <> on stream {mono(spec.stream)}</> : null}
        </Line>

        <Line term="Timed by">
          {spec.occurred_at ? (
            mono(describe(spec.occurred_at))
          ) : (
            /* Not decoration: with no occurred_at the substrate cannot answer a
               question about WHEN, and a bi-temporal store that stamps
               everything with ingest time is silently lying about history. */
            <span className="text-[var(--status-warn)]">
              nothing — every fact will be stamped with its arrival time, not the
              time it describes
            </span>
          )}
        </Line>

        <Line term="Deduplicated on">
          {spec.source_event_ref ? (
            mono(describe(spec.source_event_ref))
          ) : (
            <span className="text-[var(--status-warn)]">
              nothing — re-reading the same record writes it again every time
            </span>
          )}
        </Line>

        {roles.length > 0 && (
          <Line term={roles.length === 1 ? "About" : "Participants"}>
            {roles.map(([name, src], i) => (
              <span key={name}>
                {i > 0 ? ", " : ""}
                {name} = {mono(describe(src))}
              </span>
            ))}
          </Line>
        )}
      </dl>

      <SectionLabel note="one row per fact this mapping asserts">
        {obs.length === 0 ? "It records no facts" : `Facts recorded (${obs.length})`}
      </SectionLabel>

      {obs.length === 0 ? (
        <p className="text-[11.5px] leading-[1.6] text-[var(--status-warn)]">
          This mapping writes events but no observations, so nothing in the
          payload becomes queryable. Say what you want recorded in the box above.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {obs.map((o, i) => (
            <li
              key={i}
              className="flex flex-wrap items-baseline gap-x-2 rounded-md bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11.5px]"
            >
              <span className="font-medium text-[var(--fg-primary)]">
                {o.predicate || "(no predicate)"}
              </span>
              <span className="text-[var(--fg-secondary)]">from {mono(describe(o.value))}</span>
              <ValueTypeChip observation={o} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The type a fact is stored as, called out rather than buried.
 *
 * `text` on something numeric is the difference between a temperature you can
 * average and a string you cannot, and it is the cheapest mistake for a drafter
 * to make — coercing to text is how a draft slips past a type check it could
 * not otherwise satisfy.
 */
function ValueTypeChip({ observation }: { observation: { value_type?: string } }) {
  const t = observation.value_type ?? "";
  if (t === "") return null;
  const numericPath = t === "number";
  return (
    <span
      className="rounded-full px-1.5 py-px text-[10.5px] tint-wash"
      style={
        {
          "--tint": numericPath ? "var(--accent-bg)" : "var(--fg-muted)",
        } as React.CSSProperties
      }
    >
      {t}
    </span>
  );
}

function Line({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-[var(--fg-muted)]">{term}</dt>
      <dd className="text-[var(--fg-secondary)]">{children}</dd>
    </div>
  );
}

function mono(s: string) {
  return <span className="font-mono text-[var(--fg-primary)]">{s}</span>;
}

/** A value source as the operator would say it: a constant, or where it comes from. */
function describe(src: ValueSource | undefined): string {
  if (!src) return "";
  if (src.const !== undefined) return String(src.const);
  return src.path ?? "";
}
