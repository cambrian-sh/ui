import type { ReactNode } from 'react';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import type { PluginState } from '@/ipc/types';

/**
 * The shell every plugin-contributed surface renders inside (ADR-0089).
 *
 * It exists so version skew is reported by CONSTRUCTION rather than by each
 * panel remembering to check. The contract-skew banner covers the OSS operator
 * surface only; a kernel can serve the pinned contract while a plugin two major
 * versions ahead answers every RPC normally and quietly means something else.
 * Wrapping is the whole opt-in: a new plugin panel gets the banner by existing.
 *
 * It also owns the honest empty state. When the capability is absent this says
 * what the deployment IS — a kernel without the plugin is correct, not broken —
 * and, when the kernel told us why (entitlement declined, dependency unmet),
 * says that instead of leaving the operator to guess.
 */
export function PluginSurface({
  pluginId,
  capability,
  children,
  absent,
}: {
  /** Stable plugin key as declared in the plugin manifest ("authz"). */
  pluginId: string;
  /** Capability that must be live for this surface to work. */
  capability: string;
  children: ReactNode;
  /** What to render when the capability is absent. Defaults to an explanation. */
  absent?: ReactNode;
}) {
  const projection = useStore(projectionStore);
  const state = projection.state;
  const plugins = state?.plugins ?? [];
  const plugin = plugins.find((p) => p.id === pluginId);
  const live = (state?.capabilities ?? []).includes(capability);

  if (!live) {
    return <>{absent ?? <PluginAbsent pluginId={pluginId} plugin={plugin} />}</>;
  }

  return (
    <>
      {plugin?.state === 'expired' && (
        <Banner tone="warn" testId="plugin-expired">
          {plugin.display_name || plugin.id} is running on an expired entitlement
          {plugin.expires_at ? ` (expired ${plugin.expires_at})` : ''}. It still works inside its
          grace window; renew before the window closes or these surfaces will disappear.
        </Banner>
      )}
      <PluginSkewBanner plugin={plugin} pluginId={pluginId} />
      {children}
    </>
  );
}

/**
 * The banner itself. Rendered only when there is something true to say: an
 * aligned plugin produces no chrome at all, because a warning that is always
 * present is one nobody reads.
 */
export function PluginSkewBanner({
  plugin,
  pluginId,
}: {
  plugin: PluginState | undefined;
  pluginId: string;
}) {
  // The kernel is live and serving this surface, but never declared the plugin.
  // That means an older kernel (pre-contract-0067) or a capability arriving from
  // somewhere we cannot attribute — worth one quiet line, not an alarm.
  if (!plugin) {
    return (
      <Banner tone="muted" testId="plugin-skew-unattributed">
        This kernel serves the {pluginId} surface but does not report the plugin&rsquo;s version, so
        this console cannot tell whether the two were built against each other.
      </Banner>
    );
  }

  if (plugin.skew === 'aligned') return null;

  const name = plugin.display_name || plugin.id;

  if (plugin.skew === 'major') {
    return (
      <Banner tone="warn" testId="plugin-skew-major">
        {name} skew: the kernel runs {plugin.version}, this console was built against{' '}
        {plugin.pinned_version}. The major versions differ, so these panels may show or send the
        wrong thing. Update whichever side is behind before relying on this surface.
      </Banner>
    );
  }

  if (plugin.skew === 'minor') {
    return (
      <Banner tone="muted" testId="plugin-skew-minor">
        {name}: kernel {plugin.version}, console built against {plugin.pinned_version}. Same major
        line, so these panels should be correct.
      </Banner>
    );
  }

  return (
    <Banner tone="muted" testId="plugin-skew-unknown">
      {name}: the kernel reports version {plugin.version || 'none'}, which this console has no
      pinned expectation for. It cannot confirm the two match.
    </Banner>
  );
}

/**
 * Why a surface is not here. The distinction the kernel now carries (ADR-0089)
 * is the whole point: "this deployment has no such plugin" and "the plugin
 * declined to register" look identical from a capability list alone, and the
 * second is the one an operator has to act on.
 */
function PluginAbsent({ pluginId, plugin }: { pluginId: string; plugin: PluginState | undefined }) {
  const name = plugin?.display_name || pluginId;

  if (plugin?.state === 'not_entitled') {
    return (
      <Banner tone="warn" testId="plugin-not-entitled">
        {name} is built into this kernel but not active
        {plugin.reason ? `: ${plugin.reason}` : '.'} Its surfaces stay hidden until that is
        resolved.
      </Banner>
    );
  }

  if (plugin?.state === 'deps_unmet') {
    return (
      <Banner tone="warn" testId="plugin-deps-unmet">
        {name} could not start because it depends on{' '}
        {plugin.missing.length > 0 ? plugin.missing.join(', ') : 'a plugin'} which this deployment
        does not have.
      </Banner>
    );
  }

  return (
    <Banner tone="muted" testId="plugin-absent">
      This kernel does not run {name}, so there is nothing to configure here. That is a complete
      deployment, not a missing piece.
    </Banner>
  );
}

function Banner({
  tone,
  testId,
  children,
}: {
  tone: 'warn' | 'muted';
  testId: string;
  children: ReactNode;
}) {
  const warn = tone === 'warn';
  return (
    <p
      role={warn ? 'alert' : 'status'}
      data-testid={testId}
      className={
        warn
          ? 'rounded-sm border border-[var(--status-warn)] px-2 py-1 text-[11px] text-[var(--status-warn)]'
          : 'rounded-sm border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--fg-muted)]'
      }
    >
      {children}
    </p>
  );
}
