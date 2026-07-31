import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { cn } from '@/design-system/lib/utils';
import { ipc } from '@/ipc';
import { Route } from '@/routes/telegram';
import { PeoplePane } from './PeoplePane';
import { BotSettingsPane } from './BotSettingsPane';
import { BotRail } from './BotRail';
import { IngressActivity } from '@/screens/plugins/panels/IngressActivity';
import { SurfaceLock } from '@/screens/plugins/panels/SurfaceLock';
import type { TelegramBot, TelegramStatus } from '@/ipc/types';

const TELEGRAM_CAPABILITY = 'telegram-ingress';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'people', label: 'People' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabID = (typeof TABS)[number]['id'];

const STATE_TONE: Record<string, { label: string; tone: string }> = {
  running: { label: 'Running', tone: 'var(--status-live)' },
  starting: { label: 'Starting', tone: 'var(--status-warn)' },
  off: { label: 'Off', tone: 'var(--fg-muted)' },
  no_token: { label: 'Not configured', tone: 'var(--fg-muted)' },
  // A bot the kernel recorded but could not build this run — it exists, it is
  // addressable, and it is not going to poll until the kernel restarts.
  pending_start: { label: 'Waiting for restart', tone: 'var(--status-warn)' },
  error: { label: 'Error', tone: 'var(--status-err)' },
};

/**
 * Telegram — its own destination, not a panel inside Plugins.
 *
 * Plugins answers *"what is this kernel running, and why is that surface
 * missing"*. That is a different question from *"who messaged my bot and what
 * did policy do to them"*, and folding the second into an expander on the first
 * made a page you scroll past to reach a page you actually wanted. A bridge into
 * the system that carries real people is a place, and it gets an address.
 *
 * The bot rail is present with one bot because that is what stops multi-bot
 * needing a third restructure of this screen.
 */
