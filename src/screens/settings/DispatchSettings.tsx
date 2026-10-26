import { useMemo, useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import {
  ReasonField,
  useReasonGate,
} from '@/design-system/components/cambrian/reason-field';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { formatDuration } from '@/lib/format';
import { cn } from '@/design-system/lib/utils';
import {
  coherenceProblems,
  DISPATCH_FIELDS,
  MERIT_WEIGHT_KEYS,
  RESOLUTION_LADDER,
  RETIRED_AXES,
  SECTIONS,
  type DispatchField,
} from './dispatchFields';

/** Values the operator has changed but not yet saved. */
type Draft = Record<string, number>;

export interface DispatchSettingsProps {
  canMutate: boolean;
}

/**
 * Dispatch & retrieval.
 *
 * A form over the kernel's configuration, per UI-015 — never a JSON editor.
 * Two properties of this screen are load-bearing:
 *
 * 1. **Every field says what it trades away.** A wrong value here does not
 *    error; it degrades quality quietly. The consequence line is the product.
 * 2. **Where a value came from is stated.** A form that hides precedence
 *    produces the worst configuration bug there is: you change a value, it
 *    saves, and nothing happens.
 *
 * The kernel does not publish its schema yet (`GetConfigSchema` is not on the
 * contract), so current values are unknown and the form shows kernel defaults,
 * labelled as such. It does not pretend to be reading live config.
 */
export function DispatchSettings({ canMutate }: DispatchSettingsProps) {
  const [draft, setDraft] = useState<Draft>({});
  const gate = useReasonGate();
  const projection = useStore(projectionStore);

  // Present so the form lights up the moment the kernel serves a schema; its
  // absence is reported honestly rather than silently defaulted.
  const schema = useKernelQuery(['config-schema'], () => ipc.getConfigSchema(), {
    retry: 0,
  });

  const save = useMutation(async (params: Draft, reason: string) =>
    ipc.setRuntimeConfig(params, reason),
  );

  const valueOf = (f: DispatchField) => draft[f.key] ?? f.fallback;
  const isDirty = (f: DispatchField) =>
    draft[f.key] != null && draft[f.key] !== f.fallback;
  const set = (key: string, value: number) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const changed = Object.keys(draft).filter(
    (k) => draft[k] !== DISPATCH_FIELDS.find((f) => f.key === k)?.fallback,
  );

  // The three weights are ONE control: three separate inputs pass through
  // states the kernel rejects on the way to a valid set.
  const weightSum = MERIT_WEIGHT_KEYS.reduce(
    (sum, k) => sum + (draft[k] ?? DISPATCH_FIELDS.find((f) => f.key === k)!.fallback),
    0,
  );
  const weightsValid = Math.abs(weightSum - 1) < 0.001;

  // Coherence, not validity: each of these is a legal value on its own.
  const incoherent = useMemo(() => {
    const values: Record<string, number> = {};
    for (const f of DISPATCH_FIELDS) values[f.key] = draft[f.key] ?? f.fallback;
    return coherenceProblems(values);
  }, [draft]);

  const measured = useMeasuredPlanDurations(projection.state?.plans ?? []);

  const bySection = (id: string) => DISPATCH_FIELDS.filter((f) => f.section === id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="type-page-title">
          Dispatch &amp; retrieval
        </h2>
        <p className="type-page-description mt-1 max-w-[680px]">
          Nothing here errors when it is wrong — it degrades quality quietly. Each field says
          what it costs.
        </p>
        <SourceNote schemaMissing={Boolean(schema.error)} />
      </div>

      {/* ── How a step finds an agent ─────────────────────────────────── */}
      <Section id="dispatch">
        {bySection('dispatch')
          .filter((f) => !MERIT_WEIGHT_KEYS.includes(f.key as never))
          .map((f) => (
            <Field
              key={f.key}
              field={f}
              value={valueOf(f)}
              dirty={isDirty(f)}
              onChange={(v) => set(f.key, v)}
              disabled={!canMutate}
            />
          ))}

        <ResolutionLadder />

        <MeritWeights
          valueOf={valueOf}
          onChange={set}
          sum={weightSum}
          valid={weightsValid}
          disabled={!canMutate}
        />
      </Section>

      {/* ── Timeouts ──────────────────────────────────────────────────── */}
      <Section id="timeouts">
        {bySection('timeouts').map((f) => (
          <Field
            key={f.key}
            field={f}
            value={valueOf(f)}
            dirty={isDirty(f)}
            onChange={(v) => set(f.key, v)}
            disabled={!canMutate}
            // A timeout is only meaningful against what plans actually take.
            measured={f.key === 'plan_timeout_ms' ? measured : undefined}
          />
        ))}
      </Section>

      {/* ── Memory & retrieval ────────────────────────────────────────── */}
      <Section id="retrieval">
        {bySection('retrieval').map((f) => (
          <Field
            key={f.key}
            field={f}
            value={valueOf(f)}
            dirty={isDirty(f)}
            onChange={(v) => set(f.key, v)}
            disabled={!canMutate}
          />
        ))}

        {incoherent.map((problem) => (
          <Callout key={problem} tone="var(--status-warn)" kicker="INCOHERENT COMBINATION">
            {problem}
          </Callout>
        ))}
      </Section>

      <RetiredAxes />

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        {save.error && <ErrorState reason={save.error} />}

        {save.isLoading === false && changed.length === 0 && (
          <p className="text-[12px] text-[var(--fg-muted)]">
            Nothing changed yet.
          </p>
        )}

        {changed.length > 0 && (
          <>
            <p className="text-[12.5px] leading-[1.55] text-[var(--fg-secondary)]">
              {changed.length} value{changed.length === 1 ? '' : 's'} changed. This applies to
              plans started after the save — <strong>nothing in flight changes</strong>. The
              edit is hot-applied and ephemeral: it lives in the running kernel, and
              <code className="mx-1">config.json</code> stays the boot default, so a restart
              reverts it.
            </p>
            <ReasonField gate={gate} id="dispatch-reason" disabled={!canMutate} />
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={async () => {
              const ok = await save.mutate(draft, gate.reason.trim());
              if (ok) {
                setDraft({});
                gate.reset();
              }
            }}
            disabled={
              !canMutate ||
              changed.length === 0 ||
              !gate.satisfied ||
              !weightsValid ||
              save.isLoading
            }
          >
            {save.isLoading ? 'Applying…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={() => setDraft({})} disabled={changed.length === 0}>
            Reset all to defaults
          </Button>
          {!weightsValid && (
            <span className="text-[11.5px] text-[var(--status-warn)]">
              The merit weights must sum to 1 before this can be saved.
            </span>
          )}
          {!canMutate && (
            <span className="text-[11.5px] text-[var(--status-warn)]">
              Operator role required to change kernel configuration.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Where these values came from.
 *
 * A form that hides precedence produces the worst configuration bug there is:
 * you change a value, it saves, and nothing happens because something upstream
 * pins it. The kernel does not publish that yet, so this says so outright
 * rather than implying the numbers are live.
 */
function SourceNote({ schemaMissing }: { schemaMissing: boolean }) {
  if (!schemaMissing) return null;
  return (
    <p
      className="mt-2 max-w-[680px] rounded-md p-2.5 text-[12px] leading-[1.55] tint-wash tint-ring"
      style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
    >
      <span className="text-[var(--status-warn)]">
        This kernel does not publish its configuration schema.
      </span>{' '}
      <span className="text-[var(--fg-secondary)]">
        The values below are the kernel&rsquo;s <em>documented defaults</em>, not what this
        instance is currently running — and the console cannot tell you whether a field is
        pinned by an env var or a config file. Saving still works: it writes the tunable
        directly. Reading it back needs <code>GetConfigSchema</code> on the contract.
      </span>
    </p>
  );
}

/**
 * The ladder, drawn as the chain it is.
 *
 * Including the rung that deliberately does not exist, because "why is there no
 * fuzzy match" is the first question anyone asks and the answer is a real
 * safety property rather than an omission.
 */
function ResolutionLadder() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-[var(--bg-canvas)] p-3">
      <div className="type-label text-[var(--fg-muted)]">
        Capability resolution
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {RESOLUTION_LADDER.map((rung, i) => (
          <span key={rung.label} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[var(--fg-muted)]">→</span>}
            <span
              className="rounded-sm px-1.5 py-0.5 font-mono text-[11px]"
              style={{
                color:
                  rung.label === 'fail' ? 'var(--status-err)' : 'var(--color-accent-400)',
                background: `color-mix(in srgb, ${
                  rung.label === 'fail' ? 'var(--status-err)' : 'var(--accent-bg)'
                } 12%, transparent)`,
              }}
              title={rung.detail}
            >
              {rung.label}
            </span>
          </span>
        ))}
      </div>
      <p className="text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
        There is deliberately <strong>no nearest-neighbour rung</strong>.{' '}
        <code>file-read</code> and <code>file-write</code> are embedding-close and
        semantically opposite, so a cosine match would confidently route a write to a
        reader. Synonyms live in a reviewed alias file instead, edited by a human.
      </p>
    </div>
  );
}

/** Three inputs, one constraint. */
function MeritWeights({
  valueOf,
  onChange,
  sum,
  valid,
  disabled,
}: {
  valueOf: (f: DispatchField) => number;
  onChange: (key: string, value: number) => void;
  sum: number;
  valid: boolean;
  disabled: boolean;
}) {
  const fields = MERIT_WEIGHT_KEYS.map(
    (k) => DISPATCH_FIELDS.find((f) => f.key === k)!,
  );
  const successWeight = valueOf(fields[0]);

  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-[var(--bg-canvas)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="type-label text-[var(--fg-muted)]">
          Merit weights
        </div>
        <span
          className="font-mono text-[11px]"
          style={{ color: valid ? 'var(--fg-muted)' : 'var(--status-warn)' }}
        >
          sums to {sum.toFixed(2)}
          {!valid && ' — must be 1.00'}
        </span>
      </div>

      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <label className="w-[190px] shrink-0 text-[12.5px]" htmlFor={f.key}>
              {f.label}
            </label>
            <input
              id={f.key}
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={valueOf(f)}
              disabled={disabled}
              onChange={(e) => onChange(f.key, Number(e.target.value))}
              className="flex-1 accent-[var(--accent-bg)]"
            />
            <span className="w-[42px] shrink-0 text-right font-mono text-[11.5px]">
              {valueOf(f).toFixed(2)}
            </span>
          </div>
          <p className="pl-[202px] text-[11px] leading-[1.5] text-[var(--fg-muted)]">
            {f.consequence}
          </p>
        </div>
      ))}

      {/* The specific trap: weighting per-capability success heavily when the
          verifier has not labelled enough volume for the tags to mean anything. */}
      {successWeight >= 0.5 && (
        <Callout tone="var(--status-warn)" kicker="CHECK YOUR LABELLED VOLUME">
          Per-capability success is weighted at {successWeight.toFixed(2)}. That only ranks
          honestly on capabilities the verifier has labelled enough times — on a thin tag it
          ranks on noise, and the agent that happened to go first stays ahead.
        </Callout>
      )}
    </div>
  );
}

/** UI-015: skip and warn, never render an input. */
function RetiredAxes() {
  return (
    <details className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <summary className="cursor-pointer select-none text-[12.5px] text-[var(--fg-secondary)]">
        {RETIRED_AXES.length} retired settings are deliberately not shown
      </summary>
      <p className="mt-2 text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
        ADR-0100 removed the auction, so these no longer decide anything. If a stale schema
        still publishes them, this console skips them rather than rendering an input —
        changing a flag the kernel no longer reads looks exactly like it worked.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {RETIRED_AXES.map((a) => (
          <li key={a.key} className="text-[11.5px] text-[var(--fg-muted)]">
            <code className="text-[var(--fg-secondary)]">{a.key}</code> — {a.why}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  const spec = SECTIONS.find((s) => s.id === id)!;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[14px] font-medium">{spec.title}</h3>
        <p className="mt-0.5 text-[12px] text-[var(--fg-muted)]">{spec.blurb}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  field,
  value,
  dirty,
  onChange,
  disabled,
  measured,
}: {
  field: DispatchField;
  value: number;
  dirty: boolean;
  onChange: (v: number) => void;
  disabled: boolean;
  measured?: MeasuredDurations;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-md p-3',
        // The mechanism is not a preference, and it does not look like one.
        field.mechanism ? 'tint-wash tint-ring' : 'bg-[var(--bg-canvas)]',
      )}
      style={
        field.mechanism
          ? ({ '--tint': 'var(--accent-bg)' } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1 text-[13px] font-medium" htmlFor={field.key}>
          {field.label}
          {field.mechanism && (
            <span className="type-label ml-2 text-[var(--color-accent-400)]">
              Mechanism
            </span>
          )}
          {dirty && (
            <span className="type-status ml-2 text-[var(--status-warn)]">
              Changed
            </span>
          )}
        </label>

        {field.kind === 'toggle' ? (
          <input
            id={field.key}
            type="checkbox"
            checked={value >= 0.5}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          />
        ) : (
          <span className="flex items-center gap-1.5">
            <Input
              id={field.key}
              type="number"
              value={String(value)}
              min={field.min}
              max={field.max}
              step={field.step}
              disabled={disabled}
              onChange={(e) => onChange(Number(e.target.value))}
              className="w-[120px]"
            />
            {field.unit && (
              <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
                {field.unit}
              </span>
            )}
          </span>
        )}
      </div>

      <p className="text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
        {field.description}
      </p>
      <p className="text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
        {field.consequence}
      </p>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--fg-muted)]">
        <span>
          default{' '}
          <code>
            {field.kind === 'toggle' ? (field.fallback ? 'on' : 'off') : field.fallback}
          </code>
        </span>
        <span className="font-mono">execution.{field.key}</span>
      </div>

      {measured && <MeasuredNote measured={measured} configured={value} />}
    </div>
  );
}

interface MeasuredDurations {
  slowestMs: number;
  completed: number;
}

/**
 * A timeout against the real distribution, not against a round number.
 *
 * Derived from the plans in the projection, so it is what this deployment
 * actually does. With no completed plans it says unknown rather than implying
 * the timeout is generous.
 */
function useMeasuredPlanDurations(
  plans: { status: string; elapsed_ms: number }[],
): MeasuredDurations {
  return useMemo(() => {
    const done = plans.filter(
      (p) => p.status === 'completed' && Number.isFinite(p.elapsed_ms),
    );
    return {
      slowestMs: done.reduce((max, p) => Math.max(max, p.elapsed_ms), 0),
      completed: done.length,
    };
  }, [plans]);
}

function MeasuredNote({
  measured,
  configured,
}: {
  measured: MeasuredDurations;
  configured: number;
}) {
  if (measured.completed === 0) {
    return (
      <p className="text-[11.5px] text-[var(--fg-muted)]">
        No completed plans in the projection, so there is nothing to compare this against —
        unknown, not comfortable.
      </p>
    );
  }

  const tight = configured < measured.slowestMs * 1.2;

  return (
    <p
      className="text-[11.5px]"
      style={{ color: tight ? 'var(--status-warn)' : 'var(--fg-muted)' }}
    >
      Your slowest completed plan took {formatDuration(measured.slowestMs)} across{' '}
      {measured.completed} plan{measured.completed === 1 ? '' : 's'}.
      {tight &&
        ' This timeout leaves under 20% headroom over that — plans that were about to succeed will be killed as failures.'}
    </p>
  );
}

function Callout({
  tone,
  kicker,
  children,
}: {
  tone: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-md p-2.5 tint-wash tint-ring"
      style={{ '--tint': tone } as React.CSSProperties}
    >
      <span
        className="type-label"
        style={{ color: tone }}
      >
        {kicker}
      </span>
      <span className="text-[12px] leading-[1.55] text-[var(--fg-primary)]">{children}</span>
    </div>
  );
}
