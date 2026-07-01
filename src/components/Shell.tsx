/* Cambrian Web UI — the Shell.
 *
 * The 3-column layout per PRD-02 §3.1:
 *   - Left: NavRail (13 nav entries + theme + density + role pill + collapse)
 *   - Centre: the active route's content (chat, plan, memory, console, etc.)
 *   - Right: the contextual inspector (collapsed at < 1280 px viewport;
 *     the per-resource detail for the focused item)
 *   - Bottom: StatusStrip (always visible, 32 px)
 *
 * The Shell subscribes to the projection store (for connection + role + plans)
 * and the shell store (for panel widths, collapse, density, theme). On mount,
 * it hydrates the projection from the kernel via ipc.getState() and subscribes
 * to kernel://state events via onKernelState (the realtime fold per UI-005).
 *
 * The right inspector is a placeholder for the slice; UI-IMPL-09+ populate it
 * with the plan stack, memory detail, mutation context, etc. (per PRD-02 §4.4).
 */

import { useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Outlet } from "@tanstack/react-router";
import { NavRail, StatusStrip } from "@/design-system/components";
import { PlanWorkSurface } from "@/screens/plan/PlanWorkSurface";
import { CommandPalette, ShortcutPalette } from "@/screens/palette/CommandPalette";
import { projectionStore } from "@/store/projection";
import { shellStore } from "@/store/shell";
import { useStore } from "@/store/useStore";
import { ipc, onKernelState } from "@/ipc";

const RIGHT_INSPECTOR_DEFAULT_PX = 360;

export function Shell() {
  const projection = useStore(projectionStore);
  const shell = useStore(shellStore);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

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

  const connection = projection.state?.connection.status ?? "down";
  const inFlightPlans = projection.state?.plans.length ?? 0;
  const role = projection.state?.role ?? null;
  const isHydrating = projection.isHydrating;
  const rightInspectorWidth = shell.rightInspectorWidth || RIGHT_INSPECTOR_DEFAULT_PX;

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] text-[var(--fg-primary)]">
      <a href="#main" className="cambrian-skip-link">Skip to main content</a>
      <div className="flex flex-1 min-h-0">
        <NavRail
          width={shell.leftRailWidth}
          collapsed={shell.leftRailCollapsed}
          onToggle={() => shellStore.getState().toggleLeftRail()}
          role={role}
          theme={shell.theme}
          density={shell.density}
          onThemeChange={(t) => shellStore.getState().setTheme(t)}
          onDensityChange={(d) => shellStore.getState().setDensity(d)}
        />
        <main id="main" tabIndex={-1} className="flex-1 min-w-0 overflow-hidden focus-visible:outline-none">
          {isHydrating ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-[var(--fg-muted)]">
                Connecting to kernel…
              </span>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        {!shell.rightInspectorCollapsed && (
          <aside
            className="border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-y-auto"
            style={{ width: rightInspectorWidth }}
          >
            <PlanWorkSurface />
          </aside>
        )}
      </div>
      <StatusStrip
        connection={connection}
        kernelUp={connection === "live"}
        ltmUp={true}
        inFlightPlans={inFlightPlans}
        queueDepth={0}
        circuitBreaker="ok"
        spendRate={0}
        eventBacklog={0}
        threshold={100}
      />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {shortcutOpen && <ShortcutPalette onClose={() => setShortcutOpen(false)} />}
    </div>
  );
}