export function TelegramConsole() {
  const projection = useStore(projectionStore);
  const state = projection.state;
  const capabilities = state?.capabilities ?? [];
  const role = state?.role ?? null;
  const readOnly = role !== 'operator';
  const available = capabilities.includes(TELEGRAM_CAPABILITY);

  const { tab, bot } = Route.useSearch();
  const navigate = useNavigate();
  const active: TabID = (TABS.find((t) => t.id === tab)?.id ?? 'overview') as TabID;
  const activeBot = bot ?? '';
  const setTab = (id: TabID) =>
    void navigate({ to: '/telegram', search: { tab: id, bot: bot } });
  const setBot = (id: string) =>
    void navigate({ to: '/telegram', search: { tab: tab, bot: id } });

  const [bots, setBots] = useState<TelegramBot[]>([]);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    if (!available) return;
    setLoading(true);
    try {
      // The list first: it names which bots exist, and the status call is about
      // ONE of them. Asking for a bot that is not configured answers NotFound
      // rather than quietly reporting a different bridge.
      // A FAILED list is not an empty list. Swallowing the error here renders
      // "no bots" for a call that never answered, which is indistinguishable
      // from a kernel that has none — and it is the reason a bot that existed
      // looked like it had never been created.
      let list: TelegramBot[] = [];
      let listError = '';
      try {
        list = await ipc.telegramListBots();
      } catch (e) {
        listError = e instanceof Error ? e.message : String(e);
      }
      setBots(list);
      if (listError) setError(listError);
      setStatus(await ipc.telegramStatus(activeBot));
      if (!listError) setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [available, activeBot]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Poll while settling AND while it claims to be running: the daemon can die at
  // any moment without the console doing anything, and an indicator that only
  // updates when the operator touches it is how a crash loop stays invisible.
  useEffect(() => {
    if (!available) return;
    if (status?.state !== 'starting' && status?.state !== 'running') return;
    const id = setInterval(() => void reload(), status.state === 'starting' ? 3000 : 15000);
    return () => clearInterval(id);
  }, [available, status?.state, reload]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setNotice('');
    try {
      const ack = await ipc.telegramSetEnabled(next, activeBot);
      // A refusal carries its reason — "add a token first" rather than a toggle
      // that silently springs back.
      if (!ack.ok) setNotice(ack.error);
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Only reached before the first status lands. The kernel is authoritative about
  // a bot's surface; this is the default bot's, named rather than guessed.
  const surface = status?.surface || 'chat:telegram:default';
  const tone = STATE_TONE[status?.state ?? 'no_token'] ?? STATE_TONE.no_token;
  // Intent and reality are different facts. Collapsing them into one indicator is
  // how a panel looks healthy while a crash loop runs underneath it.
  const stalled = !!status?.enabled && !status?.running;

  if (!available) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4">
          <EmptyState
            title="This kernel is not running the Telegram plugin"
            body="There is no ingress to configure. That is a correct deployment, not a broken one — nothing else in the console is affected."
          />
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4 pb-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
                Telegram
              </h1>
              <span
                className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em]"
                style={{ color: tone.tone }}
              >
                <span
                  aria-hidden
                  className={cn('size-1.5 rounded-full', status?.running && 'cambrian-live-pulse')}
                  style={{ background: tone.tone }}
                />
                {tone.label}
              </span>
              {status?.bot_username && (
                <span className="font-mono text-[12px] text-[var(--fg-secondary)]">
                  {status.bot_username}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-[680px] text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
              A bot as an entry point into Cambrian. Messages arrive as conversations and are
              governed by the policy attached to its surface.
            </p>
          </div>

          <Button
            size="sm"
            variant={status?.enabled ? 'ghost' : 'secondary'}
            disabled={readOnly || busy || (!status?.token_configured && !status?.enabled)}
            onClick={() => void toggle(!status?.enabled)}
          >
            {status?.enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </header>

        {/* Not registered is not broken: the bot polls, receives and answers.
            Its traffic simply arrives with no policy on the door it came
            through, which is the one state that must never look healthy. */}
        {status && !status.surface_registered && (
          <p
            className="max-w-[720px] rounded-md p-2.5 text-[12px] leading-[1.55] tint-wash tint-ring"
            style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
          >
            <span className="text-[var(--status-warn)]">
              No ingress is registered for {status.surface}.
            </span>{' '}
            <span className="text-[var(--fg-secondary)]">
              This bot answers normally, but nothing governs what its senders can reach —
              register the surface in Scope &amp; Access › Ingress to put a policy on this
              door.
            </span>
          </p>
        )}

        <nav className="flex flex-wrap gap-1 shadow-[inset_0_-1px_0_var(--border-subtle)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active === t.id ? 'page' : undefined}
              className={cn(
                'px-2.5 py-1.5 text-[12.5px]',
                active === t.id
                  ? 'text-[var(--fg-primary)] shadow-[inset_0_-2px_0_var(--color-accent-400)]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {error && (
          <p className="text-[12px] text-[var(--status-err)]">Could not reach the kernel: {error}</p>
        )}
        {notice && (
          <p role="status" className="text-[12px] text-[var(--fg-secondary)]">
            {notice}
          </p>
        )}

        <div className="flex min-h-0 flex-1 gap-5">
        {bots.length > 1 || !readOnly ? (
          <BotRail
            bots={bots}
            activeId={status?.bot_id ?? activeBot ?? 'default'}
            canMutate={!readOnly}
            onSelect={setBot}
            onAdd={async (id, label) => {
              const ack = await ipc.telegramAddBot(id, label);
              if (!ack.ok) {
                setNotice(ack.error);
                await reload();
                return;
              }
              // Registering the surface is done HERE, under the operator's own
              // token, and not by the plugin: registration mints a surface and
              // decides what an entry point may reach (ADR-0090 D2). Doing it as
              // part of the same action is what makes "add a bot" finish the job
              // — the previous flow left every new bot ungoverned and told the
              // operator to go and finish it somewhere else.
              let governed = '';
              try {
                const out = await ipc.registerIngress({
                  agent_id: `telegram_ingress_${id}`,
                  surface_kind: 'chat',
                  surface_id: `telegram:${id}`,
                  // The bot may speak for Telegram identities and nothing else.
                  // An empty namespace would read as a wildcard.
                  namespace: ['tg:'],
                });
                governed = out.ok
                  ? ` Its surface chat:telegram:${id} is registered, so its traffic arrives governed.`
                  : ` Its surface could not be registered (${out.error}) — until it is, its traffic arrives with no policy on the door.`;
              } catch (e) {
                // An unreachable access plane is not a failed bot. The bot
                // exists; saying which half did not happen is the useful part.
                governed = ` Its surface chat:telegram:${id} is NOT registered (${
                  e instanceof Error ? e.message : String(e)
                }) — until it is, its traffic arrives with no policy on the door.`;
              }
              setNotice(
                `Bot "${id}" created.${governed}${ack.detail ? ` ${ack.detail}` : ''} Paste its token to start it.`,
              );
              await reload();
            }}
            onRemove={async (id, reason) => {
              const ack = await ipc.telegramRemoveBot(id, reason);
              if (!ack.ok) setNotice(ack.error);
              else setBot('default');
              await reload();
            }}
          />
        ) : null}

        <div className="min-w-0 flex-1">
        {loading && !status ? (
          <p className="text-[12px] text-[var(--fg-muted)]">Loading…</p>
        ) : active === 'overview' ? (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
                <dt className="text-[var(--fg-muted)]">Asked for</dt>
                <dd className="font-mono">{status?.enabled ? 'on' : 'off'}</dd>
                <dt className="text-[var(--fg-muted)]">Actually polling</dt>
                <dd
                  className="font-mono"
                  style={{ color: stalled ? 'var(--status-err)' : undefined }}
                >
                  {status?.running ? 'yes' : 'no'}
                </dd>
                <dt className="text-[var(--fg-muted)]">Surface</dt>
                <dd className="break-all font-mono">{status?.surface || '—'}</dd>
                <dt className="text-[var(--fg-muted)]">Namespace</dt>
                <dd className="break-all font-mono">{status?.namespace?.join(', ') || '—'}</dd>
              </dl>

              {stalled && (
                <p className="text-[12px] text-[var(--status-err)]">
                  Turned on, but nothing is polling — the ingress is failing to start. The
                  kernel log will say why.
                </p>
              )}
              {status?.detail && (
                <p className="text-[12px] text-[var(--fg-secondary)]">{status.detail}</p>
              )}
              {status?.token_configured && status?.privacy_mode && (
                <p className="text-[11.5px] text-[var(--fg-muted)]">
                  Privacy mode is on, so in groups the bot only sees messages that mention it.
                  That is Telegram’s setting and can only be changed in BotFather.
                </p>
              )}

              {/* What "off" costs, in the sender's words. Telegram tells a sender
                  nothing when a bot stops answering, so from their side it simply
                  goes quiet — nobody knows this, and it is the entire consequence
                  of the toggle. */}
              {status?.enabled && (
                <p
                  className="rounded-md p-2 text-[11.5px] leading-[1.55] tint-wash"
                  style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
                >
                  <span className="text-[var(--status-warn)]">If you turn this off:</span>{' '}
                  <span className="text-[var(--fg-secondary)]">
                    messages sent to{' '}
                    <span className="font-mono">{status.bot_username || 'the bot'}</span> are
                    silently ignored. Telegram tells the sender nothing, so from their side the
                    bot simply stops answering — and any conversation open right now ends
                    mid-thread.
                  </span>
                </p>
              )}
            </section>

            {/* The door and its lock together. Making the operator remember which
                other screen holds the lock is the manageability bug. */}
            <SurfaceLock
              surfaceTarget={status?.surface?.replace(/^surface:/, '') || 'chat:telegram:default'}
              hasPolicyPlane={capabilities.includes('access-policy')}
            />
          </div>
        ) : active === 'people' ? (
          capabilities.includes('access-policy') ? (
            <PeoplePane surface={surface} canMutate={!readOnly} />
          ) : (
            <EmptyState
              title="This kernel has no access-policy plane"
              body="A binding maps an external id onto a principal, and without that plane there is nothing to bind anyone to. Every sender on this surface resolves to the surface itself."
            />
          )
        ) : active === 'activity' ? (
          <section className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
            <IngressActivity surface={surface} />
          </section>
        ) : (
          <BotSettingsPane
            status={status}
            botId={activeBot}
            readOnly={readOnly}
            onChanged={reload}
          />
        )}
        </div>
        </div>
      </div>
    </ScrollArea>
  );
}
