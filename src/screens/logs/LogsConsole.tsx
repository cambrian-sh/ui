import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, ScrollArea } from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';
import { ipc } from '@/ipc';
import { onLogRecord, onLogTailError } from '@/ipc/events';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { Inspector } from '@/components/InspectorSlot';
import {
  appendHeld,
  attributeKeyFacets,
  componentFacets,
  errorCount,
  filterChips,
  groupByAttr,
  levelCounts,
  matches,
  collapseRepeats,
  mergeBySeq,
  ratePerMinute,
  sinceFor,
  type Held,
  type TimeWindow,
} from './logStream';
import { LogGroup } from './LogGroup';
import { BootReportPane } from './BootReportPane';
import { buildBootReport, loadPreviousBoot, savePreviousBoot } from './bootReport';
import { LogStreamRow } from './LogStreamRow';
import { LogRecordInspector } from './LogRecordInspector';
import type { LogFilter, LogLevel, LogRecord, LogWindow } from '@/ipc/types';

const LOGS_CAPABILITY = 'kernel-logs';
const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const LEVEL_TONE: Record<LogLevel, string> = {
  debug: 'var(--fg-muted)',
  info: 'var(--fg-secondary)',
  warn: 'var(--status-warn)',
  error: 'var(--status-err)',
};

/**
 * Logs (`13a`) — what this kernel actually did.
 *
 * Audit says who changed what, the feed says what is true now, traces say what a
 * model did. None of them answer "what did the process do", which until now was
 * reachable only by attaching to stdout at the time.
 *
 * Two things carry the screen. **Follow mode pauses because you scrolled**, not
 * because you found a toggle — and it says how far behind you are *and whether
 * any of it matters*, so catching up is a decision rather than a reflex. And the
 * window states its own limits: the kernel retains a bounded ring that does not
 * survive a restart, so a quiet screen must never be read as a quiet kernel.
 */
