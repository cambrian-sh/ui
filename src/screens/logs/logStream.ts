import type { LogFilter, LogLevel, LogRecord } from '@/ipc/types';

/** Level order, for the "at least" floor. */
export const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * The held buffer behind follow mode (`13b`).
 *
 * The fear an operator has about pausing a tail is that pausing loses data. It
 * does not: records keep arriving into this buffer while they read, and the
 * pill says how many are waiting AND how many of them are errors — which is what
 * turns catching up into a decision instead of a reflex.
 *
 * Bounded, and it says so when it overflows rather than dropping silently.
 */
export const HELD_MAX = 5000;

export interface Held {
  records: LogRecord[];
  /** Dropped from the FRONT because the hold overflowed. */
  overflowed: number;
}

export function appendHeld(held: Held, incoming: LogRecord[]): Held {
  if (incoming.length === 0) return held;
  const merged = held.records.concat(incoming);
  if (merged.length <= HELD_MAX) {
    return { records: merged, overflowed: held.overflowed };
  }
  const cut = merged.length - HELD_MAX;
  // Drop the OLDEST: a reader catching up cares about what happened most
  // recently, and the alternative — refusing new records — would make the tail
  // silently stop being live.
  return { records: merged.slice(cut), overflowed: held.overflowed + cut };
}

/** How many of the held records would alarm someone. */
export function errorCount(records: readonly LogRecord[]): number {
  return records.filter((r) => r.level === 'error').length;
}

/**
 * Merge a batch into the stream, de-duplicated on `seq`.
 *
 * History and the tail overlap by design — the console queries, then tails from
 * the sequence it received — and a record arriving twice must not render twice.
 */
export function mergeBySeq(existing: readonly LogRecord[], incoming: readonly LogRecord[]): LogRecord[] {
  if (incoming.length === 0) return existing as LogRecord[];
  const seen = new Set(existing.map((r) => r.seq));
  const added = incoming.filter((r) => !seen.has(r.seq));
  if (added.length === 0) return existing as LogRecord[];
  return existing.concat(added).sort((a, b) => a.seq - b.seq);
}

/**
 * Whether a record passes a filter, client-side.
 *
 * The kernel applies the same filter server-side; this is for the records
 * already on screen when the filter changes, so the view narrows immediately
 * rather than only for what arrives next.
 */
export function matches(r: LogRecord, f: LogFilter): boolean {
  if (f.level_at_least && LEVEL_RANK[r.level] < LEVEL_RANK[f.level_at_least]) return false;
  if (f.components && f.components.length > 0 && !f.components.includes(r.component)) return false;
  if (f.contains && !r.message.toLowerCase().includes(f.contains.toLowerCase())) return false;
  for (const [k, want] of Object.entries(f.attr_equals ?? {})) {
    const attr = r.attrs.find((a) => a.key === k);
    if (!attr || attr.value !== want) return false;
  }
  return true;
}

export interface Facet {
  name: string;
  count: number;
  /** The worst level seen in this facet — how an operator finds the unhappy one. */
  worst: LogLevel;
}

/**
 * Component counts for the filter rail, built from the records in the window
 * rather than a fixed list — "a component with nothing to say does not appear".
 *
 * The count is coloured by the WORST level present, which is what lets an
 * operator find the subsystem that is unhappy without knowing its name.
 */
