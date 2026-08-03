import type { PipelineSummary, WatchBacktestVerdict, WatchConfigFull, WatchMetrics } from '@/ipc/types';

/**
 * A pipeline's mode.
 *
 * `broken` is the one that earns its place: a watch bound to no stream can
 * never fire, and it looks exactly like coverage from every other screen. It is
 * worse than `paused`, because paused is a decision and broken is an accident.
 */
export type PipelineMode =
  | 'draft'
  | 'dry_run'
  | 'armed'
  | 'published'
  | 'paused'
  | 'orphaned'
  | 'broken';

export function pipelineMode(config: WatchConfigFull): PipelineMode {
  if (!config.source_stream_id && config.source_type !== 'schedule') return 'broken';
  if (config.dry_run) return 'dry_run';
  if (!config.active) return 'paused';
  if (!config.id) return 'draft';
  return 'armed';
}

export const MODE_COPY: Record<PipelineMode, { label: string; tone: string; why: string }> = {
  draft: {
    label: 'draft',
    tone: 'var(--status-idle)',
    why: 'Not registered yet. Nothing evaluates it.',
  },
  dry_run: {
    label: 'dry run',
    tone: 'var(--color-accent-400)',
    why: 'Evaluating for real and recording would-fires. No arm has run.',
  },
  armed: {
    label: 'armed',
    tone: 'var(--status-live)',
    why: 'Live. A passing gate runs its arm.',
  },
  orphaned: {
    label: 'orphaned',
    tone: 'var(--status-err)',
    why: 'Armed for an entry organ that no longer exists. It can never fire.',
  },
  published: {
    label: 'published',
    tone: 'var(--status-idle)',
    why: 'Reviewed and ready, and doing nothing. Arming is a separate act.',
  },
  paused: {
    label: 'paused',
    tone: 'var(--status-warn)',
    why: 'You stopped it. Pausing releases the daemon if no other watch needs the stream, so a paused watch costs nothing to keep.',
  },
  broken: {
    label: 'broken',
    tone: 'var(--status-err)',
    why: 'No stream bound, so it can never fire. This looks like coverage and is not.',
  },
};

/**
 * An llm gate is a security surface.
 *
 * A signal payload can carry injected instructions, and this gate decides an
 * unattended action — so the risk is not "the model might be wrong", it is "a
 * third party can write the input".
 */
export function isLlmGate(config: WatchConfigFull): boolean {
  return config.condition_type === 'llm';
}

/**
 * Field names that widen the injection surface most.
 *
 * Free-form third-party text widens it more than every structured field
 * combined: a number cannot carry an instruction, a headline can.
 */
const FREEFORM_KEYS = ['headline', 'raw_text', 'body', 'text', 'message', 'title', 'summary'];

export function dangerousPayloadKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => FREEFORM_KEYS.some((f) => k.toLowerCase().includes(f)));
}

/**
 * Would a deterministic gate express this exactly?
 *
 * The best LLM-condition UI is one that talks you out of an LLM condition you
 * do not need: if the rule is a numeric threshold on a single field, a
 * deterministic gate is exact, free, and removes the injection surface
 * entirely.
 */
export function suggestsDeterministic(config: WatchConfigFull): boolean {
  if (!isLlmGate(config)) return false;
  const c = config.condition.toLowerCase();
  const looksNumeric = /[<>]=?|\bexceeds?\b|\babove\b|\bbelow\b|\bgreater\b|\bless\b/.test(c);
  const oneField = config.condition_payload_keys.length === 1;
  return looksNumeric && oneField;
}

export interface BacktestSummary {
  total: number;
  wouldFire: number;
  held: number;
  errored: number;
  /** Errors grouped by their shape, not listed one by one. */
  errorGroups: { shape: string; count: number; example: string }[];
  /** Fires per day, oldest first — the bars. */
  firesPerDay: { day: string; count: number }[];
}

/**
 * Summarise a backtest.
 *
 * Errors are grouped rather than listed because eight identical failures are
 * one fact, not eight — and the grouping is what makes the fix obvious ("all of
 * them were the heartbeat signal, which carries no `price` field").
 */
