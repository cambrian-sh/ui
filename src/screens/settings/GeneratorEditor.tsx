import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { formatRelativeTime, formatTokens } from '@/lib/format';
import { cn } from '@/design-system/lib/utils';
import type { GeneratorSpec, GeneratorTestResult } from '@/ipc/types';

export interface GeneratorEditorProps {
  generator: GeneratorSpec;
  canMutate: boolean;
  onClose: () => void;
}

/**
 * One generator, edited.
 *
 * **Test is the primary action, and nothing saved is trusted until it has
 * passed one.** The test is one real call against the live endpoint, billed
 * like any other, and it reports what the endpoint *did* rather than what the
 * form says it should do.
 *
 * Every field carries a consequence rather than a description, because a wrong
 * value here does not error — it degrades quality quietly, and the copy is the
 * only thing that makes the cost visible before it is paid.
 */
export function GeneratorEditor({ generator, canMutate, onClose }: GeneratorEditorProps) {
  const [draft, setDraft] = useState<GeneratorSpec>(generator);
  const [result, setResult] = useState<GeneratorTestResult | null>(null);
  const [key, setKey] = useState('');

  const test = useMutation(async () => {
    const r = await ipc.testGenerator(draft.id);
    setResult(r);
    return r;
  });

  const save = useMutation(async (reason: string) => ipc.saveGenerator(draft, reason));

  const saveKey = useMutation(async () => {
    const out = await ipc.setGeneratorKey(draft.id, key);
    // Cleared on BOTH outcomes: a credential left sitting in a text box is the
    // same exposure the write-only API exists to avoid.
    setKey('');
    if (!out.ok) throw new Error(out.error);
    return out;
  });

  const clearKey = useMutation(async () => {
    const out = await ipc.clearGeneratorKey(draft.id, 'operator removed the key');
    setKey('');
    if (!out.ok) throw new Error(out.error);
    return out;
  });

  // A save the last test disagrees with is the case worth nagging about.
  const testDisagrees =
    result != null && (!result.model_matches || !result.authenticated || !result.reachable);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-medium tracking-[-0.01em]">{draft.id}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          ← back to providers
        </button>
      </div>

      {/* Test first: it is the primary action, not a footer utility. */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void test.mutate()} disabled={!canMutate || test.isLoading}>
            {test.isLoading ? 'Calling the endpoint…' : 'Test this generator'}
          </Button>
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            One real call against the live endpoint. It is billed like any other.
          </span>
        </div>

        {test.error && <ErrorState reason={test.error} />}

        {result && <TestReport result={result} configuredModel={draft.model} />}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Endpoint"
          value={draft.endpoint}
          onChange={(v) => setDraft((d) => ({ ...d, endpoint: v }))}
          disabled={!canMutate}
          consequence="Several roles may share this host. If it goes down they lose their primary together."
        />
        <Field
          label="Model"
          value={draft.model}
          onChange={(v) => setDraft((d) => ({ ...d, model: v }))}
          disabled={!canMutate}
          consequence="Checked against what the endpoint actually serves — see the test above."
        />
        <Field
          label="Timeout (ms)"
          value={String(draft.timeout_ms)}
          onChange={(v) => setDraft((d) => ({ ...d, timeout_ms: Number(v) || 0 }))}
          disabled={!canMutate}
          consequence="Exceeding it counts as a breaker failure and cascades the step — it is not just a wait."
        />
        <Field
          label="Capability tags"
          value={draft.capability_tags.join(', ')}
          onChange={(v) =>
            setDraft((d) => ({
              ...d,
              capability_tags: v.split(',').map((t) => t.trim()).filter(Boolean),
            }))
          }
          disabled={!canMutate}
          consequence="A tag it does not carry is work it will never be offered."
        />
      </section>

      <section className="flex flex-wrap gap-4">
        <Toggle
          label="native_tools"
          checked={draft.native_tools}
          onChange={(v) => setDraft((d) => ({ ...d, native_tools: v }))}
          disabled={!canMutate}
        />
        <Toggle
          label="disable_thinking"
          checked={draft.disable_thinking}
          onChange={(v) => setDraft((d) => ({ ...d, disable_thinking: v }))}
          disabled={!canMutate}
        />
      </section>

      <CredentialPanel
        generator={draft}
        keyValue={key}
        onKeyChange={setKey}
        onSave={() => void saveKey.mutate()}
        onClear={() => void clearKey.mutate()}
        busy={saveKey.isLoading || clearKey.isLoading}
        error={saveKey.error ?? clearKey.error}
        canMutate={canMutate}
      />

      <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <h3 className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          If you save this
        </h3>
        <ul className="flex flex-col gap-1 text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
          <li>Roles pointed here start using the new configuration on their next call.</li>
          <li>Nothing in flight is interrupted.</li>
          <li>The change is audited under your name, with the reason you give.</li>
          <li>The breaker resets, so the new configuration gets a clean three attempts.</li>
        </ul>
      </section>

      {save.error && <ErrorState reason={save.error} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void save.mutate('generator settings changed from the console')}
          disabled={!canMutate || save.isLoading}
        >
          {save.isLoading ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Discard
        </Button>
        {testDisagrees && (
          <span className="text-[11.5px] text-[var(--status-warn)]">
            The last test disagreed with this configuration. Saving it anyway is allowed —
            it just will not start working because you saved it.
          </span>
        )}
      </div>
    </div>
  );
}

