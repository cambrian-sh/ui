import { describe, expect, it } from 'vitest';
import {
  HELD_MAX,
  attributeKeyFacets,
  collapseRepeats,
  filterChips,
  groupByAttr,
  sinceFor,
  NO_VALUE,
  appendHeld,
  componentFacets,
  errorCount,
  levelCounts,
  matches,
  mergeBySeq,
  ratePerMinute,
} from './logStream';
import type { LogLevel, LogRecord } from '@/ipc/types';

function rec(seq: number, level: LogLevel = 'info', over: Partial<LogRecord> = {}): LogRecord {
  return {
    seq,
    at_unix_ms: 1_000_000 + seq * 1000,
    level,
    component: 'kernel',
    message: `line ${seq}`,
    attrs: [],
    boot_id: 'boot-1',
    truncated: false,
    ...over,
  };
}

describe('held buffer — the promise follow mode makes', () => {
  // The fear about pausing a tail is that pausing loses data. It must not.
  it('holds new records rather than dropping them', () => {
    const held = appendHeld({ records: [], overflowed: 0 }, [rec(1), rec(2)]);
    expect(held.records).toHaveLength(2);
    expect(held.overflowed).toBe(0);
  });

  it('bounds the hold and says how much it lost', () => {
    const many = Array.from({ length: HELD_MAX + 25 }, (_, i) => rec(i + 1));
    const held = appendHeld({ records: [], overflowed: 0 }, many);

    expect(held.records).toHaveLength(HELD_MAX);
    // Overflow is COUNTED, never silent — the pill can say so.
    expect(held.overflowed).toBe(25);
    // The oldest go: someone catching up cares about what happened most recently.
    expect(held.records[0].seq).toBe(26);
  });

  // The second half of the pill is the point: no errors means stay where you are.
  it('counts the errors among what is held', () => {
    expect(errorCount([rec(1), rec(2, 'error'), rec(3, 'warn'), rec(4, 'error')])).toBe(2);
  });
});

