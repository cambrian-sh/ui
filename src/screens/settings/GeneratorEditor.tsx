import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { formatRelativeTime, formatTokens } from '@/lib/format';
import { cn } from '@/design-system/lib/utils';
import type { ConfigWriteOutcome, ConfigWriteResult, GeneratorSpec, GeneratorTestResult } from '@/ipc/types';

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
  const [written, setWritten] = useState<ConfigWriteOutcome | null>(null);

  // For a NEW draft: has it been saved this session? A key can only be filed
  // against a generator the kernel knows (it validates against the
  // store-effective list), so the credential panel stays locked until the
  // save lands.
  const [savedNew, setSavedNew] = useState(false);

  // An empty id means this editor was opened from "Add generator": the id and
  // protocol become authorable, and the probe is withheld — the kernel tests a
  // CONFIGURED generator by id, and this one exists nowhere until it is saved
  // and the kernel restarts.
  const isNew = generator.id === '';
  const keyLocked = isNew && !savedNew;

  const test = useMutation(async () => {
    const r = await ipc.testGenerator(draft.id);
    setResult(r);
    return r;
  });

  const save = useMutation(async (reason: string) => {
    const res = await ipc.saveGenerator(draft, reason);
    const outcome = firstOutcome(res);
    setWritten(outcome);
    // A rejected write is a FAILED save, not a save with a note attached. The
    // kernel reports it per key rather than as an RPC error, so it has to be
    // raised here or the form would show "Saved" over a store that refused it.
    if (outcome && outcome.effect === 'rejected') {
      throw new Error(outcome.error || 'the kernel refused this configuration');
    }
    // A stored NEW generator is now a valid credential target: the kernel
    // validates keys against the store-effective list, so the panel unlocks.
    setSavedNew(true);
    return res;
  });

  const saveKey = useMutation(async () => {
    const res = await ipc.setGeneratorKey(draft.id, key);
    // Cleared on BOTH outcomes: a credential left sitting in a text box is the
    // same exposure the write-only API exists to avoid.
    setKey('');
    const outcome = firstOutcome(res);
    // A key stored under an env var that overrides it changes nothing until
    // that variable is removed, and silence there is indistinguishable from a
    // broken save.
    if (outcome && outcome.effect === 'rejected') {
      throw new Error(outcome.error || 'the credential store refused this key');
    }
    setWritten(outcome);
    return res;
  });

  const clearKey = useMutation(async () => {
    const res = await ipc.clearGeneratorKey(draft.id, 'operator removed the key');
    setKey('');
    return res;
  });

  // A save the last test disagrees with is the case worth nagging about.
  const testDisagrees =
    result != null && (!result.model_matches || !result.authenticated || !result.reachable);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-medium tracking-[-0.01em]">
          {isNew ? 'New generator' : draft.id}
        </h2>
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
          <Button
            onClick={() => void test.mutate()}
            disabled={!canMutate || test.isLoading || isNew}
          >
            {test.isLoading ? 'Calling the endpoint…' : 'Test this generator'}
          </Button>
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            {isNew
              ? 'The probe tests a configured generator — save this one and restart the kernel first.'
              : 'One real call against the live endpoint. It is billed like any other.'}
          </span>
        </div>

        {test.error && <ErrorState reason={test.error} />}

        {result && <TestReport result={result} configuredModel={draft.model} />}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <Field
            label="Id"
            value={draft.id}
            onChange={(v) => setDraft((d) => ({ ...d, id: v }))}
            disabled={!canMutate}
            consequence="Permanent — roles will refer to it, so it cannot be renamed later."
          />
        )}
        {isNew && (
          <Field
            label="Protocol"
            value={draft.protocol}
            onChange={(v) => setDraft((d) => ({ ...d, protocol: v }))}
            disabled={!canMutate}
            consequence="The wire protocol the endpoint speaks (openai, ollama, gemini) — not the vendor."
          />
        )}
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

      {keyLocked ? (
        <section className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
          <h3 className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Credential
          </h3>
          <p className="text-[12px] leading-[1.55] text-[var(--fg-muted)]">
            Save the generator first — a key is filed against a generator the kernel knows,
            and this one does not exist until it is saved. The panel unlocks right after.
          </p>
        </section>
      ) : (
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
      )}

      <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <h3 className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          If you save this
        </h3>
        <ul className="flex flex-col gap-1 text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
          {/* This list used to promise the change took effect on the next call.
              It does not: the kernel builds its generators once, at boot, into
              the provider's routing table, breaker map and ledger. Saying
              otherwise sent an operator looking for a fault in a save that had
              worked exactly as designed. */}
          <li>The configuration is stored durably and outranks every config file.</li>
          <li>
            It takes effect when the kernel next starts — generators are built at boot, so
            roles pointed here keep using the current one until then.
          </li>
          <li>Nothing in flight is interrupted.</li>
          <li>The change is audited under your name, with the reason you give.</li>
        </ul>
      </section>

      {save.error && <ErrorState reason={save.error} />}
      {written && !save.error && <WriteOutcomeNote outcome={written} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() =>
            void save.mutate(
              isNew ? 'generator added from the console' : 'generator settings changed from the console',
            )
          }
          disabled={
            !canMutate ||
            save.isLoading ||
            (isNew && (!draft.id.trim() || !draft.model.trim() || !draft.protocol.trim()))
          }
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
        : `asked for ${result.model_requested || configuredModel}, got ${
            result.model_served || 'no model string back'
          }`,
    },
    {
      // NOT TESTED is a third state. Rendering it as a failure reported a defect
      // the probe never measured — and "native tools are broken" is exactly the
      // sort of false alarm that sends someone rewriting a working config.
      ok: result.native_tools_checked ? result.native_tools_ok : null,
      label: 'Native tools',
      detail: !result.native_tools_checked
        ? 'not checked — this probe makes a plain completion call'
        : result.native_tools_ok
          ? 'the test tool call came back well-formed'
          : 'the tool call did not come back well-formed',
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {checks.map((c) => (
          <li key={c.label} className="flex items-baseline gap-2 text-[12px]">
            {/* Three states, not two. `null` is NOT TESTED — drawn as a neutral
                dash, because a cross claims a measurement that was never made. */}
            <span
              aria-hidden="true"
              style={{
                color:
                  c.ok === null
                    ? 'var(--fg-muted)'
                    : c.ok
                      ? 'var(--status-live)'
                      : 'var(--status-err)',
              }}
            >
              {c.ok === null ? '–' : c.ok ? '✓' : '✕'}
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


/** The first per-key outcome, or null when the kernel answered with a bare ack. */
function firstOutcome(res: ConfigWriteResult): ConfigWriteOutcome | null {
  return res.outcomes.length > 0 ? res.outcomes[0] : null;
}

/**
 * What the write actually did.
 *
 * `stored` and `applied` are different facts, and the gap between them is where
 * this console has repeatedly misled: a value written to the store while an
 * environment variable pins the live one is saved, correct, and doing nothing.
 */
function WriteOutcomeNote({ outcome }: { outcome: ConfigWriteOutcome }) {
  if (outcome.effect === 'shadowed') {
    return (
      <p className="text-[12px] leading-[1.5] text-[var(--status-warn)]">
        Stored, but <code className="font-mono">{outcome.shadowed_by}</code> supplies the live
        value and outranks the store. This takes effect when that variable is removed — not on
        the next restart.
      </p>
    );
  }
  if (outcome.effect === 'restart_required') {
    return (
      <p className="text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
        Stored. It takes effect the next time the kernel starts.
      </p>
    );
  }
  if (outcome.effect === 'live') {
    return (
      <p className="text-[12px] leading-[1.5] text-[var(--status-live)]">
        Stored and applied to the running kernel.
      </p>
    );
  }
  return null;
}
