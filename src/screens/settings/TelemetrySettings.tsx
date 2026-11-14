import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import {
  ReasonField,
  useReasonGate,
} from '@/design-system/components/cambrian/reason-field';
import { ipc } from '@/ipc';
import { useKernelQuery } from '@/lib/useKernelQuery';
import { useMutation } from '@/lib/useMutation';
import { cn } from '@/design-system/lib/utils';
import type { TelemetryAck, TelemetryConfig, TestTraceResult } from '@/ipc/types';

const BLANK: TelemetryConfig = {
  host: '',
  project: '',
  enabled: false,
  public_key_configured: false,
  public_key_last_four: '',
  secret_key_configured: false,
  secret_key_last_four: '',
  sample_rate: 1,
  send_structure_and_timings: true,
  send_prompts_and_outputs: false,
  send_from_enforcing_surfaces: false,
};

/**
 * Telemetry — Langfuse.
 *
 * Credentials are the easy half. The half every tracing integration must answer
 * and usually buries is **what leaves the box**, so the three switches are the
 * centre of this screen rather than a footnote — they are genuinely different
 * disclosure decisions, not one setting with a granularity slider.
 */
export function TelemetrySettings({ canMutate }: { canMutate: boolean }) {
  const gate = useReasonGate();
  const secretGate = useReasonGate();
  const [draft, setDraft] = useState<TelemetryConfig | null>(null);
  const [secret, setSecret] = useState('');
  const [warning, setWarning] = useState('');

  const config = useKernelQuery(['telemetry-config'], () => ipc.getTelemetryConfig(), {
    retry: 0,
  });
  const [testResult, setTestResult] = useState<TestTraceResult | null>(null);
  const test = useMutation(async () => {
    const r = await ipc.sendTestTrace();
    setTestResult(r);
    return r;
  });
  // A TelemetryAck refusal is an authoring outcome: surface its error inline; a
  // warning is something saved but not yet in effect (e.g. an env key still wins).
  const accept = (out: TelemetryAck) => {
    if (!out.ok) throw new Error(out.error || 'The kernel refused the change.');
    setWarning(out.warning);
    return out;
  };
  const save = useMutation(async (c: TelemetryConfig, reason: string) => {
    const out = accept(await ipc.setTelemetryConfig(c, reason));
    void config.refetch();
    return out;
  });
  const saveSecret = useMutation(async (key: string, reason: string) => {
    try {
      const out = accept(await ipc.setTelemetrySecretKey(key, reason));
      void config.refetch();
      return out;
    } finally {
      setSecret('');
    }
  });

  const live = draft ?? config.data ?? BLANK;
  const set = (patch: Partial<TelemetryConfig>) => setDraft({ ...live, ...patch });
  const selfHosted = Boolean(live.host) && !/cloud\.langfuse\.com/i.test(live.host);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="type-page-title">Telemetry</h2>
        <p className="type-page-description mt-1 max-w-[660px]">
          Traces go to Langfuse. The question this screen answers before the credentials is{' '}
          <strong>what leaves the box</strong>.
        </p>
      </div>

      {config.error && (
        <p
          className="max-w-[660px] rounded-md p-2.5 text-[12px] leading-[1.55] tint-wash tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          <span className="text-[var(--status-warn)]">
            This kernel serves no telemetry configuration,
          </span>{' '}
          <span className="text-[var(--fg-secondary)]">
            so nothing here can be read or written yet. The panel is built so the disclosure
            decisions are reviewable before the capability lands.
          </span>
        </p>
      )}

      {warning && (
        <p
          className="max-w-[660px] rounded-md p-2.5 text-[12px] leading-[1.55] tint-wash tint-ring"
          style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
        >
          {warning}
        </p>
      )}

      {/* The master switch, first: every save carries it (owner decision 2026-11-15). */}
      <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <Switch
          checked={live.enabled}
          onChange={(v) => set({ enabled: v })}
          disabled={!canMutate}
          tone="var(--status-live)"
          label="Send traces"
          body={
            live.enabled
              ? 'Tracing is on: the kernel sends traces to Langfuse, limited by the switches below.'
              : 'Tracing is off: nothing is sent, whatever the switches below say.'
          }
        />
      </section>

      {/* What leaves the box. */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <h3 className="type-label text-[var(--fg-muted)]">
          What leaves the box
        </h3>

        <Switch
          checked={live.send_structure_and_timings}
          onChange={(v) => set({ send_structure_and_timings: v })}
          disabled={!canMutate}
          label="Structure and timings"
          body="Plan and step shape, which agent ran, latency, token counts, error kinds. No content. Enough to debug a slow or failing run, and nothing an access policy protects."
        />

        <Switch
          checked={live.send_prompts_and_outputs}
          onChange={(v) => set({ send_prompts_and_outputs: v })}
          disabled={!canMutate}
          tone="var(--status-warn)"
          label="Prompts and model outputs"
          body="The actual text. This is where tracing earns its keep — and it means retrieved memory content and user messages are copied to a third party. Anything your access policy protects inside Cambrian is not protected once it is a trace."
        />

        <Switch
          checked={live.send_from_enforcing_surfaces}
          onChange={(v) => set({ send_from_enforcing_surfaces: v })}
          disabled={!canMutate}
          tone="var(--status-err)"
          label="Traces from surfaces with an enforcing policy"
          body="Off by default. A closed label exists precisely so that content does not travel; shipping its trace out is a hole in the boundary you drew."
        />

        {selfHosted && live.send_prompts_and_outputs && (
          <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
            The host does not look like Langfuse Cloud. Pointing at a self-hosted deployment
            makes the second switch much less consequential — the text still leaves this
            process, but not this organisation.
          </p>
        )}
      </section>

      {/* Credentials. */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <h3 className="type-label text-[var(--fg-muted)]">
          Credentials
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label="Host">
            <Input
              value={live.host}
              onChange={(e) => set({ host: e.target.value })}
              placeholder="https://cloud.langfuse.com"
              disabled={!canMutate}
              aria-label="Host"
            />
          </Labelled>
          <Labelled label="Project">
            <Input
              value={live.project}
              onChange={(e) => set({ project: e.target.value })}
              disabled={!canMutate}
              aria-label="Project"
            />
          </Labelled>
          <Labelled label="Sample rate">
            <Input
              value={String(live.sample_rate)}
              onChange={(e) => set({ sample_rate: Number(e.target.value) || 0 })}
              disabled={!canMutate}
              aria-label="Sample rate"
            />
          </Labelled>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-[var(--fg-secondary)]">Secret key</span>
          {live.secret_key_configured ? (
            <span className="font-mono text-[11.5px] text-[var(--fg-secondary)]">
              A key is stored · ····{live.secret_key_last_four || '••••'}
            </span>
          ) : (
            <span className="text-[12px] text-[var(--status-warn)]">No key stored.</span>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Paste the secret key"
              autoComplete="off"
              disabled={!canMutate}
              aria-label="Secret key"
              className="w-[280px]"
            />
            <Button
              size="sm"
              disabled={
                !canMutate || !secret.trim() || !secretGate.satisfied || saveSecret.isLoading
              }
              onClick={() => void saveSecret.mutate(secret, secretGate.reason.trim())}
            >
              Save key
            </Button>
          </div>
          {secret.trim() && (
            <ReasonField gate={secretGate} id="telemetry-secret-reason" disabled={!canMutate} />
          )}
          {saveSecret.error && <ErrorState reason={saveSecret.error} />}
          <p className="text-[11px] text-[var(--fg-muted)]">
            Write-only, like every other credential here: it is stored by the core and never
            returned, and the field is cleared whether the save succeeds or fails.
          </p>
        </div>
      </section>

      {/* Test before turning it on. */}
      <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void test.mutate()}
            disabled={!canMutate || test.isLoading}
          >
            {test.isLoading ? 'Sending…' : 'Send a test trace'}
          </Button>
          <span className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
            The tracer <strong>drops what it cannot send</strong> rather than blocking a plan
            — correct behaviour, and an invisible failure. A test trace is the only way to
            find out it does not work.
          </span>
        </div>
        {test.error && <ErrorState reason={test.error} />}
        {testResult && (
          <p
            className="text-[12px]"
            style={{ color: testResult.ok ? 'var(--status-live)' : 'var(--status-err)' }}
          >
            {testResult.ok
              ? `Accepted by ${testResult.host || 'the host'} in ${testResult.latency_ms}ms${
                  testResult.trace_id ? ` · trace ${testResult.trace_id}` : ''
                }.`
              : testResult.error || 'The endpoint refused it.'}
          </p>
        )}
      </section>

      {draft && (
        <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
          {save.error && <ErrorState reason={save.error} />}
          <ReasonField gate={gate} id="telemetry-reason" disabled={!canMutate} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canMutate || !gate.satisfied || save.isLoading}
              onClick={async () => {
                const ok = await save.mutate(live, gate.reason.trim());
                if (ok) setDraft(null);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Discard
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
  body,
  tone,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  body: string;
  tone?: string;
  disabled: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2.5 rounded-md p-2.5',
        checked && tone && 'tint-wash tint-ring',
      )}
      style={checked && tone ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="text-[13px] font-medium" style={checked && tone ? { color: tone } : undefined}>
          {label}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-[1.55] text-[var(--fg-secondary)]">
          {body}
        </span>
      </span>
    </label>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-[var(--fg-secondary)]">{label}</span>
      {children}
    </label>
  );
}
