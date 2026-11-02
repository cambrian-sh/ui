import { useState } from 'react';
import { Button } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import {
  ReasonField,
  useReasonGate,
} from '@/design-system/components/cambrian/reason-field';
import { ipc } from '@/ipc';
import type { ConfigWriteOutcome, ConfigWriteResult } from '@/ipc/types';
import { useMutation } from '@/lib/useMutation';
import { queryClient } from '@/lib/queryClient';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';

/**
 * Where a config write went relative to the config FILES (ADR-0101 D8,
 * contract 0099).
 *
 * `shadowed_by` (rendered by each caller) is one direction: a higher layer, an
 * env var, beats the store. These are the other: the write either went INTO the
 * file that sets the key (write-through — the file is now its one home), or it
 * was stored OVER a file the kernel could not write, so later edits of that file
 * are ignored until the stored value is removed. The second is the silent trap
 * D8 exists to make loud, so it is a warning with its way out next to it.
 *
 * Renders nothing for a kernel that predates 0099 (the fields are absent).
 */
export function ConfigFileFacts({ outcome }: { outcome: ConfigWriteOutcome }) {
  if (outcome.written_to) {
    return (
      <p className="text-[12px] leading-[1.5] text-[var(--fg-secondary)]">
        Written to <code className="font-mono">{outcome.written_to}</code> — the file is this
        value&rsquo;s home, and no stored override remains.
      </p>
    );
  }
  if (outcome.overrides_file) {
    return (
      <div
        role="status"
        className="flex flex-col gap-1.5 rounded-md p-2.5 tint-wash tint-ring"
        style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-warn)]">
          Overrides {outcome.overrides_file}
        </span>
        <span className="text-[12px] leading-[1.55] text-[var(--fg-primary)]">
          Stored; overrides <code className="font-mono">{outcome.overrides_file}</code>
          {outcome.overrides_value !== undefined && outcome.overrides_value !== '' && (
            <>
              {' '}
              (file value: <code className="font-mono">{outcome.overrides_value}</code>)
            </>
          )}
          . The kernel could not write that file, so edits to it are ignored while this stored
          value exists.
        </span>
        <RevertToFile configKey={outcome.key} fileName={outcome.overrides_file} />
      </div>
    );
  }
  return null;
}

/**
 * "Revert to file": DeleteConfig on one key, so the file (or the default
 * beneath it) supplies the value again. Writing the file's value back would NOT
 * do this — it would leave the key pinned by the store.
 *
 * Operator-only, with the mandatory reason, like every mutation here.
 */
export function RevertToFile({
  configKey,
  fileName,
  onReverted,
}: {
  configKey: string;
  /** The file being reverted to, when the kernel named it. */
  fileName?: string;
  onReverted?: (res: ConfigWriteResult) => void;
}) {
  const role = useStore(projectionStore)?.state?.role ?? null;
  const canMutate = role === 'operator';
  const gate = useReasonGate();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const revert = useMutation(async (reason: string) => ipc.deleteConfig([configKey], reason));

  if (done) {
    return (
      <p className="text-[12px] text-[var(--status-live)]">
        Reverted: the stored value is gone and {fileName ? <code>{fileName}</code> : 'the file or default'}{' '}
        supplies <code>{configKey}</code> again.
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="self-start"
        disabled={!canMutate}
        title={canMutate ? undefined : 'Operator role required'}
        onClick={() => setOpen(true)}
        aria-label={`Revert ${configKey} to file`}
      >
        Revert to file
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ReasonField gate={gate} id={`revert-${configKey}`} />
      {revert.error && <ErrorState reason={revert.error} />}
      {rejection && <ErrorState reason={rejection} />}
      <div className="flex items-center gap-2">
        <Button
          disabled={!gate.satisfied || revert.isLoading}
          onClick={async () => {
            const res = await revert.mutate(gate.reason.trim());
            if (!res) return;
            const rejected = res.outcomes.find((o) => o.effect === 'rejected');
            if (rejected) {
              setRejection(rejected.error || 'the kernel rejected the revert');
              return;
            }
            setDone(true);
            // GetConfigSchema is a read the feed does not refresh: re-read it so
            // every source marker reflects the revert.
            void queryClient.invalidateQueries({ queryKey: ['config-schema'] });
            onReverted?.(res);
          }}
        >
          {revert.isLoading ? 'Reverting…' : `Remove stored value of ${configKey}`}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Every config key the STORE currently supplies, each with "revert to file".
 *
 * ADR-0101 D8: a console write goes into the file that sets the key whenever
 * that file is writable, removing the stored override. So a key still reported
 * as `store` is either an override of a file the kernel could not write (later
 * edits of that file are ignored) or a key no file sets. GetConfigSchema does not
 * yet say WHICH file a stored key overrides, so this names the layer, not the
 * file — and does not pretend to know more. Reverting removes the stored value;
 * the file, else the default, supplies the key again.
 */
export function StoredOverrides({
  valueSource,
  currentValues,
}: {
  valueSource: Record<string, string>;
  currentValues: Record<string, number>;
}) {
  const stored = Object.keys(valueSource)
    .filter((k) => valueSource[k] === 'store')
    .sort();
  if (stored.length === 0) return null;
  return (
    <section
      aria-label="Stored overrides"
      className="mt-2 flex max-w-[680px] flex-col gap-2 rounded-md p-2.5 tint-wash tint-ring"
      style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-warn)]">
        {stored.length} key{stored.length === 1 ? '' : 's'} stored by the console
      </span>
      <p className="text-[12px] leading-[1.55] text-[var(--fg-secondary)]">
        These values live in the kernel&rsquo;s config store and win over the config files, so an
        edit to a file that sets one of them is ignored until the stored value is removed.
      </p>
      <ul className="flex flex-col gap-2">
        {stored.map((key) => (
          <li key={key} className="flex flex-col gap-1">
            <span className="text-[12px]">
              <code className="font-mono">{key}</code>
              {currentValues[key] !== undefined && (
                <span className="text-[var(--fg-muted)]"> = {currentValues[key]}</span>
              )}{' '}
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--status-warn)]">
                store · wins over files
              </span>
            </span>
            <RevertToFile configKey={key} />
          </li>
        ))}
      </ul>
    </section>
  );
}
