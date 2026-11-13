import { Button } from '@/design-system/components/ui/button';
import { cn } from '@/design-system/lib/utils';
import type { PlanStep } from '@/screens/plan/PlanStepList';
import type { CapabilityResolution, DispatchTrace } from '@/ipc/types';

export interface StepInspectorProps {
  step: PlanStep;
  planId: string;
  onInject?: () => void;
  injectDisabledReason?: string;
}

/** The D5 resolution ladder, in the order it is tried. */
const LADDER: { rung: CapabilityResolution; label: string; detail: string }[] = [
  { rung: 'exact', label: 'Exact', detail: 'a registered agent declares this capability verbatim' },
  { rung: 'alias', label: 'Alias', detail: 'a reviewed synonym in the alias file matched' },
  { rung: 'generalist', label: 'Generalist tier', detail: 'no specialist matched; a generalist took it' },
  { rung: 'failed', label: 'Failed', detail: 'the ladder exhausted — no eligible agent' },
];

/**
 * How this step found its agent.
 *
 * This replaces the auction bid chart. Under ADR-0100 selection is
 * capability-typed dispatch: the step declares a capability contract, the
 * resolution ladder matches it, an eligibility gate filters, and the survivors
 * are ranked on merit. Nobody is asked to quote.
 *
 * The headline pair is the point. The auction booted up to five agents per step
 * and threw four away; dispatch reads a registry. `0 RPCs · 0 speculative boots`
 * is the most operator-visible consequence of the change, so it goes first.
 */
function DispatchPanel({ dispatch }: { dispatch: DispatchTrace }) {
  const failed = dispatch.resolution === 'failed';

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="type-label text-[var(--fg-muted)]">
          Dispatch
        </h3>
        <span className="font-mono text-[10.5px] text-[var(--color-accent-400)]">
          {dispatch.rpcs} RPCs · {dispatch.speculative_boots} speculative boots
        </span>
      </div>

      <div>
        <div className="type-label text-[var(--fg-muted)]">
          Required capability
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {dispatch.required_capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded-sm px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-[var(--color-accent-400)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_34%,transparent)]"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* The ladder, drawn as the chain it is, with the rung that matched lit. */}
      <div>
        <div className="type-label mb-1.5 text-[var(--fg-muted)]">
          Resolution
        </div>
        <ol className="flex flex-col gap-1">
          {LADDER.map((rung) => {
            const matched = rung.rung === dispatch.resolution;
            const isFailRung = rung.rung === 'failed';
            return (
              <li
                key={rung.rung}
                className={cn(
                  'flex items-baseline gap-2 rounded-sm px-1.5 py-1 text-[11.5px]',
                  matched && !isFailRung && 'bg-[color-mix(in_srgb,var(--accent-bg)_12%,transparent)]',
                  matched && isFailRung && 'bg-[color-mix(in_srgb,var(--status-err)_12%,transparent)]',
                  !matched && 'opacity-40',
                )}
              >
                <span
                  className={cn(
                    'font-medium',
                    matched && isFailRung
                      ? 'text-[var(--status-err)]'
                      : matched
                        ? 'text-[var(--color-accent-400)]'
                        : 'text-[var(--fg-secondary)]',
                  )}
                >
                  {rung.label}
                </span>
                <span className="text-[var(--fg-muted)]">{rung.detail}</span>
              </li>
            );
          })}
        </ol>
        {dispatch.matched_capability &&
          dispatch.matched_capability !== dispatch.required_capabilities[0] && (
            <p className="mt-1 text-[11.5px] text-[var(--fg-muted)]">
              Resolved to <span className="font-mono">{dispatch.matched_capability}</span>.
            </p>
          )}
      </div>

      {failed ? <NoCandidate dispatch={dispatch} /> : <MeritRanking dispatch={dispatch} />}
    </section>
  );
}

/**
 * The `no_candidate` failure.
 *
 * A real, measured outcome — not an edge case. It must render the unmatched tag
 * verbatim and the vocabulary it was compared against, because those two facts
 * are the whole fix: either the tag is a typo, or it needs an alias entry, or
 * no agent has been built for it yet. "No agents available" says none of that.
 */