/** What the endpoint did, check by check. */
function TestReport({
  result,
  configuredModel,
}: {
  result: GeneratorTestResult;
  configuredModel: string;
}) {
  const checks = [
    {
      ok: result.reachable,
      label: 'Reachable',
      detail: `${result.round_trip_ms}ms round trip`,
    },
    {
      ok: result.authenticated,
      label: 'Authenticated',
      detail: result.authenticated ? 'the stored key was accepted' : 'the key was rejected',
    },
    {
      ok: result.model_matches,
      label: 'Model served',
      // The check that matters. An endpoint answering happily with a different
      // build is the most common misconfiguration in this space, and nothing
      // else in the console would ever reveal it.
      detail: result.model_matches
        ? result.model_served
        : `asked for ${configuredModel}, got ${result.model_served || 'no model string back'}`,
    },
    {
      ok: result.native_tools_ok,
      label: 'Native tools',
      detail: result.native_tools_ok
        ? 'the test tool call came back well-formed'
        : 'the tool call did not come back well-formed',
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {checks.map((c) => (
          <li key={c.label} className="flex items-baseline gap-2 text-[12px]">
            <span
              aria-hidden="true"
              style={{ color: c.ok ? 'var(--status-live)' : 'var(--status-err)' }}
            >
              {c.ok ? '✓' : '✕'}
            </span>
            <span className="font-medium text-[var(--fg-primary)]">{c.label}</span>
            <span className="text-[var(--fg-muted)]">{c.detail}</span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[11px] text-[var(--fg-muted)]">
        {formatTokens(result.tokens_in)} in · {formatTokens(result.tokens_out)} out ·{' '}
        {formatTokens(result.tokens_cached)} cached — straight from the usage field, no price.
      </p>
      {result.error && (
        <p className="text-[12px] text-[var(--status-err)]">{result.error}</p>
      )}
    </div>
  );
}

/**
 * The credential, write-only.
 *
 * There is no reveal affordance and there never will be: a console that can
 * display a credential leaks it to whoever is looking at the screen, to a
 * screen recording, and to whatever logged the response — and none of those are
 * recoverable. Only the last four ever come back, which is enough to tell which
 * key this is and not enough to use it.
 */
function CredentialPanel({
  generator,
  keyValue,
  onKeyChange,
  onSave,
  onClear,
  busy,
  error,
  canMutate,
}: {
  generator: GeneratorSpec;
  keyValue: string;
  onKeyChange: (v: string) => void;
  onSave: () => void;
  onClear: () => void;
  busy: boolean;
  error: string | null;
  canMutate: boolean;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <h3 className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        Credential
      </h3>

      {generator.key_configured ? (
        <p className="font-mono text-[11.5px] text-[var(--fg-secondary)]">
          A key is stored · ····{generator.key_last_four} · added{' '}
          {generator.key_added_at ? formatRelativeTime(generator.key_added_at) : 'unknown'} ·
          last used{' '}
          {generator.key_last_used_at
            ? formatRelativeTime(generator.key_last_used_at)
            : 'never'}
        </p>
      ) : (
        <p className="text-[12px] text-[var(--status-warn)]">
          No key is stored. Calls to this endpoint will fail authentication.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={keyValue}
          onChange={(e) => onKeyChange(e.target.value)}
          placeholder={generator.key_configured ? 'Paste a replacement key' : 'Paste the key'}
          aria-label="API key"
          autoComplete="off"
          disabled={!canMutate || busy}
          className="w-[280px]"
        />
        <Button size="sm" onClick={onSave} disabled={!canMutate || busy || !keyValue.trim()}>
          {generator.key_configured ? 'Replace' : 'Save key'}
        </Button>
        {generator.key_configured && (
          <Button size="sm" variant="danger" onClick={onClear} disabled={!canMutate || busy}>
            Remove
          </Button>
        )}
      </div>

      {error && <p className="text-[12px] text-[var(--status-err)]">{error}</p>}

      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        The key is write-only: it is stored by the core and never returned. Removing it stops
        every role pointing here — rotation, by pasting a replacement, is the supported path.
      </p>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  consequence,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  consequence: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11.5px] text-[var(--fg-secondary)]">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
      />
      {/* A consequence, not a description. */}
      <span className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">{consequence}</span>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className={cn('flex items-center gap-2 text-[12px]', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="font-mono">{label}</span>
    </label>
  );
}