export function componentFacets(records: readonly LogRecord[]): Facet[] {
  const byName = new Map<string, Facet>();
  for (const r of records) {
    const f = byName.get(r.component) ?? { name: r.component, count: 0, worst: 'debug' as LogLevel };
    f.count += 1;
    if (LEVEL_RANK[r.level] > LEVEL_RANK[f.worst]) f.worst = r.level;
    byName.set(r.component, f);
  }
  return Array.from(byName.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Level counts, including the zeroes.
 *
 * A zero is information: "there are no errors" is the answer to the question the
 * operator opened this screen with, so the row is dimmed rather than hidden.
 */
export function levelCounts(records: readonly LogRecord[]): Record<LogLevel, number> {
  const out: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
  for (const r of records) out[r.level] += 1;
  return out;
}

/** Lines per minute over the records held, or null when there is no span. */
export function ratePerMinute(records: readonly LogRecord[]): number | null {
  if (records.length < 2) return null;
  const first = records[0].at_unix_ms;
  const last = records[records.length - 1].at_unix_ms;
  const spanMs = last - first;
  // A window shorter than a second cannot support a per-minute claim: it would
  // extrapolate a burst into a rate nobody is actually seeing.
  if (spanMs < 1000) return null;
  return Math.round((records.length / spanMs) * 60_000);
}

/**
 * Whether the window still reaches back to kernel start.
 *
 * A window that has dropped records is showing a truncated story, and saying so
 * is the difference between "nothing happened" and "we no longer know".
 */
export function windowReachesBoot(dropped: number): boolean {
  return dropped === 0;
}

// ── attributes present, and grouping by one ─────────────────────────────────

export interface AttrKeyFacet {
  key: string;
  /** How many records in the window carry this key. */
  count: number;
  /** Distinct values seen — a key with one value cannot usefully group. */
  distinct: number;
}

/**
 * The attribute KEYS present in this window (`13a` §3.2).
 *
 * Built from the records rather than a fixed list, so a key with nothing to say
 * does not appear. Ranked by how many records carry it, because that is how an
 * operator finds the dimension worth slicing on.
 */
export function attributeKeyFacets(records: readonly LogRecord[]): AttrKeyFacet[] {
  const byKey = new Map<string, { count: number; values: Set<string> }>();
  for (const r of records) {
    for (const a of r.attrs) {
      const f = byKey.get(a.key) ?? { count: 0, values: new Set<string>() };
      f.count += 1;
      f.values.add(a.value);
      byKey.set(a.key, f);
    }
  }
  return Array.from(byKey.entries())
    .map(([key, f]) => ({ key, count: f.count, distinct: f.values.size }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface AttrGroup {
  value: string;
  count: number;
  worst: LogLevel;
  records: LogRecord[];
}

/**
 * Group a window by one attribute's value.
 *
 * This is what turns a stream into an analysis tool: "which session produced
 * these 148 warnings" is a question the flat list cannot answer at any length.
 *
 * Records missing the key are NOT silently dropped — they group under a named
 * bucket, because "how many records have no session at all" is usually the
 * interesting half of the answer.
 */
export const NO_VALUE = '(absent)';

export function groupByAttr(records: readonly LogRecord[], key: string): AttrGroup[] {
  const byValue = new Map<string, AttrGroup>();
  for (const r of records) {
    const attr = r.attrs.find((a) => a.key === key);
    const value = attr ? attr.value : NO_VALUE;
    const g = byValue.get(value) ?? { value, count: 0, worst: 'debug' as LogLevel, records: [] };
    g.count += 1;
    g.records.push(r);
    if (LEVEL_RANK[r.level] > LEVEL_RANK[g.worst]) g.worst = r.level;
    byValue.set(value, g);
  }
  return Array.from(byValue.values()).sort(
    (a, b) =>
      // Worst-first, then biggest: the unhappy group is the one being looked for.
      LEVEL_RANK[b.worst] - LEVEL_RANK[a.worst] || b.count - a.count || a.value.localeCompare(b.value),
  );
}

// ── the filter, as removable terms ──────────────────────────────────────────

export type ChipKind = 'level' | 'component' | 'attr' | 'text' | 'since';

export interface FilterChip {
  kind: ChipKind;
  /** What the chip reads as: `level ≥ warn`, `session=7eab2d`. */
  label: string;
  /** For attr chips, the key to remove. */
  key?: string;
}

/**
 * The active filter as chips (`13a` §3.1).
 *
 * Chips rather than a query string: a string means parsing and re-parsing on
 * every keystroke, and it hides which terms are active. A term you cannot see is
 * a term you cannot remove, which is how an operator concludes the filter is
 * broken when it is merely still applied.
 */
export function filterChips(f: LogFilter): FilterChip[] {
  const out: FilterChip[] = [];
  // `debug` is the floor, so it narrows nothing and earns no chip.
  if (f.level_at_least && f.level_at_least !== 'debug') {
    out.push({ kind: 'level', label: `level ≥ ${f.level_at_least}` });
  }
  for (const c of f.components ?? []) {
    out.push({ kind: 'component', label: c, key: c });
  }
  for (const [k, v] of Object.entries(f.attr_equals ?? {})) {
    out.push({ kind: 'attr', label: `${k}=${v}`, key: k });
  }
  if (f.contains) out.push({ kind: 'text', label: `"${f.contains}"` });
  if (f.since_unix_ms) out.push({ kind: 'since', label: 'since boot' });
  return out;
}

/** The time windows offered. `since boot` is a real option, not a convenience. */
export type TimeWindow = '15m' | '1h' | 'boot';

/**
 * The `since` bound for a window.
 *
 * `boot` returns undefined rather than a timestamp: the kernel's ring already
 * starts at boot, so asking for "everything it still has" is the absence of a
 * bound. Computing one from the oldest record would silently exclude anything
 * arriving during the request.
 */
export function sinceFor(w: TimeWindow, now = Date.now()): number | undefined {
  switch (w) {
    case '15m':
      return now - 15 * 60_000;
    case '1h':
      return now - 60 * 60_000;
    case 'boot':
      return undefined;
  }
}

// ── repeat grouping ─────────────────────────────────────────────────────────

export interface StreamItem {
  /** The newest record of the run — what the row renders. */
  record: LogRecord;
  /** How many consecutive records shared this shape. 1 = an ordinary row. */
  repeats: number;
  /** Every record in the run, for expansion. */
  members: LogRecord[];
}

/**
 * The key a repeat is grouped on.
 *
 * On the message TEMPLATE and the distinguishing attributes, not the fully
 * interpolated line: `server=notion-mcp` firing 340 times is one fact, and
 * grouping on the rendered string would split it the moment a counter appeared
 * in the text.
 *
 * Attribute VALUES are part of the key, because two different servers failing is
 * two facts, not one repeated one.
 */
export function repeatKey(r: LogRecord): string {
  const attrs = r.attrs
    .map((a) => `${a.key}=${a.value}`)
    .sort()
    .join(' ');
  return `${r.level} ${r.component} ${r.message} ${attrs}`;
}

/**
 * Collapse CONSECUTIVE identical records into one row (`13a` §3.4).
 *
 * Not cosmetic: this is the mechanism that makes the rare line visible. A
 * reconnect loop firing 340 times in fifteen minutes will otherwise bury the one
 * error that matters, and an operator scrolling past it is the failure the whole
 * screen exists to prevent.
 *
 * Only CONSECUTIVE runs collapse. Collapsing across the whole window would
 * reorder the stream, and a log that does not run in time order is no longer a
 * log.
 */
export function collapseRepeats(records: readonly LogRecord[]): StreamItem[] {
  const out: StreamItem[] = [];
  for (const r of records) {
    const last = out[out.length - 1];
    if (last && repeatKey(last.record) === repeatKey(r)) {
      last.repeats += 1;
      last.members.push(r);
      // The row shows the NEWEST of the run: its timestamp is when the problem
      // last happened, which is the one an operator acts on.
      last.record = r;
      continue;
    }
    out.push({ record: r, repeats: 1, members: [r] });
  }
  return out;
}

/** A human span for a repeat run, from its first to its last record. */
export function repeatSpan(item: StreamItem): string | null {
  if (item.repeats < 2) return null;
  const ms = item.members[item.members.length - 1].at_unix_ms - item.members[0].at_unix_ms;
  if (ms < 1000) return 'in under a second';
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return `in ${Math.round(ms / 1000)}s`;
  return `in ${mins} min`;
}
