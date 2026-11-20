import { useCallback, useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { DeliveryIntent } from '@/ipc/types';
import { useCommandGate, formatUnixMs } from '@/lib/useCommandGate';
import { errorMessage } from '@/lib/errorMessage';

/**
 * Undelivered replies (capability `delivery-intents`; ENG-1657, ADR-0090 D8.1).
 *
 * Every reply to a conversation that came through an ingress is journaled before it
 * is sent. Two outcomes need a person:
 *  - AMBIGUOUS: the send ended without proof either way — it may have arrived. The
 *    kernel never resends one by itself. Check with the person on the far side, then
 *    Confirm (it arrived) or Resend (once, under the same id, so a channel that
 *    dedups shows one message).
 *  - FAILED: the channel refused for good (blocked, gone) or retries ran out. Shown so
 *    it is known; nothing to resolve.
 * The message text is never shown here — it belongs to the conversation's owner.
 */
export function DeliveryIntentsPanel() {
  const [intents, setIntents] = useState<DeliveryIntent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const gate = useCommandGate('resolve a delivery');

  const load = useCallback(async () => {
    try {
      setIntents(await ipc.listDeliveryIntents([], 100));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (key: string, action: 'confirm' | 'resend') => {
    setBusy(`${action}:${key}`);
    try {
      await ipc.resolveDeliveryIntent(key, action, reason.trim());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (error && !intents) {
    return <p role="alert" className="pt-6 text-[12px] text-[var(--status-err)]">{error}</p>;
  }
  if (!intents || intents.length === 0) return null;

  const reasonMissing = reason.trim() === '';
  const blocked = Boolean(gate) || reasonMissing || busy !== null;
  return (
    <section aria-label="Undelivered replies" className="flex flex-col gap-2 pt-6 text-[12px]">
      <h2 className="type-section-title text-[var(--fg-primary)]">Undelivered replies</h2>
      <p className="max-w-[640px] text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
        Replies to people on a channel whose delivery is unknown or failed. An unknown one may
        already have arrived, so it is never resent on its own: check, then confirm it arrived or
        resend it once. A failed one was refused by the channel for good.
      </p>
      <label className="block">
        <span className="text-[var(--fg-muted)]">Reason (recorded in the audit)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1"
          placeholder="e.g. checked with the customer"
        />
      </label>
      <ul className="flex flex-col gap-2">
        {intents.map((d) => (
          <li key={d.key} className="rounded border border-[var(--border-subtle)] p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono">
                {d.ingress_agent_id} → {d.external_id}
              </span>
              <span className={d.state === 'failed' ? 'text-[var(--status-err)]' : 'text-[var(--status-warn)]'}>
                {d.state === 'ambiguous' ? 'unknown — may have arrived' : 'failed'}
              </span>
            </div>
            <div className="text-[var(--fg-muted)]">
              conversation <span className="font-mono">{d.conversation_id}</span> · {d.text_chars} characters ·{' '}
              {d.attempts} {d.attempts === 1 ? 'attempt' : 'attempts'} · {formatUnixMs(d.updated_at_unix_ms)}
            </div>
            {d.error && <div className="text-[var(--status-err)]">{d.error}</div>}
            {d.state === 'ambiguous' && (
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void resolve(d.key, 'confirm')}
                  disabled={blocked}
                  title={gate ?? (reasonMissing ? 'Give a reason first' : undefined)}
                  className="rounded border border-[var(--border-subtle)] px-2 py-0.5 disabled:opacity-50"
                >
                  {busy === `confirm:${d.key}` ? 'Confirming…' : 'Confirm it arrived'}
                </button>
                <button
                  type="button"
                  onClick={() => void resolve(d.key, 'resend')}
                  disabled={blocked}
                  title={gate ?? (reasonMissing ? 'Give a reason first' : undefined)}
                  className="rounded border border-[var(--border-subtle)] px-2 py-0.5 disabled:opacity-50"
                >
                  {busy === `resend:${d.key}` ? 'Resending…' : 'Resend once'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-[var(--status-err)]">{error}</p>}
    </section>
  );
}
