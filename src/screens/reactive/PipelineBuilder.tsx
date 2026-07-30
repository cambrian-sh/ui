import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import {
  ReasonField,
  useReasonGate,
} from '@/design-system/components/cambrian/reason-field';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { cn } from '@/design-system/lib/utils';
import type { WatchConfigFull } from '@/ipc/types';
import {
  dangerousPayloadKeys,
  isLlmGate,
  MODE_COPY,
  pipelineMode,
  suggestsDeterministic,
} from './pipelineModel';
import { BacktestPane } from './BacktestPane';

const SOURCE_TYPES = ['daemon', 'filesystem', 'webhook', 'signal_stream', 'schedule'];
const CONDITION_TYPES = ['deterministic', 'pattern', 'llm', 'always'];
const ACTION_TYPES = ['start_plan', 'dispatch_agent', 'emit_event', 'ingest'];

/**
 * The pipeline builder.
 *
 * A vertical spine — Source → Throttle → Gate — then the arms. Deliberately
 * **not free-form graph editing**: arms fan out from the gate and each is a
 * short chain, which is expressive enough for anything a signal can reasonably
 * do and stays legible, which arbitrary graphs stop being at about six nodes.
 *
 * `WatchConfig` holds **one** action today, so arms beyond the first are marked
 * `needs fan-out` rather than drawn as though they would work. A builder that
 * lets you draw what the engine silently collapses is worse than one that says
 * "not yet" (report.md §4.14a).
 */
export function PipelineBuilder({
  config: initial,
  onClose,
  onSaved,
}: {
  config: WatchConfigFull;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<WatchConfigFull>(initial);
  const gate = useReasonGate();
  const [showBacktest, setShowBacktest] = useState(false);

  const set = (patch: Partial<WatchConfigFull>) =>
    setConfig((c) => {
      const next = { ...c, ...patch };
      // REACT-03: the approval is an ack of a SPECIFIC prompt and field list.
      // Any change to either invalidates it — this reset is the part that is
      // easy to skip and matters most.
      if (
        patch.condition !== undefined ||
        patch.condition_payload_keys !== undefined ||
        patch.condition_type !== undefined
      ) {
        next.approved = false;
      }
      return next;
    });

  const save = useMutation(async (reason: string) => ipc.registerWatch(config, reason));

  const mode = pipelineMode(config);
  const llm = isLlmGate(config);
  const needsApproval = llm && !config.approved;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <h1 className="text-[17px] font-medium tracking-[-0.01em]">
          {initial.id ? config.name || config.id : 'New pipeline'}
        </h1>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.1em]"
          style={{ color: MODE_COPY[mode].tone }}
        >
          {MODE_COPY[mode].label}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          ← back to pipelines
        </button>
      </div>

      <div className="grid gap-4 px-4 pb-6 lg:grid-cols-[232px_1fr]">
        {/* The spine. */}
        <div className="flex flex-col gap-2">
          <Stage title="Source" counter={config.source_stream_id || 'unbound'}>
            <Select
              label="Type"
              value={config.source_type}
              options={SOURCE_TYPES}
              onChange={(v) => set({ source_type: v })}
            />
            {config.source_type === 'schedule' ? (
              <>
                <Field
                  label="Cron"
                  value={config.source_cron}
                  onChange={(v) => set({ source_cron: v })}
                  placeholder="0 9 * * 1-5"
                />
                <Field
                  label="Timezone"
                  value={config.source_timezone}
                  onChange={(v) => set({ source_timezone: v })}
                  placeholder="Europe/Istanbul"
                />
                <Select
                  label="Missed fire"
                  value={config.missed_fire_policy}
                  options={['skip', 'fire_once']}
                  onChange={(v) => set({ missed_fire_policy: v })}
                />
              </>
            ) : (
              <Field
                label="Stream"
                value={config.source_stream_id}
                onChange={(v) => set({ source_stream_id: v })}
                placeholder="prices"
              />
            )}
            {mode === 'broken' && (
              <p className="text-[11px] text-[var(--status-err)]">
                Nothing bound — this can never fire.
              </p>
            )}
            {/* Stream availability is not projected: a crashed daemon marks a
                stream unavailable and every watch on it silently stops
                evaluating, and the console cannot see that (§4.14c). */}
            <p className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
              Whether this stream is alive, and how many watches hold it, is not reported by
              this kernel — so a crashed daemon would stop this evaluating without showing
              here.
            </p>
          </Stage>

          <Connector />

          <Stage title="Throttle" counter={`${config.debounce_seconds}s`}>
            <Field
              label="Debounce (s)"
              value={String(config.debounce_seconds)}
              onChange={(v) => set({ debounce_seconds: Number(v) || 0 })}
            />
            <Field
              label="Max concurrent plans"
              value={String(config.max_concurrent_plans)}
              onChange={(v) => set({ max_concurrent_plans: Number(v) || 1 })}
            />
            <p className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">
              This is the stage that makes a storm survivable, which is why it is a node and
              not an advanced setting. Coalescing means one plan per window, not one per
              signal.
            </p>
          </Stage>

          <Connector />

          <Stage title="Gate" counter={config.condition_type}>
            <Select
              label="Condition"
              value={config.condition_type}
              options={CONDITION_TYPES}
              onChange={(v) => set({ condition_type: v })}
            />
          </Stage>
        </div>

        {/* Gate inspector + arms. */}
        <div className="flex flex-col gap-3">
          {llm && (
            <GateInspector
              config={config}
              onChange={set}
              needsApproval={needsApproval}
            />
          )}

          {!llm && (
            <Panel title="Condition">
              <textarea
                value={config.condition}
                onChange={(e) => set({ condition: e.target.value })}
                rows={3}
                aria-label="Condition"
                className="w-full resize-y rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-2 font-mono text-[12px] text-[var(--input-fg)]"
              />
            </Panel>
          )}

          <Arms config={config} onChange={set} />

          <Panel title="Before you arm it">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowBacktest((s) => !s)}>
                {showBacktest ? 'Hide backtest' : 'Backtest against the journal'}
              </Button>
              <span className="text-[11.5px] text-[var(--fg-muted)]">
                Replays real signals through this exact config. It never runs an arm.
              </span>
            </div>
            {showBacktest && (
              <div className="mt-3">
                <BacktestPane config={config} onSuggest={(s) => set({ debounce_seconds: s })} />
              </div>
            )}
          </Panel>

          {save.error && <ErrorState reason={save.error} />}

          <Panel title="Save">
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={config.dry_run}
                onChange={(e) => set({ dry_run: e.target.checked })}
              />
              <span>
                Dry run — evaluate for real, record would-fires, run no arm
              </span>
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={config.active}
                onChange={(e) => set({ active: e.target.checked })}
                disabled={needsApproval}
              />
              <span>
                Active
                {needsApproval && (
                  <span className="ml-2 text-[var(--status-warn)]">
                    — approve the llm gate first
                  </span>
                )}
              </span>
            </label>

            <ReasonField gate={gate} id="pipeline-reason" />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={async () => {
                  const ok = await save.mutate(gate.reason.trim());
                  if (ok) onSaved();
                }}
                disabled={!gate.satisfied || save.isLoading || (needsApproval && config.active)}
              >
                {save.isLoading ? 'Saving…' : 'Save pipeline'}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Discard
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/**
 * The gate inspector — the security surface.
 *
 * When the condition is an llm one, this panel is doing injection containment.
 * A signal payload can carry instructions written by a third party, and this
 * gate decides an unattended action, so the panel leads with that rather than
 * with a prompt box.
 */