function NoCandidate({ dispatch }: { dispatch: DispatchTrace }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-md p-2.5 tint-wash tint-ring"
      style={{ '--tint': 'var(--status-err)' } as React.CSSProperties}
    >
      <span className="type-status text-[var(--status-err)]">
        No candidate
      </span>
      <p className="text-[12.5px] leading-[1.55] text-[var(--fg-primary)]">
        Nothing registered carries{' '}
        <span className="font-mono">{dispatch.unmatched_capability ?? 'the required capability'}</span>
        , and no alias maps it. The step has no eligible agent — it did not lose a
        contest, it never had a candidate.
      </p>

      {dispatch.vocabulary && dispatch.vocabulary.length > 0 && (
        <div>
          <div className="type-label mb-1 text-[var(--fg-muted)]">
            Compared against ({dispatch.vocabulary.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {dispatch.vocabulary.map((v) => (
              <span
                key={v}
                className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--fg-secondary)] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11.5px] text-[var(--fg-muted)]">
        Fix it in the alias file if this is a synonym, or register an agent that declares it.
      </p>
    </div>
  );
}

function MeritRanking({ dispatch }: { dispatch: DispatchTrace }) {
  const max = Math.max(...dispatch.ranked.map((c) => c.merit), 1);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="type-label text-[var(--fg-muted)]">
          Merit ranking
        </span>
        <span className="text-[11px] text-[var(--fg-muted)]">
          {dispatch.eligible_after_gate} eligible after the gate
        </span>
      </div>

      {dispatch.ranked.length === 0 ? (
        <p className="text-[11.5px] text-[var(--fg-muted)]">
          No ranking was recorded for this step.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {dispatch.ranked.map((c) => (
            <li key={c.agent_id} className="flex items-center gap-2">
              <span
                className={cn(
                  'w-[96px] shrink-0 truncate font-mono text-[11px]',
                  c.dispatched ? 'text-[var(--fg-primary)]' : 'text-[var(--fg-muted)]',
                )}
              >
                {c.agent_id}
              </span>
              <span className="h-1.5 flex-1 rounded-[3px] bg-[color-mix(in_srgb,var(--fg-primary)_10%,transparent)]">
                <span
                  className="block h-full rounded-[3px]"
                  style={{
                    width: `${(c.merit / max) * 100}%`,
                    background: c.dispatched
                      ? 'var(--accent-bg)'
                      : 'var(--color-neutral-700)',
                  }}
                />
              </span>
              <span className="w-[38px] shrink-0 text-right font-mono text-[10.5px] text-[var(--fg-muted)]">
                {c.merit.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-[11px] leading-[1.5] text-[var(--fg-muted)]">
        Ranked on merit, never asked to bid.
      </p>
    </div>
  );
}

/**
 * The detail of one selected step.
 *
 * This exists only while a step is selected — see `InspectorSlot`. It answers
 * "what is this step doing, who is doing it, and how did it get there".
 */
export function StepInspector({
  step,
  planId,
  onInject,
  injectDisabledReason,
}: StepInspectorProps) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-[var(--fg-muted)]">
          <span>step {String(step.index).padStart(2, '0')}</span>
          <span aria-hidden="true">·</span>
          <span>{planId.slice(0, 8)}</span>
        </div>
        <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[var(--fg-primary)]">
          {step.query}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Agent" value={step.agent ?? 'unassigned'} mono />
        <Field
          label="TrustScore"
          value={step.trust_score != null ? step.trust_score.toFixed(2) : 'unknown'}
          mono
        />
      </div>

      {step.depends_on && step.depends_on.length > 0 && (
        <Field
          label="Waits on"
          value={step.depends_on.map((d) => String(d).padStart(2, '0')).join(', ')}
          mono
        />
      )}

      {step.dispatch ? (
        <DispatchPanel dispatch={step.dispatch} />
      ) : (
        // Honest absence, not an empty chart. The dispatch trace arrives with
        // the ADR-0100 contract bump; a kernel that predates it sends nothing,
        // and inventing a ladder here would describe a decision we did not see.
        <p className="rounded-md bg-[var(--bg-canvas)] p-2.5 text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
          This kernel does not report how the step was dispatched. The capability
          contract and the resolution ladder arrive with the ADR-0100 contract bump.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="type-label mb-1.5 text-[var(--fg-muted)]">
          Output so far
        </div>
        <pre className="min-h-0 flex-1 overflow-auto rounded-md bg-[var(--bg-canvas)] p-2.5 font-mono text-[11px] leading-[1.6] whitespace-pre-wrap break-words text-[var(--fg-secondary)]">
          {step.output_peek?.trim()
            ? step.output_peek
            : step.status === 'pending'
              ? 'Nothing yet — this step has not started.'
              : 'No output captured for this step.'}
        </pre>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onInject}
          disabled={!onInject || Boolean(injectDisabledReason)}
        >
          Inject a correction here
        </Button>
        <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
          {injectDisabledReason ??
            'Injecting replaces the forward plan from this step. Everything before it stays.'}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="type-label text-[var(--fg-muted)]">
        {label}
      </div>
      <div
        className={
          mono
            ? 'mt-0.5 truncate font-mono text-[12.5px] text-[var(--fg-primary)]'
            : 'mt-0.5 truncate text-[13px] text-[var(--fg-primary)]'
        }
      >
        {value}
      </div>
    </div>
  );
}
