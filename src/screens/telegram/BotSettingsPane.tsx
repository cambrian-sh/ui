import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ipc } from '@/ipc';
import type { TelegramStatus } from '@/ipc/types';

/**
 * The bot's credential and switch.
 *
 * The credential is WRITE-ONLY, and that shapes everything: no field shows the
 * current token, no reveal affordance, nothing round-trips it. A console that
 * can display a credential leaks it to whoever is looking at the screen, to a
 * screen recording, and to whatever logs the response — none of which is
 * recoverable. The panel reports that one is stored and which bot it belongs to;
 * rotation is the supported path.
 *
 * The token form sits behind a button rather than being always-open. It is set
 * once and then left for months, and a permanently visible credential field on a
 * page an operator visits to read the activity list is an invitation to paste
 * into the wrong one.
 */
export function BotSettingsPane({
  status,
  botId,
  readOnly,
  onChanged,
}: {
  status: TelegramStatus | null;
  /** Which bot the credential belongs to. Empty means the default. */
  botId: string;
  readOnly: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [configuring, setConfiguring] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearReason, setClearReason] = useState('');

  const close = () => {
    setConfiguring(false);
    setToken('');
    setConfirmingClear(false);
    setClearReason('');
  };

  const saveToken = async () => {
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    setNotice('');
    try {
      const ack = await ipc.telegramSetToken(value, botId);
      // Cleared on BOTH outcomes: the operator has pasted a credential into a
      // text box, and leaving it sitting there is the same exposure the
      // write-only API exists to avoid.
      setToken('');
      setNotice(ack.ok ? 'Token saved.' : ack.error);
      if (ack.ok) setConfiguring(false);
      await onChanged();
    } catch (e) {
      setToken('');
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clearToken = async () => {
    const reason = clearReason.trim();
    if (!reason) return;
    setBusy(true);
    setNotice('');
    try {
      const ack = await ipc.telegramClearToken(reason, botId);
      setNotice(ack.ok ? 'Token removed and the ingress stopped.' : ack.error);
      if (ack.ok) close();
      await onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[13.5px] font-medium">Credential</h3>
          <p className="mt-1 text-[12px] leading-[1.55] text-[var(--fg-muted)]">
            {status?.token_configured ? (
              <>
                A bot token is stored on the kernel host. It is never shown again — to change
                it, paste a new one.
              </>
            ) : (
              <>No bot token is stored, so this ingress cannot start.</>
            )}
          </p>
        </div>
        {!configuring && (
          <Button size="sm" variant="secondary" disabled={readOnly} onClick={() => setConfiguring(true)}>
            {status?.token_configured ? 'Replace token' : 'Add token'}
          </Button>
        )}
      </div>

      {/* Verified from the token rather than typed: the bot's own name is the one
          thing that confirms the credential works without revealing it. */}
      {status?.bot_username && (
        <p className="text-[12px]">
          <span className="font-mono text-[var(--fg-primary)]">{status.bot_username}</span>{' '}
          <span className="text-[11.5px] text-[var(--fg-muted)]">verified from the token</span>
        </p>
      )}

      {configuring && (
        <div className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-2.5">
          <label htmlFor="tg-token" className="text-[11.5px] text-[var(--fg-secondary)]">
            Bot token, from BotFather
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="tg-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="123456789:AA…"
              value={token}
              disabled={readOnly || busy}
              onChange={(e) => setToken(e.target.value)}
              className="min-w-[16rem] flex-1"
            />
            <Button size="sm" disabled={readOnly || busy || !token.trim()} onClick={() => void saveToken()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
          </div>

          {status?.token_configured && !confirmingClear && (
            <Button
              size="sm"
              variant="ghost"
              className="self-start text-[var(--status-err)]"
              disabled={readOnly || busy}
              onClick={() => setConfirmingClear(true)}
            >
              Remove the stored token
            </Button>
          )}

          {confirmingClear && (
            <div
              role="group"
              className="flex flex-col gap-2 rounded-md p-2.5 tint-wash tint-ring"
              style={{ '--tint': 'var(--status-err)' } as React.CSSProperties}
            >
              {/* Name the consequence, not just the action. */}
              <p className="text-[11.5px] leading-[1.55] text-[var(--fg-secondary)]">
                Removing the token stops this ingress. Messages sent to the bot will no longer
                reach Cambrian until a new token is added.
              </p>
              <Input
                aria-label="Reason for removing the token"
                placeholder="Reason (required) — e.g. rotating the bot"
                value={clearReason}
                disabled={busy}
                onChange={(e) => setClearReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--status-err)]"
                  disabled={busy || !clearReason.trim()}
                  onClick={() => void clearToken()}
                >
                  Remove token
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingClear(false);
                    setClearReason('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="text-[12px] text-[var(--fg-secondary)]">
          {notice}
        </p>
      )}

      {readOnly && (
        <p className="text-[11px] text-[var(--fg-muted)]">
          You have read-only access; these controls are disabled.
        </p>
      )}
    </section>
  );
}
