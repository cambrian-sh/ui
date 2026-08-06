/**
 * The kernel-side shapes the mapping stage reads.
 *
 * These are DTOs the studio marshals as JSON blobs rather than typed proto
 * messages, because the mapping language is premium's and a proto mirror of it
 * would be a second schema to keep in step. Declared once here so the stage and
 * the evidence pane cannot drift into two readings of the same payload.
 */

/** The coverage report the drafter returns beside its proposal (plan D13). */
export interface Coverage {
  Samples?: number;
  MappedPaths?: string[];
  UnmappedPaths?: string[];
  DiscardedPaths?: string[];
  /** observed path → fraction of samples where it was ABSENT. */
  MissRates?: Record<string, number>;
}

/** One path's statistics in the schema profile. */
export interface PathStats {
  present?: number;
  nulls?: number;
  types?: Record<string, number>;
  values?: unknown[];
  max_array_len?: number;
}

export interface SchemaProfile {
  samples?: number;
  paths?: Record<string, PathStats>;
}

/** A named destructive rule. The language refuses an anonymous one at parse time. */
export interface DiscardRule {
  name?: string;
  path?: string;
  equals?: string;
  exists?: boolean;
}

export interface ValueSource {
  path?: string;
  const?: unknown;
}

export interface Observation {
  predicate?: string;
  value?: ValueSource;
  /** How the fact is stored. `text` on a numeric field is the cheap mistake. */
  value_type?: string;
}

export interface MappingSpec {
  stream?: string;
  source_event_ref?: ValueSource;
  occurred_at?: ValueSource;
  event_type?: ValueSource;
  roles?: Record<string, ValueSource>;
  observations?: Observation[];
  discards?: DiscardRule[];
}

export function parseJson<T>(raw: string | undefined): T | null {
  if (!raw || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Which profile paths are the ones a mapping cannot safely guess at.
 *
 * The two amber rows in the evidence pane ARE the two abstentions — the profile
 * and the open questions are the same list, which is the argument for keeping
 * them side by side. This is the function that keeps that claim true rather than
 * coincidental.
 */
export function isFlagged(stats: PathStats | undefined): boolean {
  if (!stats) return false;
  return (
    Object.keys(stats.types ?? {}).length > 1 || (stats.max_array_len ?? 0) > 0
  );
}

/** Source path → target field, read off the proposed spec. */
export function targetsFor(spec: MappingSpec | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!spec) return out;
  const put = (src: unknown, target: string) => {
    if (src && typeof src === "object" && "path" in (src as object)) {
      const p = (src as { path?: string }).path;
      if (p) out.set(p.replace(/^\//, "").replace(/\//g, "."), target);
    }
  };
  put(spec.source_event_ref, "event_ref");
  put(spec.occurred_at, "occurred_at");
  put(spec.event_type, "event_type");
  for (const [role, src] of Object.entries(spec.roles ?? {})) {
    put(src, `role.${role}`);
  }
  for (const o of spec.observations ?? []) {
    put(o.value, o.predicate ?? "observation");
  }
  return out;
}

/**
 * Why a field was ignored, from the profile rather than as a generic sentence.
 *
 * "constant across every delivery" and "absent from most of them" are different
 * facts about the source and lead to different decisions; collapsing both into
 * "not mapped" makes the operator go and look the profile up themselves.
 */
export function ignoredBecause(
  stats: PathStats | undefined,
  present: number | undefined,
): string {
  if (!stats) return "not mapped.";
  const values = stats.values ?? [];
  if (values.length === 1 && present !== undefined) {
    return `constant ${JSON.stringify(values[0])} across all ${present}.`;
  }
  if ((stats.nulls ?? 0) > 0 && present !== undefined && stats.nulls === present) {
    return `null in every one of ${present}.`;
  }
  return "not mapped.";
}