function GateInspector({
  config,
  onChange,
  needsApproval,
}: {
  config: WatchConfigFull;
  onChange: (patch: Partial<WatchConfigFull>) => void;
  needsApproval: boolean;
}) {
  const [candidate, setCandidate] = useState('');
  const dangerous = dangerousPayloadKeys(config.condition_payload_keys);
  const talkOut = suggestsDeterministic(config);

  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] p-3.5 tint-wash tint-ring"
      style={{ '--tint': 'var(--status-err)' } as React.CSSProperties}
    >
      <div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-err)]">
          THIS GATE READS UNTRUSTED INPUT
        </span>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-[var(--fg-primary)]">
          A signal payload can carry instructions written by whoever produced it, and this
          gate decides an <strong>unattended</strong> action. Every field you allow through
          is a field an attacker can write.
        </p>
      </div>

      {/* The panel argues against itself. */}
      {talkOut && (
        <p
          className="rounded-md p-2 text-[12px] leading-[1.55] tint-wash"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">
            A deterministic gate would express this exactly.
          </span>{' '}
          <span className="text-[var(--fg-secondary)]">
            This looks like a numeric threshold on one field. Deterministic costs nothing,
            cannot be talked out of its answer, and removes this injection surface entirely.
          </span>
        </p>
      )}

      <div>
        <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Fields the gate may see ({config.condition_payload_keys.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {config.condition_payload_keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                onChange({
                  condition_payload_keys: config.condition_payload_keys.filter((x) => x !== k),
                })
              }
              className={cn(
                'rounded-sm px-1.5 py-0.5 font-mono text-[11px]',
                dangerous.includes(k)
                  ? 'text-[var(--status-err)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--status-err)_40%,transparent)]'
                  : 'text-[var(--color-accent-400)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-bg)_34%,transparent)]',
              )}
            >
              {k} ×
            </button>
          ))}
          {config.condition_payload_keys.length === 0 && (
            <span className="text-[11.5px] text-[var(--fg-muted)]">
              None allowed — the gate sees no payload at all.
            </span>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <Input
            value={candidate}
            onChange={(e) => setCandidate(e.target.value)}
            placeholder="price"
            aria-label="Allow a field"
            className="w-[180px]"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!candidate.trim()}
            onClick={() => {
              onChange({
                condition_payload_keys: [
                  ...config.condition_payload_keys,
                  candidate.trim(),
                ],
              });
              setCandidate('');
            }}
          >
            Allow
          </Button>
        </div>

        {dangerous.length > 0 && (
          <p className="mt-2 text-[11.5px] leading-[1.55] text-[var(--status-err)]">
            {dangerous.join(', ')} {dangerous.length === 1 ? 'is' : 'are'} free-form
            third-party text. One of those widens the surface more than every structured
            field combined — a number cannot carry an instruction.
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Prompt
        </div>
        <textarea
          value={config.condition}
          onChange={(e) => onChange({ condition: e.target.value })}
          rows={3}
          aria-label="Gate prompt"
          className="w-full resize-y rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-2 font-mono text-[12px] text-[var(--input-fg)]"
        />
        <p className="mt-1 text-[11px] leading-[1.5] text-[var(--fg-muted)]">
          The answer shape is enforced by the engine, not by this prompt. A reply that is
          neither verdict is a failure and dead-letters rather than being guessed at.
        </p>
      </div>

      <label className="flex items-start gap-2 text-[12px]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={config.approved}
          onChange={(e) => onChange({ approved: e.target.checked })}
        />
        <span>
          <span className="font-medium">I have read this gate and approve it.</span>
          <span className="block text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
            Recorded in the audit log. It resets automatically whenever the prompt or the
            field list changes, because an approval is an ack of a specific gate — not of the
            idea of one.
          </span>
        </span>
      </label>

      {needsApproval && (
        <p className="text-[11.5px] text-[var(--status-warn)]">
          Unapproved, so this cannot be armed.
        </p>
      )}
    </div>
  );
}

/**
 * The arms.
 *
 * One is storable today. Arms beyond the first are drawn but badged, because
 * `WatchConfig` holds a single `Action` and drawing a fan-out the engine would
 * silently collapse is worse than saying "not yet".
 */
function Arms({
  config,
  onChange,
}: {
  config: WatchConfigFull;
  onChange: (patch: Partial<WatchConfigFull>) => void;
}) {
  return (
    <Panel title="Arms">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-[var(--bg-canvas)] p-2.5">
          <Select
            label="Action"
            value={config.action.type}
            options={ACTION_TYPES}
            onChange={(v) => onChange({ action: { ...config.action, type: v } })}
          />
          {config.action.type === 'dispatch_agent' && (
            <Select
              label="Target"
              value={config.action.target_type || 'capability'}
              options={['capability', 'agent_id']}
              onChange={(v) => onChange({ action: { ...config.action, target_type: v } })}
            />
          )}
          <Field
            label="Target"
            value={config.action.target}
            onChange={(v) => onChange({ action: { ...config.action, target: v } })}
            placeholder="summarise"
          />
          <Field
            label="Payload"
            value={config.action.payload}
            onChange={(v) => onChange({ action: { ...config.action, payload: v } })}
            placeholder="price moved to {price}"
          />
        </div>

        <div
          className="flex items-center gap-2 rounded-md p-2.5 tint-wash"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-warn)]">
            needs fan-out
          </span>
          <span className="text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">
            A second arm cannot be stored: the kernel holds one action per watch. Adding one
            here would draw a fan-out the engine silently collapses, so it is disabled until
            the schema carries multiple actions.
          </span>
        </div>
      </div>
    </Panel>
  );
}

function Stage({
  title,
  counter,
  children,
}: {
  title: string;
  counter: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[var(--elevation-1)]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{counter}</span>
      </div>
      {children}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center" aria-hidden="true">
      <span className="h-4 w-px bg-[var(--border-strong)]" />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <h3 className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-[var(--fg-secondary)]">
      {label}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-[var(--fg-secondary)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--input-fg)]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
