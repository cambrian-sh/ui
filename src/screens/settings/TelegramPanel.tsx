import { useCallback, useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { Role, TelegramStatus } from '@/ipc/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/design-system/components';

/**
 * Operator panel for the Telegram ingress (ADR-0090).
 *
 * The credential is WRITE-ONLY here, and that shapes the whole design. There is no field
 * showing the current token, no "reveal" affordance, and nothing that round-trips it: the
 * panel reports whether one is stored and which bot it belongs to, and rotation is the
 * supported path. A console that can display a credential leaks it to whoever is looking
 * at the screen, to a screen recording, and to whatever logs the response — and none of
 * those are recoverable.
 *
 * What it does show is the difference between INTENT and REALITY. `enabled` is what the
 * operator asked for; `running` is whether the daemon is actually polling. Collapsing the
 * two into one indicator is how a panel ends up looking healthy while a crash loop runs
 * underneath it.
 */

/**
 * Advertised by the kernel when the Telegram plugin is built in. The panel keys off this
 * rather than probing: a kernel without the plugin answers Unimplemented, and discovering
 * that by calling would render a broken-looking panel on a deployment that is simply not
 * running Telegram.
 */
const TELEGRAM_CAPABILITY = 'telegram-ingress';

const TONE: Record<string, { label: string; cls: string }> = {
  running: { label: 'Running', cls: 'text-[var(--status-ok)]' },
  starting: { label: 'Starting', cls: 'text-[var(--status-warn)]' },
  off: { label: 'Off', cls: 'text-[var(--fg-muted)]' },
  no_token: { label: 'Not configured', cls: 'text-[var(--fg-muted)]' },
  error: { label: 'Error', cls: 'text-[var(--status-err)]' },
};

const INPUT_CLASS =
  'rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs ' +
  'text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50';

const BUTTON_CLASS =
  'rounded-sm border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--bg-hover)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export function TelegramPanel({
  role,
  capabilities,
}: {
  role: Role | null;
  capabilities: string[];
}) {
  const readOnly = role !== 'operator';
  const available = capabilities.includes(TELEGRAM_CAPABILITY);

  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  // Removing the credential is destructive, so it is confirmed and reasoned rather than
  // one click: it stops the ingress and disconnects every conversation arriving through it.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearReason, setClearReason] = useState('');

  const reload = useCallback(async () => {
    if (!available) return;
    setLoading(true);
    try {
      setStatus(await ipc.telegramStatus());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [available]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Poll while the ingress is settling, and also while it claims to be running: the
  // daemon can die at any moment without the panel doing anything, and an indicator that
  // only updates when the operator touches it is how a crash loop stays invisible.
  useEffect(() => {
    if (!available) return;
    if (status?.state !== 'starting' && status?.state !== 'running') return;
    const period = status.state === 'starting' ? 3000 : 15000;
    const id = setInterval(() => void reload(), period);
    return () => clearInterval(id);
  }, [available, status?.state, reload]);

  const saveToken = async () => {
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    setNotice('');
    try {
      const ack = await ipc.telegramSetToken(value);
      // Clear the field on BOTH outcomes: the operator has pasted a credential into a
      // text box, and leaving it sitting there is the same exposure the API avoids.
      setToken('');
      setNotice(ack.ok ? 'Token saved.' : ack.error);
      await reload();
    } catch (e: unknown) {
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
      const ack = await ipc.telegramClearToken(reason);
      setNotice(ack.ok ? 'Token removed and the ingress stopped.' : ack.error);
      if (ack.ok) {
        setConfirmingClear(false);
        setClearReason('');
      }
      await reload();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (next: boolean) => {
    setBusy(true);
    setNotice('');
    try {
      const ack = await ipc.telegramSetEnabled(next);
      // A refusal carries its reason — "add a token first" rather than a toggle that
      // silently springs back.
      if (!ack.ok) setNotice(ack.error);
      await reload();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tone = TONE[status?.state ?? 'no_token'] ?? TONE.no_token;
  const canEnable = !!status?.token_configured;
  // Intent and reality disagree. Name it rather than letting the operator reconcile two
  // indicators themselves.
  const stalled = !!status?.enabled && !status?.running;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Telegram</CardTitle>
          <CardDescription>
            A Telegram bot as an entry point into Cambrian. Messages arrive as
            conversations and are governed by the policy attached to its surface.
          </CardDescription>
        </div>
        <span className={`shrink-0 font-mono text-[11px] ${tone.cls}`}>{tone.label}</span>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {!available ? (
          <p className="text-xs text-[var(--fg-muted)]">
            This kernel is not running the Telegram plugin, so there is no ingress to
            configure here.
          </p>
        ) : loading && !status ? (
          <p className="text-xs text-[var(--fg-muted)]">Loading…</p>
        ) : error ? (
          <p className="text-xs text-[var(--status-err)]">Could not reach the kernel: {error}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-[var(--fg-muted)]">Bot</dt>
              <dd className="font-mono">
                {status?.bot_username || <span className="text-[var(--fg-muted)]">unverified</span>}
              </dd>

              <dt className="text-[var(--fg-muted)]">Surface</dt>
              <dd className="font-mono break-all">{status?.surface || '—'}</dd>

              <dt className="text-[var(--fg-muted)]">Namespace</dt>
              <dd className="font-mono break-all">{status?.namespace?.join(', ') || '—'}</dd>

              <dt className="text-[var(--fg-muted)]">Polling</dt>
              {/* Intent and reality, kept apart on purpose. */}
              <dd
                className={`font-mono ${
                  stalled ? 'text-[var(--status-err)]' : 'text-[var(--fg-primary)]'
                }`}
              >
                {status?.running ? 'yes' : 'no'}
              </dd>
            </dl>

            {stalled && (
              <p className="text-xs text-[var(--status-err)]">
                Turned on, but nothing is polling — the ingress is failing to start. The
                kernel log will say why.
              </p>
            )}

            {status?.detail && <p className="text-xs text-[var(--fg-secondary)]">{status.detail}</p>}

            {status?.token_configured && status?.privacy_mode && (
              <p className="text-[11px] text-[var(--fg-muted)]">
                Privacy mode is on, so in groups the bot only sees messages that mention it.
                That is Telegram’s setting and can only be changed in BotFather.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={BUTTON_CLASS}
                onClick={() => void toggle(!status?.enabled)}
                disabled={readOnly || busy || (!canEnable && !status?.enabled)}
              >
                {status?.enabled ? 'Turn off' : 'Turn on'}
              </button>
              {!canEnable && (
                <span className="text-[11px] text-[var(--fg-muted)]">
                  Add a bot token before turning this on.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-3">
              <label
                htmlFor="tg-token"
                className="text-[11px] font-medium text-[var(--fg-secondary)]"
              >
                {status?.token_configured ? 'Replace bot token' : 'Bot token'}
              </label>
              <p className="text-[11px] text-[var(--fg-muted)]">
                From BotFather. It is stored on the kernel host and never shown again — to
                change it, paste a new one.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="tg-token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="123456789:AA…"
                  value={token}
                  disabled={readOnly || busy}
                  onChange={(e) => setToken(e.target.value)}
                  className={`${INPUT_CLASS} min-w-[16rem] flex-1`}
                />
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  onClick={() => void saveToken()}
                  disabled={readOnly || busy || !token.trim()}
                >
                  Save
                </button>
                {status?.token_configured && !confirmingClear && (
                  <button
                    type="button"
                    className={`${BUTTON_CLASS} border-[var(--status-err)] text-[var(--status-err)]`}
                    onClick={() => setConfirmingClear(true)}
                    disabled={readOnly || busy}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {confirmingClear && (
              <div
                role="group"
                aria-labelledby="tg-confirm-heading"
                className="flex flex-col gap-2 rounded-sm border border-[var(--status-err)] p-3"
              >
                {/* Name the consequence, not just the action. */}
                <p id="tg-confirm-heading" className="text-xs text-[var(--fg-primary)]">
                  Removing the token stops the Telegram ingress. Conversations arriving
                  through it will no longer reach Cambrian until a new token is added.
                </p>
                <input
                  aria-label="Reason for removing the token"
                  placeholder="Reason (required) — e.g. rotating the bot"
                  value={clearReason}
                  disabled={busy}
                  onChange={(e) => setClearReason(e.target.value)}
                  className={INPUT_CLASS}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`${BUTTON_CLASS} border-[var(--status-err)] text-[var(--status-err)]`}
                    onClick={() => void clearToken()}
                    disabled={busy || !clearReason.trim()}
                  >
                    Remove token
                  </button>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    onClick={() => {
                      setConfirmingClear(false);
                      setClearReason('');
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {notice && (
              <p role="status" className="text-xs text-[var(--fg-secondary)]">
                {notice}
              </p>
            )}

            {readOnly && (
              <p className="text-[11px] text-[var(--fg-muted)]">
                You have read-only access; these controls are disabled.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
