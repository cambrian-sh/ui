import { useEffect, useMemo, useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import {
  ReasonField,
  useReasonGate,
} from '@/design-system/components/cambrian/reason-field';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/design-system/components/ui/toggle-group';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { formatTokens } from '@/lib/format';
import { cn } from '@/design-system/lib/utils';
import { previewRoute, routeAdvice, routeSummary } from './routePreview';
import { takePlanDraft } from './planDraft';
import type { AgentSummary, AuthoredStep, GeneratorSpec, RoleAssignment } from '@/ipc/types';

/** A fresh step. `fan_out_over: -1` is "not a fan-out" — 0 is a real index. */
export function blankStep(): AuthoredStep {
  return {
    query: '',
    required_capabilities: [],
    depends_on: [],
    max_energy: 0,
    recommended_model: '',
    checkpoint_after: false,
    checkpoint_query: '',
    is_thought: false,
    preferred_agent: '',
    agent_pin: '',
    fan_out_over: -1,
    fan_out_var: '',
  };
}

/** How deep a step sits — steps at the same depth render side by side. */
export function depthOf(steps: AuthoredStep[], index: number, seen = new Set<number>()): number {
  if (seen.has(index)) return 0; // a cycle cannot deepen forever
  const step = steps[index];
  if (!step || step.depends_on.length === 0) return 0;
  const next = new Set(seen).add(index);
  return 1 + Math.max(...step.depends_on.map((d) => depthOf(steps, d, next)));
}

type AgentMode = 'dispatch' | 'prefer' | 'pin';

function agentMode(step: AuthoredStep): AgentMode {
  if (step.agent_pin) return 'pin';
  if (step.preferred_agent) return 'prefer';
  return 'dispatch';
}

const pad = (n: number) => String(n + 1).padStart(2, '0');

/**
 * The DAG builder (`12b`).
 *
 * A **face for the plan schema, not a new one**: every field maps to something
 * already on `domain.Step`. Steps flow top to bottom and steps at the same
 * dependency depth sit side by side; dependencies are drawn with CSS rails and
 * **also carried as text** (`waits on 02`), because a drawing alone is ambiguous
 * once there are more than four nodes.
 *
 * What makes it feel alive is route preview: the eligibility gate is a pure
 * function over declared manifests, so "who would take this step" is answerable
 * while the operator types — zero RPCs, zero agent boots — and a capability that
 * matches nobody turns its card red **as it is typed** rather than failing the
 * plan at step four.
 */
export function DagBuilder() {
  const projection = useStore(projectionStore);
  const agents = projection.state?.agents ?? [];

  // A proposal handed over by "Open in the builder" (`12a` §C.2). Taken ONCE on
  // mount: a later visit should show what the operator left here, not resurrect
  // a proposal from an earlier conversation.
  const [draft] = useState(() => takePlanDraft());
  const [title, setTitle] = useState(draft?.title ?? 'Untitled plan');
  const [steps, setSteps] = useState<AuthoredStep[]>(
    draft?.steps?.length ? draft.steps : [blankStep()],
  );
  const [selected, setSelected] = useState<number>(0);
  const gate = useReasonGate();

  // The role map (`9b`) supplies the model a step INHERITS, so the override is
  // shown against a real value rather than as a blank field to fill.
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [generators, setGenerators] = useState<GeneratorSpec[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        setRoles(await ipc.listRoleAssignments());
        setGenerators(await ipc.listGenerators());
      } catch {
        // A kernel without the generator registry simply shows no inherited
        // value; the override field still works.
      }
    })();
  }, []);

  const submit = useMutation(async (dryRun: boolean, reason: string) =>
    ipc.submitPlan(steps, reason, dryRun),
  );

  const rows = useMemo(() => {
    const byDepth = new Map<number, number[]>();
    steps.forEach((_, i) => {
      const d = depthOf(steps, i);
      const list = byDepth.get(d);
      if (list) list.push(i);
      else byDepth.set(d, [i]);
    });
    return Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0]);
  }, [steps]);

  const update = (i: number, patch: Partial<AuthoredStep>) =>
    setSteps((s) => s.map((step, j) => (j === i ? { ...step, ...patch } : step)));

  const totalEnergy = steps.reduce((n, s) => n + s.max_energy, 0);
  const maxParallel = useMemo(
    () => Math.max(1, ...rows.map(([, idx]) => idx.length)),
    [rows],
  );

  // "every step routable — checked without running anything". Computed over the
  // same set containment the kernel's L1 gate applies.
  const unroutable = useMemo(
    () =>
      steps.filter(
        (s) => !s.is_thought && previewRoute(agents, s.required_capabilities).unmatched !== null,
      ).length,
    [steps, agents],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 pt-4 shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Plan name"
          className="min-w-[180px] flex-none rounded-md bg-transparent px-1 text-[19px] font-medium leading-[1.25] tracking-[-0.01em] text-[var(--fg-primary)] hover:bg-[color-mix(in_srgb,var(--fg-primary)_5%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        />
        <span className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          draft
        </span>

        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          {steps.length} steps · {maxParallel} parallel · est.{' '}
          {totalEnergy > 0 ? `${formatTokens(totalEnergy)} tokens` : 'no ceiling set'} ·{' '}
          {unroutable === 0 ? (
            <span className="text-[var(--status-live)]">every step routable</span>
          ) : (
            <span className="text-[var(--status-err)]">
              {unroutable} step{unroutable === 1 ? '' : 's'} routable by nobody
            </span>
          )}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled title="Templates are not stored on this build">
            Save as a template
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!gate.satisfied || submit.isLoading}
            onClick={() => void submit.mutate(true, gate.reason.trim())}
          >
            Dry run
          </Button>
          <Button
            size="sm"
            disabled={!gate.satisfied || submit.isLoading}
            onClick={() => void submit.mutate(false, gate.reason.trim())}
          >
            Run this plan
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-2">
          {rows.map(([depth, indices]) => (
            <div key={depth} className="flex flex-col">
              {depth > 0 && (
                // The rail into this row. Drawn in CSS — no coordinate maths, no
                // SVG. `h-4` on a flex child, never a margin: a margin-top inside
                // a fixed-height row collapses the box and the legs vanish.
                <div
                  aria-hidden="true"
                  className="mx-auto h-4 w-px border-l border-dashed border-[var(--border-strong)]"
                />
              )}
              {/* Same-depth steps sit side by side. `items-stretch` keeps the
                  split bracket's children filling the row. */}
              <div className="flex flex-wrap items-stretch gap-2">
                {indices.map((i) => (
                  <StepCard
                    key={i}
                    index={i}
                    step={steps[i]}
                    agents={agents}
                    selected={selected === i}
                    onSelect={() => setSelected(i)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-1 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSteps((s) => [...s, blankStep()]);
                setSelected(steps.length);
              }}
            >
              Add a step
            </Button>
            <span className="text-[11.5px] text-[var(--fg-muted)]">
              or drag one in from a template
            </span>
          </div>

          {/* Why the routability claim above can be trusted. */}
          <div className="mt-2 max-w-[560px] rounded-md p-2.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
            <p className="text-[11.5px] font-medium text-[var(--fg-secondary)]">
              {unroutable === 0
                ? 'Every step here is routable — checked without running anything'
                : 'Some steps cannot be routed as written'}
            </p>
            <p className="mt-1 text-[11px] leading-[1.55] text-[var(--fg-muted)]">
              The eligibility gate is set containment over declared manifests, so the eligible
              set is computable here at zero cost: no calls, no agent boots. A capability that
              matches nobody turns its card red while you type it rather than failing the plan
              at step four. Which eligible agent goes first is decided by merit at dispatch and
              is not guessed here.
            </p>
          </div>
        </div>

        {steps[selected] && (
          <StepInspectorPanel
            key={selected}
            index={selected}
            step={steps[selected]}
            steps={steps}
            agents={agents}
            roles={roles}
            generators={generators}
            onChange={(patch) => update(selected, patch)}
            onDuplicate={() => {
              setSteps((s) => [
                ...s.slice(0, selected + 1),
                { ...s[selected] },
                ...s.slice(selected + 1),
              ]);
              setSelected(selected + 1);
            }}
            onDelete={() => {
              setSteps((s) => s.filter((_, j) => j !== selected));
              setSelected(0);
            }}
          />
        )}
      </div>

      <div className="flex flex-none flex-col gap-2.5 px-4 pb-4 pt-3 shadow-[inset_0_1px_0_var(--border-subtle)]">
        {submit.error && (
          <ErrorState
            reason={submit.error}
            whatToDo="Nothing was started. If this kernel does not accept operator-authored plans, the builder still authors and dry-runs them."
          />
        )}
        <ReasonField gate={gate} id="dag-reason" />
      </div>
    </div>
  );
}

function StepCard({
  index,
  step,
  agents,
  selected,
  onSelect,
}: {
  index: number;
  step: AuthoredStep;
  agents: AgentSummary[];
  selected: boolean;
  onSelect: () => void;
}) {
  const route = previewRoute(agents, step.required_capabilities);
  // Red the moment a capability matches nobody — while it is being typed, not
  // when the plan fails at step four. A thought step routes to no agent by
  // design, so it is exempt.
  const broken = !step.is_thought && route.unmatched !== null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-[268px] flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 text-left transition-colors',
        'shadow-[var(--elevation-1)] hover:brightness-110',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        selected && 'shadow-[inset_0_0_0_1px_var(--accent-bg)]',
        broken && 'tint-wash tint-ring',
      )}
      style={broken ? ({ '--tint': 'var(--status-err)' } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{pad(index)}</span>
        {step.fan_out_over >= 0 && (
          <span className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-accent-400)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_34%,transparent)]">
            fans out
          </span>
        )}
        {step.checkpoint_after && (
          <span className="font-mono text-[10px] text-[var(--status-live)]">verified</span>
        )}
        {step.max_energy > 0 && (
          <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">
            {formatTokens(step.max_energy)} tok
          </span>
        )}
      </div>

      <span className="line-clamp-2 text-[12.5px] leading-[1.4] text-[var(--fg-primary)]">
        {step.query || <span className="italic opacity-60">describe the step</span>}
      </span>

      <span className="flex flex-wrap items-center gap-1.5">
        {step.required_capabilities.map((c) => (
          <span
            key={c}
            className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-accent-400)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_34%,transparent)]"
          >
            {c}
          </span>
        ))}
      </span>

      {/* Who would take it — computed, not guessed. */}
      <span
        className={cn(
          'font-mono text-[10.5px]',
          broken ? 'text-[var(--status-err)]' : 'text-[var(--fg-muted)]',
        )}
      >
        {step.is_thought ? 'thought step · runs in the kernel' : routeSummary(route, step)}
      </span>

      {step.fan_out_over >= 0 && (
        <span className="text-[10.5px] text-[var(--fg-muted)]">
          one run per item from {pad(step.fan_out_over)}
        </span>
      )}

      {/* The drawing is not enough once there are more than four nodes. */}
      {step.depends_on.length > 0 && (
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
          waits on {step.depends_on.map((d) => pad(d)).join(', ')}
        </span>
      )}
    </button>
  );
}