export function summariseBacktest(
  verdicts: readonly WatchBacktestVerdict[],
): BacktestSummary {
  const errored = verdicts.filter((v) => v.eval_error);
  const groups = new Map<string, { count: number; example: string }>();

  for (const v of errored) {
    // Normalise away the varying parts so the same failure collapses to one row.
    const shape = v.eval_error
      .replace(/["'`].*?["'`]/g, '…')
      .replace(/\b\d+(\.\d+)?\b/g, 'N')
      .trim();
    const g = groups.get(shape);
    if (g) g.count += 1;
    else groups.set(shape, { count: 1, example: v.raw_text });
  }

  const perDay = new Map<string, number>();
  for (const v of verdicts) {
    if (!v.would_fire) continue;
    // The journal carries a seq, not a timestamp, so days are bucketed by the
    // caller when it has them; absent that this stays a single bucket rather
    // than inventing dates.
    const day = 'window';
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  return {
    total: verdicts.length,
    wouldFire: verdicts.filter((v) => v.would_fire).length,
    held: verdicts.filter((v) => !v.would_fire && !v.eval_error).length,
    errored: errored.length,
    errorGroups: Array.from(groups.entries())
      .map(([shape, g]) => ({ shape, count: g.count, example: g.example }))
      .sort((a, b) => b.count - a.count),
    firesPerDay: Array.from(perDay.entries()).map(([day, count]) => ({ day, count })),
  };
}

/**
 * The debounce finding — the whole value of a backtest.
 *
 * A count of would-fires is data; "widen to 5 minutes and the same week becomes
 * 27 fires with nothing important lost" is a recommendation an operator can act
 * on. Returns null when the current window is already doing its job.
 */
export function debounceFinding(
  summary: BacktestSummary,
  config: WatchConfigFull,
): { text: string; suggestSeconds: number } | null {
  if (summary.wouldFire < 5) return null;
  const current = config.debounce_seconds;
  const suggested = current === 0 ? 60 : current * 5;

  return {
    text:
      current === 0
        ? `${summary.wouldFire} fires with no debounce at all — every signal starts its own plan. A window of ${suggested}s would coalesce bursts into one.`
        : `${summary.wouldFire} fires at a ${current}s window. A burst inside that window still starts separate plans; widening to ${suggested}s coalesces them.`,
    suggestSeconds: suggested,
  };
}

/** Per-pipeline metrics, keyed for the list. */
export function metricsById(
  metrics: readonly WatchMetrics[],
): Map<string, WatchMetrics> {
  return new Map(metrics.map((m) => [m.watch_id, m]));
}

/** A blank config, for the builder. */
export function emptyPipeline(): WatchConfigFull {
  return {
    id: '',
    name: '',
    description: '',
    source_type: 'signal_stream',
    source_stream_id: '',
    condition: '',
    condition_type: 'deterministic',
    daemon_params: {},
    action: { type: 'start_plan', target_type: '', target: '', payload: '' },
    active: false,
    response_mode: '',
    max_concurrent_plans: 1,
    debounce_seconds: 0,
    condition_payload_keys: [],
    approved: false,
    dry_run: true,
    source_cron: '',
    source_timezone: '',
    missed_fire_policy: 'skip',
  };
}

/**
 * The mode of an authored pipeline (kernel contract 0087).
 *
 * Derived from the LIFECYCLE state rather than from a pair of booleans: `armed`
 * is the only live state, so "is it running" has one answer instead of two flags
 * that can disagree.
 */
export function pipelineModeOf(p: PipelineSummary): PipelineMode {
  if (!p.trigger_ref && p.trigger_type !== 'schedule' && p.trigger_type !== 'manual') {
    return 'broken';
  }
  // Dry run is reported ahead of armed, exactly as it was for a watch: a
  // dry-running pipeline is live in every respect except that it acts, and
  // showing it as plain `armed` is the one reading that misleads.
  if (p.dry_run) return 'dry_run';
  switch (p.state) {
    // Armed for an ingress that was DELETED. Not paused, not broken-by-wiring:
    // the entry organ is gone, so nothing will ever arrive. Left as `armed` it
    // was the most misleading row on the page — a bot that does not exist,
    // reading as live coverage.
    case 'orphaned':
      return 'orphaned';
    case 'armed':
      return 'armed';
    case 'draft':
    case 'validated':
      return 'draft';
    case 'retired':
      return 'paused';
    case 'published':
      // Published is NOT paused, by the same rule that keeps broken out of
      // paused: paused is something an operator did to a pipeline that was
      // running, published is a pipeline that has never run. They call for
      // different actions, and from one row they looked identical.
      return 'published';
    default:
      return 'paused';
  }
}
