

import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/design-system/lib/utils";

interface NavEntry {
  path: string;
  shortcut: string;
  label: string;
}

const NAV_ENTRIES: readonly NavEntry[] = [
  { path: "/sessions",  shortcut: "g s", label: "Sessions" },
  { path: "/plans",     shortcut: "g p", label: "Plans in Flight" },
  { path: "/agents",    shortcut: "g a", label: "Agents" },
  { path: "/tools",     shortcut: "g t", label: "Tools & Skills" },
  { path: "/mcp",       shortcut: "g m", label: "MCP" },
  { path: "/memory",    shortcut: "g y", label: "Memory" },
  { path: "/scope",     shortcut: "g o", label: "Scope" },
  { path: "/watch",     shortcut: "g w", label: "Watch & Reactive" },
  { path: "/lifecycle", shortcut: "g l", label: "Lifecycle" },
  { path: "/verifier",  shortcut: "g v", label: "Verifier Pool" },
  { path: "/cost",      shortcut: "g c", label: "Cost & Energy" },
  { path: "/audit",     shortcut: "g u", label: "Audit" },
  { path: "/settings",  shortcut: "g x", label: "Settings" },
];

export interface NavRailProps {
  width: number;
  collapsed: boolean;
  onToggle: () => void;
  role: "operator" | "viewer" | null;
  theme: "dark" | "light";
  density: "compact" | "default" | "spacious";
  onThemeChange: (theme: "dark" | "light") => void;
  onDensityChange: (density: "compact" | "default" | "spacious") => void;
}

export function NavRail({
  width,
  collapsed,
  onToggle,
  role,
  theme,
  density,
  onThemeChange,
  onDensityChange,
}: NavRailProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <nav
      className="flex h-full flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]"
      style={{ width: collapsed ? 56 : width }}
    >
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_ENTRIES.map((entry) => {
            const isActive =
              currentPath === entry.path ||
              (entry.path !== "/" && currentPath.startsWith(entry.path + "/"));
            return (
              <li key={entry.path}>
                <Link
                  to={entry.path}
                  className={cn(
                    "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] font-medium border-l-2 border-l-[var(--accent-bg)]"
                      : "text-[var(--fg-secondary)] hover:bg-[var(--list-row-bg-hover)]",
                  )}
                >
                  {collapsed ? (
                    <span className="text-[10px] opacity-70 w-full text-center">
                      {entry.shortcut.split(" ")[1]}
                    </span>
                  ) : (
                    <>
                      <span className="text-[10px] opacity-50 w-10 font-mono">
                        {entry.shortcut}
                      </span>
                      <span>{entry.label}</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-[var(--border-subtle)] p-2 flex flex-col gap-1.5 text-xs">
        {collapsed ? (
          <button
            onClick={onToggle}
            className="rounded-sm border border-[var(--border-subtle)] px-2 py-1"
            aria-label="Expand nav rail"
          >
            ›
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">Theme</span>
              <button
                onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
                className="rounded-sm border border-[var(--border-subtle)] px-2 py-0.5"
              >
                {theme}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">Density</span>
              <button
                onClick={() =>
                  onDensityChange(
                    density === "compact"
                      ? "default"
                      : density === "default"
                      ? "spacious"
                      : "compact",
                  )
                }
                className="rounded-sm border border-[var(--border-subtle)] px-2 py-0.5"
              >
                {density}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">Role</span>
              <span
                className={cn(
                  "rounded-sm px-2 py-0.5 text-[10px]",
                  role === "operator"
                    ? "bg-[var(--status-ok)] text-[var(--fg-on-accent)]"
                    : "bg-[var(--status-muted)] text-[var(--fg-on-accent)]",
                )}
              >
                {role ?? "—"}
              </span>
            </div>
            <button
              onClick={onToggle}
              className="rounded-sm border border-[var(--border-subtle)] px-2 py-1"
              aria-label="Collapse nav rail"
            >
              ‹
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
