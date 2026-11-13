import { Link } from '@tanstack/react-router';
import { Button, EmptyState, ScrollArea } from '@/design-system/components';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { describeCapabilities } from '@/lib/capabilities';
import { cn } from '@/design-system/lib/utils';
import type { PluginState } from '@/ipc/types';
import {
  classifyPlugin,
  contributesNav,
  surfacePhrasing,
  type PluginCard,
  type PluginCardState,
} from './pluginState';
import { cardAction, pluginRoute } from './panelRegistry';

const TONE: Record<PluginCardState, string | undefined> = {
  active: undefined,
  off: 'var(--status-warn)',
  not_entitled: undefined,
  expired: 'var(--status-warn)',
  unverifiable: 'var(--status-err)',
};

const LABEL: Record<PluginCardState, string> = {
  active: 'ACTIVE',
  off: 'LICENSED, SWITCHED OFF',
  not_entitled: 'Not in your plan',
  expired: 'Licence expired',
  unverifiable: 'Licence unverifiable',
};

/**
 * Plugins — the truth about what this kernel is running.
 *
 * This page exists to answer *"why is that panel missing"*, which is otherwise
 * unanswerable: a premium RPC on an OSS build returns `Unimplemented` and its
 * event class never publishes, so the surface is simply not there and nothing
 * says why. ADR-0082 names that as an open gap; this closes it.
 *
 * Two rules the page is built on:
 *
 *  - **Never render a dead nav item.** The features live where the work is —
 *    Reactive has its own section, Telegram sits in Integrations — and this page
 *    is the single place that says a missing one *could* exist.
 *  - **Locked plugins are listed, never hidden.** Otherwise the only way to
 *    learn a capability exists is a sales call.
 */
export function PluginsConsole() {
  const projection = useStore(projectionStore);
  const plugins = projection.state?.plugins ?? [];
  const capabilities = projection.state?.capabilities ?? [];
  const cards = plugins.map(classifyPlugin);
  const active = cards.filter((c) => c.card === 'active').length;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-4 pb-10">
        <div>
          <h1 className="type-page-title">Plugins</h1>
          <p className="type-page-description mt-1 max-w-[660px]">
            What this kernel is running, and what each one adds to this console. A surface that
            is missing from the navigation is missing because a plugin here is not active —
            this is where that is stated rather than left to be guessed at.
          </p>
        </div>

        {plugins.length === 0 ? (
          <EmptyState
            title="This kernel declares no plugins"
            body="An unscoped OSS build is a correct deployment, not a broken one. Every premium surface is simply absent, and nothing here is disabled or degraded."
          />
        ) : (
          <>
            <p className="text-[12.5px] text-[var(--fg-muted)]">
              {active} of {plugins.length} active.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {cards.map((card) => (
                <PluginCardView key={card.plugin.id} card={card} />
              ))}
            </div>
          </>
        )}

        {/* The capability list is the other half of the same question, and the
            two are read together often enough to belong on one page. */}
        <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
          <h2 className="type-label text-[var(--fg-muted)]">
            Capabilities advertised — {capabilities.length}
          </h2>
          {capabilities.length === 0 ? (
            <p className="text-[12px] text-[var(--fg-muted)]">None.</p>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {describeCapabilities(capabilities).map((c) => (
                <li key={c.capability} className="text-[11.5px]">
                  <code className="text-[var(--color-accent-400)]">{c.capability}</code>
                  <span className="mx-1 text-[var(--fg-muted)]" aria-hidden="true">→</span>
                  <span className="text-[var(--fg-secondary)]">{c.surface}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/settings"
            className="self-start text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
          >
            Full mapping in Settings › Connection →
          </Link>
        </section>
      </div>
    </ScrollArea>
  );
}

function PluginCardView({ card }: { card: PluginCard }) {
  const { plugin } = card;
  const tone = TONE[card.card];
  const phrasing = surfacePhrasing(card.card);
  const action = cardAction(plugin.id, card.card === 'active', contributesNav(plugin));
  const route = pluginRoute(plugin.id);

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]',
        tone && 'tint-wash tint-ring',
      )}
      style={tone ? ({ '--tint': tone } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 shrink-0 rounded-full',
            card.card === 'active' && 'cambrian-live-pulse',
          )}
          style={{ background: tone ?? 'var(--status-live)' }}
        />
        <span className="text-[13.5px] font-medium">{plugin.display_name || plugin.id}</span>
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{plugin.version}</span>
        <span
          className="type-label ml-auto"
          style={{ color: tone ?? 'var(--status-live)' }}
        >
          {LABEL[card.card]}
        </span>
      </div>

      <p className="text-[12px] leading-[1.55] text-[var(--fg-primary)]">{card.why}</p>

      {/* The fourth state, spelled out. A failed licence check fails closed, and
          the operator needs all three facts: why, what happened to their work,
          and what happens next. */}
      {card.card === 'unverifiable' && (
        <p className="text-[11.5px] leading-[1.55] text-[var(--status-err)]">
          It is off because the licence could not be confirmed. Anything you configured is
          intact and stopped, and it will start on its own when the check succeeds — there is
          nothing to re-enter.
        </p>
      )}

      {plugin.state === 'deps_unmet' && plugin.missing?.length > 0 && (
        <p className="text-[11.5px] text-[var(--fg-muted)]">
          Waiting on: <span className="font-mono">{plugin.missing.join(', ')}</span>
        </p>
      )}

      {plugin.expires_at && card.card !== 'not_entitled' && (
        <p className="text-[11px] text-[var(--fg-muted)]">Licence expires {plugin.expires_at}</p>
      )}

      <SurfaceList plugin={plugin} phrasing={phrasing} />

      {/* What does NOT break without it — the question a locked card has to
          answer, or it is just an advert. */}
      {(card.card === 'not_entitled' || card.card === 'expired') && (
        <p className="text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
          Nothing breaks without it. The surfaces above are absent rather than disabled, and
          every other part of the console works exactly as it does now.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {action === 'open' && route && (
          <Button size="sm" variant="secondary" asChild>
            <Link to={route}>Open</Link>
          </Button>
        )}

        {/* Active, but its controls are a place rather than a panel. Saying so
            beats an Open button that opens an empty box. */}
        {action === 'elsewhere' && (
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            Its controls live in {plugin.panels?.[0]?.title ?? 'its own section'}.
          </span>
        )}

        {card.card === 'off' && (
          <Button size="sm" variant="secondary" asChild>
            <Link to="/settings">Add credentials</Link>
          </Button>
        )}

        {/* A locked card gets no button. There is nothing to open and nothing to
            configure, and a disabled control implies otherwise. */}
        {(card.card === 'not_entitled' || card.card === 'expired') && (
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            Nothing to configure — it is not running.
          </span>
        )}
      </div>
    </div>
  );
}

function SurfaceList({
  plugin,
  phrasing,
}: {
  plugin: PluginState;
  phrasing: 'adds' | 'would add';
}) {
  const panels = plugin.panels ?? [];
  const caps = plugin.capabilities ?? [];
  if (panels.length === 0 && caps.length === 0) return null;

  return (
    <div>
      <div className="type-label text-[var(--fg-muted)]">
        {phrasing}
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {panels.map((p) => (
          <li key={p.id} className="text-[11.5px] text-[var(--fg-secondary)]">
            {p.title}
          </li>
        ))}
        {panels.length === 0 &&
          caps.map((c) => (
            <li key={c} className="font-mono text-[11px] text-[var(--fg-secondary)]">
              {c}
            </li>
          ))}
      </ul>
    </div>
  );
}