function StepInspectorPanel({
  index,
  step,
  steps,
  agents,
  roles,
  generators,
  onChange,
  onDuplicate,
  onDelete,
}: {
  index: number;
  step: AuthoredStep;
  steps: AuthoredStep[];
  agents: AgentSummary[];
  roles: RoleAssignment[];
  generators: GeneratorSpec[];
  onChange: (patch: Partial<AuthoredStep>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  // Derived from the fields on entry, then held: picking "prefer" before typing
  // an id must not read back as "let dispatch decide".
  const [mode, setMode] = useState<AgentMode>(agentMode(step));
  const [capDraft, setCapDraft] = useState('');

  const route = previewRoute(agents, step.required_capabilities);
  const advice = routeAdvice(route, step.required_capabilities);

  // What this step INHERITS if it does not override. The router role is the one
  // a dispatched step follows.
  const inheritedRole = roles.find((r) => r.role === 'router');
  const inheritedGen = generators.find((g) => g.id === inheritedRole?.generator_id);

  const addCapability = (c: string) => {
    const v = c.trim();
    if (!v || step.required_capabilities.includes(v)) return;
    onChange({ required_capabilities: [...step.required_capabilities, v] });
    setCapDraft('');
  };

  return (
    <aside className="flex h-fit flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div className="flex items-center gap-2">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Step {pad(index)}
        </div>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      <Labelled label="What this step does">
        <textarea
          value={step.query}
          onChange={(e) => onChange({ query: e.target.value })}
          rows={3}
          aria-label="Step query"
          className="w-full resize-y rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-2 text-[12.5px] text-[var(--input-fg)]"
        />
      </Labelled>

      <Labelled label="Capabilities it requires">
        <div className="flex flex-wrap items-center gap-1.5">
          {step.required_capabilities.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() =>
                onChange({
                  required_capabilities: step.required_capabilities.filter((x) => x !== c),
                })
              }
              className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-accent-400)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_34%,transparent)] hover:brightness-125"
            >
              {c} <span aria-hidden="true">✕</span>
              <span className="sr-only">remove {c}</span>
            </button>
          ))}
          <Input
            value={capDraft}
            onChange={(e) => setCapDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCapability(capDraft);
              }
            }}
            placeholder="+ add"
            aria-label="Add a required capability"
            className="h-7 w-[104px] text-[11.5px]"
          />
        </div>
        {/* Selection is a set containment over what the fleet declares, so a
            typo is measurable rather than mysterious. */}
        {route.vocabulary.length > 0 && (
          <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
            declared by the fleet: {route.vocabulary.join(', ')}
          </p>
        )}
      </Labelled>

      {/* Who is eligible, and what that means for the run. */}
      <div
        className={cn(
          'flex flex-col gap-1.5 rounded-md p-2.5',
          route.unmatched ? 'tint-wash tint-ring' : 'shadow-[inset_0_0_0_1px_var(--border-subtle)]',
        )}
        style={
          route.unmatched ? ({ '--tint': 'var(--status-err)' } as React.CSSProperties) : undefined
        }
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-medium">
            {route.eligible.length === 1
              ? '1 agent is eligible'
              : `${route.eligible.length} agents are eligible`}
          </span>
          <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
            of {route.registered} registered
          </span>
        </div>

        <ul className="flex flex-col gap-1">
          {route.eligible.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{a.id}</span>
              {/* Trust is a real published number. It is NOT the merit the
                  scorer ranks on, and is labelled so nobody reads it as one. */}
              <span
                aria-hidden="true"
                className="h-1 w-[52px] rounded-full bg-[color-mix(in_srgb,var(--fg-primary)_10%,transparent)]"
              >
                <span
                  className="block h-1 rounded-full bg-[var(--accent-bg)]"
                  style={{ width: `${Math.round(Math.max(0, Math.min(1, a.trust_score)) * 100)}%` }}
                />
              </span>
              <span className="w-[52px] shrink-0 text-right font-mono text-[10px] text-[var(--fg-muted)]">
                trust {a.trust_score.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-[11px] leading-[1.55] text-[var(--fg-secondary)]">{advice}</p>
      </div>

      <Labelled label="Depends on">
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((_, j) =>
            j === index ? null : (
              <button
                key={j}
                type="button"
                onClick={() =>
                  onChange({
                    depends_on: step.depends_on.includes(j)
                      ? step.depends_on.filter((d) => d !== j)
                      : [...step.depends_on, j].sort((a, b) => a - b),
                  })
                }
                aria-pressed={step.depends_on.includes(j)}
                className={cn(
                  'rounded-sm px-1.5 py-0.5 font-mono text-[10px] shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:brightness-125',
                  step.depends_on.includes(j) && 'tint-wash text-[var(--fg-primary)]',
                )}
                style={
                  step.depends_on.includes(j)
                    ? ({ '--tint': 'var(--accent-bg)' } as React.CSSProperties)
                    : undefined
                }
              >
                {pad(j)}
              </button>
            ),
          )}
        </div>
        <p className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
          {step.depends_on.length === 0
            ? 'Nothing — it starts with the plan.'
            : `It waits on ${step.depends_on
                .map((d) => pad(d))
                .join(', ')}, which is why it sits below ${
                step.depends_on.length === 1 ? 'that step' : 'those steps'
              } rather than beside ${step.depends_on.length === 1 ? 'it' : 'them'}. A dependency already covered transitively changes nothing.`}
        </p>
      </Labelled>

      <Labelled label="Who runs it">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => {
            if (!v) return;
            const next = v as AgentMode;
            setMode(next);
            if (next === 'dispatch') onChange({ preferred_agent: '', agent_pin: '' });
            if (next === 'prefer') onChange({ agent_pin: '' });
            if (next === 'pin') onChange({ agent_pin: 'hard' });
          }}
          aria-label="Who runs this step"
        >
          <ToggleGroupItem value="dispatch">Let dispatch decide</ToggleGroupItem>
          <ToggleGroupItem value="prefer">Prefer an agent</ToggleGroupItem>
          <ToggleGroupItem value="pin">Pin it hard</ToggleGroupItem>
        </ToggleGroup>

        {mode !== 'dispatch' && (
          <div className="flex items-center gap-2">
            <Input
              value={step.preferred_agent}
              onChange={(e) => onChange({ preferred_agent: e.target.value })}
              placeholder="agent id"
              aria-label="Agent"
              className="h-8 text-[12px]"
            />
            <span className="shrink-0 font-mono text-[10px] text-[var(--fg-muted)]">
              {mode === 'pin' ? 'hard' : 'soft'}
            </span>
          </div>
        )}

        <p className="text-[11px] leading-[1.55] text-[var(--fg-muted)]">
          {mode === 'dispatch' &&
            'Eligibility gate, then merit ranking. The usual path, and the one that cascades on a failure.'}
          {mode === 'prefer' &&
            'Soft means it goes first and the merit ranking still exists behind it, so a crash cascades normally.'}
          {mode === 'pin' &&
            'Hard means this agent or nothing — the step dies if it is unavailable. Prefer soft unless the reason to pin is correctness rather than habit.'}
        </p>
      </Labelled>

      <Labelled label="Which model it uses">
        {/* An override on an INHERITED value, never a blank you must fill. */}
        <div className="rounded-md p-2 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Inherits the router role
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[var(--fg-secondary)]">
            {inheritedGen
              ? `${inheritedGen.model}${inheritedGen.disable_thinking ? ' · thinking off' : ''}`
              : inheritedRole?.generator_id || 'not reported by this kernel'}
          </div>
        </div>
        <Input
          value={step.recommended_model}
          onChange={(e) => onChange({ recommended_model: e.target.value })}
          placeholder="Override →"
          aria-label="Override the model"
          className="h-8 text-[12px]"
        />
        <p className="text-[11px] leading-[1.55] text-[var(--fg-muted)]">
          Overriding writes <code>recommended_model</code> on this step only. Worth doing when a
          step is unusually hard
          {inheritedGen?.disable_thinking
            ? ' — and worth remembering that the role map already has thinking switched off on this generator, which is a poor fit for arithmetic over many rows.'
            : '.'}
        </p>
      </Labelled>

      <Labelled label="Token ceiling">
        <Input
          type="number"
          min={0}
          value={String(step.max_energy)}
          onChange={(e) => onChange({ max_energy: Number(e.target.value) || 0 })}
          aria-label="Token ceiling"
          className="h-8 text-[12px]"
        />
        <p className="text-[11px] text-[var(--fg-muted)]">
          Past this the step is abandoned, not silently continued.
        </p>
      </Labelled>

      <Labelled label="Fan out over">
        <select
          value={String(step.fan_out_over)}
          onChange={(e) => onChange({ fan_out_over: Number(e.target.value) })}
          aria-label="Fan out over"
          className="h-8 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 text-[12px] text-[var(--input-fg)]"
        >
          {/* -1 is "not a fan-out". 0 is a real step index, so absence needs its
              own value rather than an empty string coerced to zero. */}
          <option value="-1">Not a fan-out</option>
          {steps.map((_, j) =>
            j === index ? null : (
              <option key={j} value={String(j)}>
                one run per item from {pad(j)}
              </option>
            ),
          )}
        </select>
        {step.fan_out_over >= 0 && (
          <Input
            value={step.fan_out_var}
            onChange={(e) => onChange({ fan_out_var: e.target.value })}
            placeholder="item"
            aria-label="Fan out variable"
            className="h-8 text-[12px]"
          />
        )}
        <p className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
          Name a list from an earlier step to run this once per item.
          {step.fan_out_over >= 0 && !step.depends_on.includes(step.fan_out_over) && (
            <span className="text-[var(--status-warn)]">
              {' '}
              It does not depend on {pad(step.fan_out_over)}, so it may run before that output
              exists.
            </span>
          )}
        </p>
      </Labelled>

      <Labelled label="Verify this step before moving on">
        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={step.checkpoint_after}
            onChange={(e) => onChange({ checkpoint_after: e.target.checked })}
            className="size-3.5 accent-[var(--accent-bg)]"
          />
          Check the output before the next step uses it
        </label>
        {step.checkpoint_after && (
          <Input
            value={step.checkpoint_query}
            onChange={(e) => onChange({ checkpoint_query: e.target.value })}
            placeholder="What must be true for this to be right?"
            aria-label="Verification question"
            className="h-8 text-[12px]"
          />
        )}
        <p className="text-[11px] leading-[1.55] text-[var(--fg-muted)]">
          A verifier checks the output against a question you write, and a rejection re-runs the
          step with the next-ranked agent. It earns its keep where a wrong answer is expensive to
          notice later — less so where the output either parses or does not.
        </p>
      </Labelled>
    </aside>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-[var(--fg-secondary)]">{label}</span>
      {children}
    </div>
  );
}