export function LogsConsole() {
  const projection = useStore(projectionStore);
  const capabilities = projection.state?.capabilities ?? [];
  const role = projection.state?.role ?? null;
  const available = capabilities.includes(LOGS_CAPABILITY);

  const [records, setRecords] = useState<LogRecord[]>([]);
  const [held, setHeld] = useState<Held>({ records: [], overflowed: 0 });
  const [window_, setWindow] = useState<LogWindow | null>(null);
  const [following, setFollowing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const [level, setLevel] = useState<LogLevel>('debug');
  const [component, setComponent] = useState<string | null>(null);
  const [contains, setContains] = useState('');
  const [attrEquals, setAttrEquals] = useState<Record<string, string>>({});
  // The attribute the stream is grouped by, if any. Grouping is a VIEW, not a
  // filter — it reorganises what is shown rather than removing anything.
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('boot');
  const [bootOpen, setBootOpen] = useState(false);

  const filter: LogFilter = useMemo(
    () => ({
      level_at_least: level,
      components: component ? [component] : undefined,
      contains: contains.trim() || undefined,
      attr_equals: Object.keys(attrEquals).length > 0 ? attrEquals : undefined,
      since_unix_ms: sinceFor(timeWindow),
    }),
    [level, component, contains, attrEquals, timeWindow],
  );

  const chips = useMemo(() => filterChips(filter), [filter]);

  const clearChip = (kind: string, key?: string) => {
    if (kind === 'level') setLevel('debug');
    else if (kind === 'component') setComponent(null);
    else if (kind === 'text') setContains('');
    else if (kind === 'since') setTimeWindow('boot');
    else if (kind === 'attr' && key) {
      setAttrEquals((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  // Follow mode reads this rather than state, so a record arriving mid-render
  // cannot append to a stream the operator has already scrolled away from.
  const followingRef = useRef(true);
  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  // ── history, then the tail from where history ended ───────────────────────
  const load = useCallback(async () => {
    if (!available) return;
    try {
      const page = await ipc.queryLogs(filter, 0, 2000);
      setRecords(page.records);
      setWindow(page.window);
      setError(null);
      setHeld({ records: [], overflowed: 0 });
      // Tail from the newest sequence the kernel has, so the join is exact and
      // nothing between the query and the tail is missed.
      await ipc.startLogTail(filter, page.window.last_seq);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [available, filter]);

  useEffect(() => {
    void load();
    return () => {
      void ipc.stopLogTail();
    };
  }, [load]);

  useEffect(() => {
    if (!available) return;
    const un = onLogRecord((r) => {
      if (followingRef.current) {
        setRecords((prev) => mergeBySeq(prev, [r]));
      } else {
        // Held, not dropped. This is the promise the pill makes.
        setHeld((prev) => appendHeld(prev, [r]));
      }
    });
    const unErr = onLogTailError((reason) => setError(reason));
    return () => {
      void un.then((f) => f());
      void unErr.then((f) => f());
    };
  }, [available]);

  // Keep the newest line in view while following. Guarded — jsdom has no scrollTo.
  useEffect(() => {
    if (!following) return;
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight });
  }, [records, following]);

  /**
   * Scrolling up pauses. It is not a mode you enter, because scrolling is the
   * only thing the operator was ever going to do.
   */
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom && !following) {
      // Returning to the bottom resumes on its own — no second click to undo an
      // action the operator never took.
      setRecords((prev) => mergeBySeq(prev, held.records));
      setHeld({ records: [], overflowed: 0 });
      setFollowing(true);
    } else if (!atBottom && following) {
      setFollowing(false);
    }
  };

  const visible = useMemo(() => records.filter((r) => matches(r, filter)), [records, filter]);
  const counts = useMemo(() => levelCounts(records), [records]);
  const facets = useMemo(() => componentFacets(records), [records]);
  const attrKeys = useMemo(() => attributeKeyFacets(records), [records]);
  const rate = useMemo(() => ratePerMinute(records), [records]);
  // Collapsed AFTER filtering: a repeat run is only a repeat among the records
  // actually on screen, and collapsing first would count lines the filter removed.
  const collapsed = useMemo(() => collapseRepeats(visible), [visible]);

  // The boot sequence, read as what it is: a statement of what this kernel is
  // running. Built from the UNFILTERED records — a filter is about the stream,
  // and the boot report is about the process.
  const boot = useMemo(() => buildBootReport(records), [records]);
  const previousBoot = useMemo(
    () => (boot ? loadPreviousBoot(boot.bootId) : null),
    [boot],
  );
  useEffect(() => {
    if (boot) savePreviousBoot(boot);
  }, [boot]);
  const heldErrors = errorCount(held.records);
  const chosen = selected != null ? records.find((r) => r.seq === selected) ?? null : null;

  if (!available) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4">
          <EmptyState
            title="This kernel does not serve its logs"
            body={
              role === 'viewer'
                ? 'Logs are operator-only: a log line carries whatever the kernel wrote and is not filtered per principal the way a memory read is.'
                : 'The kernel is older than the log retention window, so there is nothing to read here. Its logs are still on its own stdout.'
            }
          />
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Filter rail — built from the records in the window, not a fixed list. */}
      {/* `w-56` is 224px and is a CORE utility, deliberately not `w-[224px]`.
          An arbitrary value only exists if the scanner saw that exact string, and
          when it does not the aside loses its width entirely, sizes to its widest
          sentence and takes the screen. A structural constraint should not depend
          on a class being generated.

          `min-w-0` so a long attribute value truncates instead of widening the
          rail, and `shrink-0` so the stream cannot squeeze it. */}
      <aside
        style={{ width: 224 }}
        className="flex w-56 min-w-0 shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-r border-[var(--border-subtle)] p-3"
      >
        <div className="flex flex-col gap-1">
          <RailHeading>Level</RailHeading>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={cn(
                'flex items-center justify-between rounded px-2 py-1 text-left text-[12px]',
                level === l ? 'tint-wash tint-ring' : 'hover:bg-[var(--bg-hover)]',
                // A zero is INFORMATION — "there are no errors" is the answer to
                // the question this screen was opened with — so it dims rather
                // than disappears.
                counts[l] === 0 && 'opacity-45',
              )}
              style={
                level === l ? ({ '--tint': LEVEL_TONE[l] } as React.CSSProperties) : undefined
              }
            >
              <span style={{ color: LEVEL_TONE[l] }}>{l}</span>
              <span className="font-mono text-[10.5px] tabular-nums text-[var(--fg-muted)]">
                {counts[l]}
              </span>
            </button>
          ))}
          <p className="mt-0.5 break-words text-[10.5px] leading-[1.45] text-[var(--fg-muted)]">
            At least this level. Counts are what is in the window now.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <RailHeading>Component — {facets.length}</RailHeading>
          {facets.length === 0 ? (
            <p className="text-[11px] text-[var(--fg-muted)]">Nothing in the window yet.</p>
          ) : (
            facets.slice(0, 24).map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => setComponent(component === f.name ? null : f.name)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-[12px]',
                  component === f.name ? 'tint-wash tint-ring' : 'hover:bg-[var(--bg-hover)]',
                )}
                style={
                  component === f.name
                    ? ({ '--tint': 'var(--color-accent-400)' } as React.CSSProperties)
                    : undefined
                }
              >
                <span className="truncate font-mono text-[11px]">{f.name}</span>
                {/* Coloured by the WORST level present: how you find the unhappy
                    subsystem without knowing its name. */}
                <span
                  className="font-mono text-[10.5px] tabular-nums"
                  style={{ color: LEVEL_TONE[f.worst] }}
                >
                  {f.count}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex flex-col gap-1">
          <RailHeading>Attributes present</RailHeading>
          <p className="mb-1 break-words text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
            Click a key to group by it. Click a value on a record to filter.
          </p>
          {attrKeys.length === 0 ? (
            <p className="text-[11px] text-[var(--fg-muted)]">
              No structured attributes in this window.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {attrKeys.slice(0, 20).map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setGroupBy(groupBy === k.key ? null : k.key)}
                  // A key with a single value cannot usefully group — say so
                  // rather than offering a grouping that yields one bucket.
                  title={
                    k.distinct === 1
                      ? `${k.key} has one value in this window`
                      : `Group by ${k.key} — ${k.distinct} values`
                  }
                  className={cn(
                    'max-w-full truncate rounded-[5px] px-2 py-[3px] font-mono text-[10.5px]',
                    groupBy === k.key
                      ? 'bg-[color-mix(in_srgb,var(--color-accent-400)_16%,transparent)] text-[var(--color-accent-400)]'
                      : 'bg-[color-mix(in_srgb,var(--fg-primary)_8%,transparent)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
                    k.distinct === 1 && 'opacity-55',
                  )}
                >
                  {k.key}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-none flex-wrap items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_var(--border-subtle)]">
          <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">Logs</h1>

          <FollowPill
            following={following}
            heldCount={held.records.length}
            heldErrors={heldErrors}
          />

          {rate != null && (
            <span className="font-mono text-[11px] text-[var(--fg-muted)]">
              {rate} lines/min
            </span>
          )}

          {/* The active filter as removable terms. Chips rather than a query
              string: a string means re-parsing on every keystroke and hides
              which terms are on — and a term you cannot see is one you cannot
              remove, which is how a filter gets blamed for being broken when it
              is merely still applied. */}
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
            {chips.map((c) => (
              <button
                key={`${c.kind}:${c.label}`}
                type="button"
                onClick={() => clearChip(c.kind, c.key)}
                aria-label={`Remove filter ${c.label}`}
                className="flex flex-none items-center gap-1.5 rounded-[5px] bg-[color-mix(in_srgb,var(--color-accent-400)_16%,transparent)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-accent-400)]"
              >
                {c.label}
                <span aria-hidden>×</span>
              </button>
            ))}
            <input
              type="search"
              value={contains}
              onChange={(e) => setContains(e.target.value)}
              placeholder={chips.length > 0 ? 'and…' : 'attribute or text…'}
              aria-label="Filter logs by message"
              className="min-w-[40px] flex-1 bg-transparent font-mono text-[11.5px] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none"
            />
          </div>

          {/* `Since boot` is a real option, not a date-picker convenience: it is
              the window that matches "what has this process done". */}
          <div className="flex flex-none items-center gap-0.5">
            {(
              [
                ['15m', 'Last 15 min'],
                ['1h', '1 h'],
                ['boot', 'Since boot'],
              ] as [TimeWindow, string][]
            ).map(([w, label]) => (
              <button
                key={w}
                type="button"
                onClick={() => setTimeWindow(w)}
                className={cn(
                  'rounded px-2.5 py-1 text-[11.5px]',
                  timeWindow === w
                    ? 'text-[var(--color-accent-400)] shadow-[inset_0_0_0_1px_var(--color-accent-400)]'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {/* What the window can and cannot answer for. A truncated story that does
            not say it is truncated is worse than no story. */}
        {window_ && (
          <p className="flex-none px-4 py-1.5 text-[11px] text-[var(--fg-muted)]">
            Kernel keeps the last {window_.capacity.toLocaleString()} lines in memory —{' '}
            {window_.count.toLocaleString()} held now.
            {window_.dropped > 0 ? (
              <span className="text-[var(--status-warn)]">
                {' '}
                {window_.dropped.toLocaleString()} older lines have been overwritten, so this no
                longer reaches back to kernel start.
              </span>
            ) : (
              ' This reaches back to kernel start.'
            )}{' '}
            It does not survive a restart.
          </p>
        )}

        {error && (
          <p role="alert" className="flex-none px-4 py-1.5 text-[12px] text-[var(--status-err)]">
            {error}
          </p>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto"
          role="log"
          aria-label="Kernel log"
        >
          {/* The whole startup sequence as one row. Chronologically it is noise
              that buries the first real event; semantically it is the best
              answer to "what is this kernel running". */}
          {boot && !groupBy && (
            <button
              type="button"
              onClick={() => setBootOpen(true)}
              className="flex w-full items-baseline gap-3 border-b border-[var(--border-subtle)] px-4 py-2 text-left hover:bg-[var(--bg-hover)]"
            >
              <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                {new Date(boot.startedAt).toLocaleTimeString()}
              </span>
              <span className="text-[12px] text-[var(--fg-primary)]">
                Kernel boot — {boot.lineCount} lines
              </span>
              <span className="text-[11.5px] text-[var(--fg-muted)]">
                {boot.settings.length} settings declared
                {boot.warnings.length > 0 && ` · ${boot.warnings.length} degraded`}
              </span>
              <span className="ml-auto text-[11.5px] text-[var(--color-accent-400)]">
                Read the report →
              </span>
            </button>
          )}

          {groupBy ? (
            <GroupedStream
              records={visible}
              groupKey={groupBy}
              selected={selected}
              onSelect={setSelected}
              onFilterValue={(v) => {
                setAttrEquals((prev) => ({ ...prev, [groupBy]: v }));
                setGroupBy(null);
              }}
            />
          ) : visible.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Nothing matches"
                body="No retained line matches these filters. The kernel may simply have been quiet — the window above says how far back it reaches."
              />
            </div>
          ) : (
            <ul className="flex flex-col">
              {collapsed.map((item) => (
                <li key={item.record.seq}>
                  <LogStreamRow
                    item={item}
                    selected={selected}
                    onSelect={(seq) => setSelected(seq === selected ? null : seq)}
                  />
                </li>
              ))}
            </ul>
          )}

          {following && visible.length > 0 && (
            // The empty space at the bottom is explained rather than looking like
            // the end of the data.
            <p className="flex items-center gap-1.5 px-4 py-2 text-[11px] text-[var(--fg-muted)]">
              <span
                aria-hidden
                className="cambrian-live-pulse size-1.5 rounded-full bg-[var(--status-live)]"
              />
              following · new lines appear here
            </p>
          )}
        </div>
      </div>

      {bootOpen && boot && (
        <Inspector label="Boot report">
          <BootReportPane
            report={boot}
            previous={previousBoot}
            onClose={() => setBootOpen(false)}
          />
        </Inspector>
      )}

      {!bootOpen && chosen && (
        <Inspector label="Log record">
          <LogRecordInspector
            record={chosen}
            onFilterComponent={(c) => setComponent(c)}
            onFilterAttr={(k, v) => setContains(`${k}=${v}`)}
          />
        </Inspector>
      )}
    </div>
  );
}

/**
 * The stream, grouped by one attribute.
 *
 * Worst-first rather than biggest-first: the group being looked for is the
 * unhappy one, and a hundred healthy records should not bury nine errors.
 */
function GroupedStream({
  records,
  groupKey,
  selected,
  onSelect,
  onFilterValue,
}: {
  records: LogRecord[];
  groupKey: string;
  selected: number | null;
  onSelect: (seq: number | null) => void;
  onFilterValue: (value: string) => void;
}) {
  const groups = useMemo(() => groupByAttr(records, groupKey), [records, groupKey]);

  if (groups.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          title="Nothing to group"
          body="No retained line matches these filters, so there is nothing to group by."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <p className="px-4 py-2 text-[11px] text-[var(--fg-muted)]">
        Grouped by <span className="font-mono text-[var(--color-accent-400)]">{groupKey}</span> —{' '}
        {groups.length} {groups.length === 1 ? 'value' : 'values'} across {records.length} records.
      </p>
      {groups.map((g) => (
        <LogGroup
          key={g.value}
          group={g}
          groupKey={groupKey}
          selected={selected}
          onSelect={onSelect}
          onFilterValue={onFilterValue}
        />
      ))}
    </div>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
      {children}
    </div>
  );
}

/**
 * The follow pill (`13b`).
 *
 * The second half of the held count is the point: an operator who knows there
 * are no errors among the 218 waiting lines can stay where they are.
 */
function FollowPill({
  following,
  heldCount,
  heldErrors,
}: {
  following: boolean;
  heldCount: number;
  heldErrors: number;
}) {
  if (following) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--status-live)]">
        <span aria-hidden className="cambrian-live-pulse size-1.5 rounded-full bg-[var(--status-live)]" />
        following
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-[11.5px]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--status-warn)]">
        paused — you scrolled up
      </span>
      <span className="text-[var(--fg-muted)]">
        {heldCount} new {heldCount === 1 ? 'line' : 'lines'} held, not dropped
      </span>
      {heldErrors > 0 && (
        <span className="text-[var(--status-err)]">
          {heldErrors} {heldErrors === 1 ? 'error' : 'errors'} among them
        </span>
      )}
    </span>
  );
}
