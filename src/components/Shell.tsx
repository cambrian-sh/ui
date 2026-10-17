import { useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HeaderBar } from "@/components/HeaderBar";
import { MobileTabBar } from "@/components/MobileTabBar";
import { useInspectorHost } from "@/components/InspectorSlot";
import { NavRail } from "@/design-system/components";
import { CommandPalette, ShortcutPalette } from "@/screens/palette/CommandPalette";
import { projectionStore } from "@/store/projection";
import { shellStore } from "@/store/shell";
import { useStore } from "@/store/useStore";
import { ipc, onKernelState } from "@/ipc";
import { useRefetchOnReconnect } from "@/lib/useRefetchOnReconnect";
import { autoConnectOnce } from "@/lib/autoConnect";
import { useBreakpoint } from "@/lib/useBreakpoint";

/**
 * One frame for both surfaces.
 *
 * Three things changed here and they are the reason the rest of the redesign
 * works:
 *
 *  1. The permanent right inspector is gone. It is now a slot (`InspectorSlot`)
 *     that screens fill when something is selected, so the aside is absent from
 *     the DOM the rest of the time and the main pane gets the width.
 *  2. The bottom status strip is gone. Its contents moved to where they are
 *     read — connection and cursor into the header pill, plans onto the rail,
 *     spend into the header, breakers into Cost & Energy (and back into the
 *     header only when one is tripping).
 *  3. The rail is grouped and carries the "Needs you" inbox, so the operator's
 *     one blocking question is visible from every screen.
 */
export function Shell() {
  const projection = useStore(projectionStore);
  const shell = useStore(shellStore);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const breakpoint = useBreakpoint();
  const inspector = useInspectorHost();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    // Reconnect to the last instance at LAUNCH. The saved-credential login already existed
    // but only ran from the connection panel, so the app started disconnected until the
    // operator navigated to Settings. Fire-and-forget: the connection status arrives through
    // the same kernel-state stream as everything else, and a failure surfaces on the
    // connection panel rather than blocking the shell.
    void autoConnectOnce();

    ipc.getState().then((state) => {
      if (!cancelled) projectionStore.getState().hydrate(state);
    });

    onKernelState((state) => {
      projectionStore.getState().fold(state);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useHotkeys('mod+k', (e) => {
    e.preventDefault();
    setPaletteOpen((o) => !o);
    setShortcutOpen(false);
  });
  useHotkeys('shift+/', (e) => {
    e.preventDefault();
    setShortcutOpen((o) => !o);
    setPaletteOpen(false);
  });
  useHotkeys('mod+i', (e) => {
    e.preventDefault();
    shellStore.getState().toggleRightInspector();
  });

  const state = projection.state;
  const connection = state?.connection.status ?? "down";
  // Kernel-side configuration — authored pipelines, watches, vocabulary — is
  // read through `useKernelQuery`, which never refetches. When the kernel comes
  // back it may hold different configuration than when those reads ran, so they
  // are invalidated on that one edge.
  useRefetchOnReconnect(connection);
  const role = state?.role ?? null;
  const isHydrating = projection.isHydrating;

  const plans = state?.plans ?? [];
  const needsYouCount = state?.pending_hitl.length ?? 0;
  const runningPlans = useMemo(
    () => plans.filter((p) => p.status === 'running' || p.status === 'forming').length,
    [plans],
  );
  const degradedBreakers = useMemo(
    () =>
      (state?.cost_dashboard.circuit_breakers ?? []).filter((b) => b.state !== 'ok')
        .length,
    [state?.cost_dashboard.circuit_breakers],
  );

  const navCounts = useMemo(
    () => ({
      sessions: state?.sessions.length ?? 0,
      plans: plans.length,
      agents: state?.agents.length ?? 0,
      watches: state?.watch_configs.length ?? 0,
    }),
    [state?.sessions.length, plans.length, state?.agents.length, state?.watch_configs.length],
  );

  const isMobile = breakpoint === 'mobile';
  // At the middle width the rail is icons-only whatever the operator's stored
  // preference is: 216px of rail plus a 332px inspector does not leave a usable
  // main pane at 1024px.
  const railCollapsed = breakpoint === 'compact' || shell.leftRailCollapsed;

  const main = (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-w-0 flex-1 flex-col overflow-hidden focus-visible:outline-none"
    >
      {isHydrating ? (
        <div className="flex h-full items-center justify-center">
          <span className="text-sm text-[var(--fg-muted)]">Connecting to the kernel…</span>
        </div>
      ) : (
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      )}
    </main>
  );

  return inspector.provider(
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] text-[var(--fg-primary)]">
      <a href="#main" className="cambrian-skip-link">Skip to main content</a>

      <div className="flex min-h-0 flex-1">
        {!isMobile && (
          <NavRail
            collapsed={railCollapsed}
            onToggle={() => shellStore.getState().toggleLeftRail()}
            needsYouCount={needsYouCount}
            counts={navCounts}
            liveCounts={{ plans: runningPlans > 0 }}
            capabilities={state?.capabilities ?? []}
            role={role}
            onOpenPalette={() => setPaletteOpen(true)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <HeaderBar
            connection={connection}
            cursor={state?.cursor ?? 0}
            endpoint={state?.connection.endpoint ?? ''}
            kernelVersion={state?.kernel_version ?? ''}
            contractVersion={state?.contract_version ?? ''}
            contractSkew={state?.contract_skew ?? 0}
            spendRateTokens={state?.cost_dashboard.spend_rate_usd ?? 0}
            needsYouCount={needsYouCount}
            degradedBreakers={degradedBreakers}
            role={role}
            compact={isMobile}
          />

          <div className="flex min-h-0 flex-1">
            {main}

            {/* Mounted only when a screen is inspecting something. */}
            {!isMobile && inspector.active && (
              <aside
                ref={inspector.ref}
                className="flex-none bg-[var(--bg-surface)] shadow-[inset_1px_0_0_var(--border-subtle)]"
                style={{ width: 'var(--inspector-w)' }}
              />
            )}
          </div>
        </div>
      </div>

      {isMobile && <MobileTabBar needsYouCount={needsYouCount} />}

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {shortcutOpen && <ShortcutPalette onClose={() => setShortcutOpen(false)} />}
    </div>,
  );
}