describe('merge', () => {
  // History and the tail overlap by design — query, then tail from the sequence
  // the query returned. A record arriving twice must not render twice.
  it('de-duplicates on seq and keeps order', () => {
    const merged = mergeBySeq([rec(1), rec(3)], [rec(3), rec(2), rec(4)]);
    expect(merged.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
  });

  it('returns the original array when nothing is new', () => {
    const existing = [rec(1), rec(2)];
    expect(mergeBySeq(existing, [rec(2)])).toBe(existing);
  });
});

describe('client-side filter', () => {
  it('applies the level floor', () => {
    expect(matches(rec(1, 'info'), { level_at_least: 'warn' })).toBe(false);
    expect(matches(rec(1, 'error'), { level_at_least: 'warn' })).toBe(true);
  });

  it('matches message text case-insensitively', () => {
    const r = rec(1, 'info', { message: 'MCP server unhealthy' });
    expect(matches(r, { contains: 'unhealthy' })).toBe(true);
    expect(matches(r, { contains: 'UNHEALTHY' })).toBe(true);
    expect(matches(r, { contains: 'healthy kernel' })).toBe(false);
  });

  it('matches on an attribute, which is the whole reason attrs stay structured', () => {
    const r = rec(1, 'error', {
      attrs: [{ key: 'generator', kind: 'string', value: 'mimo', num: null }],
    });
    expect(matches(r, { attr_equals: { generator: 'mimo' } })).toBe(true);
    expect(matches(r, { attr_equals: { generator: 'deepseek' } })).toBe(false);
    // A record missing the attribute entirely does not match.
    expect(matches(rec(2), { attr_equals: { generator: 'mimo' } })).toBe(false);
  });

  it('combines terms rather than replacing them', () => {
    const r = rec(1, 'error', { component: 'llm', message: 'rejected' });
    expect(matches(r, { level_at_least: 'error', components: ['llm'] })).toBe(true);
    expect(matches(r, { level_at_least: 'error', components: ['mcp'] })).toBe(false);
  });
});

describe('facets', () => {
  // How an operator finds the unhappy subsystem without knowing its name.
  it('ranks components by count and colours by the WORST level present', () => {
    const facets = componentFacets([
      rec(1, 'info', { component: 'mcp' }),
      rec(2, 'error', { component: 'mcp' }),
      rec(3, 'info', { component: 'llm' }),
      rec(4, 'info', { component: 'llm' }),
      rec(5, 'info', { component: 'llm' }),
    ]);

    expect(facets[0].name).toBe('llm');
    expect(facets[0].count).toBe(3);
    expect(facets[0].worst).toBe('info');
    // Two records, one an error — the count must read as alarming.
    expect(facets[1].name).toBe('mcp');
    expect(facets[1].worst).toBe('error');
  });

  // "There are no errors" is the answer to the question the screen was opened
  // with, so a zero has to be reported rather than omitted.
  it('reports every level including the zeroes', () => {
    expect(levelCounts([rec(1, 'info')])).toEqual({ debug: 0, info: 1, warn: 0, error: 0 });
  });
});

describe('rate', () => {
  it('is null when there is no span to measure', () => {
    expect(ratePerMinute([])).toBeNull();
    expect(ratePerMinute([rec(1)])).toBeNull();
  });

  it('refuses to extrapolate a burst shorter than a second into a per-minute rate', () => {
    const burst = [
      rec(1, 'info', { at_unix_ms: 1000 }),
      rec(2, 'info', { at_unix_ms: 1100 }),
    ];
    expect(ratePerMinute(burst)).toBeNull();
  });

  it('is lines per minute over the span held', () => {
    // 61 records one second apart = 60s span, 61 lines.
    const steady = Array.from({ length: 61 }, (_, i) =>
      rec(i + 1, 'info', { at_unix_ms: i * 1000 }),
    );
    expect(ratePerMinute(steady)).toBe(61);
  });
});

describe('attributes present, and grouping by one', () => {
  const withAttr = (seq: number, key: string, value: string, level: LogLevel = 'info') =>
    rec(seq, level, { attrs: [{ key, kind: 'string', value, num: null }] });

  it('ranks keys by how many records carry them', () => {
    const facets = attributeKeyFacets([
      withAttr(1, 'session', 'a'),
      withAttr(2, 'session', 'b'),
      withAttr(3, 'tool', 'fs.read'),
    ]);
    expect(facets[0].key).toBe('session');
    expect(facets[0].count).toBe(2);
    // Distinct values decide whether grouping on it can say anything.
    expect(facets[0].distinct).toBe(2);
    expect(facets[1].distinct).toBe(1);
  });

  it('groups worst-first so nine errors are not buried under healthy records', () => {
    const groups = groupByAttr(
      [
        withAttr(1, 'session', 'busy'),
        withAttr(2, 'session', 'busy'),
        withAttr(3, 'session', 'busy'),
        withAttr(4, 'session', 'broken', 'error'),
      ],
      'session',
    );
    expect(groups[0].value).toBe('broken');
    expect(groups[0].worst).toBe('error');
    expect(groups[1].value).toBe('busy');
    expect(groups[1].count).toBe(3);
  });

  // "How many records have no session at all" is usually the interesting half.
  it('buckets records missing the key rather than dropping them', () => {
    const groups = groupByAttr([withAttr(1, 'session', 'a'), rec(2)], 'session');
    expect(groups.map((g) => g.value)).toContain(NO_VALUE);
  });
});

describe('filter chips', () => {
  it('shows only terms that actually narrow', () => {
    // debug is the floor, so it earns no chip.
    expect(filterChips({ level_at_least: 'debug' })).toHaveLength(0);
    expect(filterChips({ level_at_least: 'warn' })[0].label).toBe('level ≥ warn');
  });

  it('renders an attribute term the way an operator reads it', () => {
    const chips = filterChips({ attr_equals: { session: '7eab2d' } });
    expect(chips[0].label).toBe('session=7eab2d');
    expect(chips[0].key).toBe('session');
  });
});

describe('time window', () => {
  // `Since boot` is the absence of a bound: the ring already starts at boot, and
  // computing a timestamp would exclude anything arriving during the request.
  it('gives no lower bound for since-boot', () => {
    expect(sinceFor('boot')).toBeUndefined();
    expect(sinceFor('15m', 1_000_000)).toBe(1_000_000 - 900_000);
  });
});

describe('repeat collapsing — what makes the rare line visible', () => {
  const same = (seq: number) =>
    rec(seq, 'warn', {
      component: 'mcp',
      message: 'MCP server unhealthy',
      attrs: [{ key: 'server', kind: 'string', value: 'notion-mcp', num: null }],
    });

  it('collapses a consecutive run into one row', () => {
    const items = collapseRepeats([same(1), same(2), same(3), rec(4)]);
    expect(items).toHaveLength(2);
    expect(items[0].repeats).toBe(3);
    // The row shows the NEWEST of the run — when it last happened is what an
    // operator acts on.
    expect(items[0].record.seq).toBe(3);
    expect(items[0].members).toHaveLength(3);
  });

  it('does not collapse across a different record, so time order survives', () => {
    const items = collapseRepeats([same(1), rec(2), same(3)]);
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.repeats === 1)).toBe(true);
  });

  // Two different servers failing is two facts, not one repeated one.
  it('keys on attribute values, not just the message', () => {
    const a = rec(1, 'warn', {
      component: 'mcp',
      message: 'unhealthy',
      attrs: [{ key: 'server', kind: 'string', value: 'notion', num: null }],
    });
    const b = rec(2, 'warn', {
      component: 'mcp',
      message: 'unhealthy',
      attrs: [{ key: 'server', kind: 'string', value: 'slack', num: null }],
    });
    expect(collapseRepeats([a, b])).toHaveLength(2);
  });
});
