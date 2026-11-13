import { useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { routeAllowedForRole } from "@/lib/roleGate";
import { signOut } from "@/lib/signOut";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HeaderBar } from "@/components/HeaderBar";
import { MobileTabBar } from "@/components/MobileTabBar";
import { useInspectorHost } from "@/components/InspectorSlot";
import { NavRail } from "@/design-system/components";
import { CommandPalette, ShortcutPalette } from "@/screens/palette/CommandPalette";
import { projectionStore } from "@/store/projection";
import { shellStore } from "@/store/shell";
import { useStore } from "@/store/useStore";
import { ipc, onKernelState, onKernelToken } from "@/ipc";
import { createChunkBatcher, stepOutputStore } from "@/lib/stepOutput";
import { useInbox } from "@/lib/useInbox";
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

    // The live step-output lane (ADR-0139, capability step-output-stream). It was
    // forwarded by the Rust core and subscribed by nothing. One subscription for
    // the whole app, batched at ~100ms, folded by lease + chunk_seq.
    let unlistenToken: (() => void) | undefined;
    const push = createChunkBatcher((chunks) => stepOutputStore.getState().ingest(chunks));
    onKernelToken(push).then((fn) => {
      if (cancelled) fn();
      else unlistenToken = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      unlistenToken?.();
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
  // ADR-0142: a member reaches only their own surfaces. The rail hides the rest;
  // this stops a deep link or the palette from rendering an admin screen whose
  // every call the kernel would refuse.
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const routeAllowed = routeAllowedForRole(pathname, role);

  // Contract 0099: sign-out is offered only when the kernel can revoke the
  // token. It ends on the login screen (Settings opens on Connection).
  const navigate = useNavigate();
  const canSignOut = (state?.capabilities ?? []).includes("logout");
  const onSignOut = () => {
    void signOut().then(() => navigate({ to: "/settings" }));
  };

  // Every pending decision — feed HITL, skill proposals, timed-out skill-access
  // requests — counted by the same aggregation the Inbox screen renders.
  const inbox = useInbox();
  const needsYouCount = inbox.count;
  const plans = state?.plans ?? [];
  const runningPlans = useMemo(
    () => plans.filter((p) => p.status === 'running' || p.status === 'forming').length,
    [plans],
  );

  const navCounts = useMemo(
    () => ({ inbox: needsYouCount, tasks: runningPlans }),
    [needsYouCount, runningPlans],
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
          {routeAllowed ? (
            <Outlet />
          ) : (
            <div role="status" className="m-6 flex max-w-lg flex-col gap-2 rounded-md p-4 tint-wash tint-ring" style={{ "--tint": "var(--fg-muted)" } as React.CSSProperties}>
              <h1 className="text-sm font-semibold">Not available with your role</h1>
              <p className="text-[12.5px] leading-[1.55] text-[var(--fg-secondary)]">
                You are signed in without a console role, so this deployment shows you your own
                chat, approvals and accounts. An administrator can give you a console role.
              </p>
              <Link to="/chat" className="self-start text-[12px] text-[var(--color-accent-400)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                Go to Chat
              </Link>
            </div>
          )}
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
            counts={navCounts}
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
            needsYouCount={needsYouCount}
            role={role}
            identityName={state?.identity?.display_name ?? null}
            compact={isMobile}
            onSignOut={canSignOut ? onSignOut : undefined}
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

      {isMobile && <MobileTabBar needsYouCount={needsYouCount} role={role} />}

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {shortcutOpen && <ShortcutPalette onClose={() => setShortcutOpen(false)} />}
    </div>,
  );
}
