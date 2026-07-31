import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Database,
  Gavel,
  LayoutGrid,
  ListChecks,
  Workflow,
  MessagesSquare,
  Network,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Blocks } from "lucide-react";
import { cn } from "@/design-system/lib/utils";

interface NavEntry {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Which projection count, if any, sits on the right of the row. */
  count?: NavCountKey;
  /** Other paths that should keep this row lit (tabs under one destination). */
  matches?: readonly string[];
  /**
   * Capability this destination needs to exist at all.
   *
   * ADR-0082 names the gap this closes: on a build without the plugin the
   * premium RPCs answer `Unimplemented` and the event class never publishes, so
   * a nav item for it is a lie. It is removed, and the Plugins page is the one
   * place that says it could exist.
   */
  requires?: string;
}

interface NavGroup {
  /** The uppercase kicker. Groups answer a question; the label names it. */
  label: string;
  entries: readonly NavEntry[];
}

export type NavCountKey = "plans" | "sessions" | "agents" | "watches";

/**
 * Fourteen flat entries at equal weight is not navigation — it is a list of
 * everything, and it makes the operator re-read the whole rail on every hop.
 *
 * Three groups, each answering one question:
 *   Work        what am I doing
 *   Execution   what can act here, and what is it doing
 *   Governance  what is allowed, what happened, what did it cost
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Work",
    entries: [
      { path: "/chat", label: "Chat", icon: MessagesSquare },
      { path: "/tasks", label: "Tasks", icon: Network, count: "sessions" },
      { path: "/plans", label: "Plans in flight", icon: ListChecks, count: "plans" },
      { path: "/plan-builder", label: "Plan builder", icon: Workflow },
      { path: "/memory", label: "Memory", icon: Database },
    ],
  },
  {
    // The group is "Execution" and the merged destination inside it is
    // "Runtime": naming both the same made the row look like a group header.
    label: "Execution",
    entries: [
      // Agents, Tools & Skills and MCP are one destination with three tabs —
      // see RuntimeTabs. They answered one question from three rail entries.
      {
        path: "/agents",
        label: "Runtime",
        icon: LayoutGrid,
        count: "agents",
        matches: ["/tools", "/mcp"],
      },
      {
        // A door into the system that carries real people. It is a destination
        // rather than a settings pane because its people, its activity and its
        // credential are three different jobs on three different clocks — and
        // because a page you reach by expanding a card on an index page is a
        // page you scroll past to get to.
        path: "/telegram",
        label: "Telegram",
        icon: MessagesSquare,
        requires: "telegram-ingress",
      },
      {
        path: "/watch",
        label: "Watch & Reactive",
        icon: ListChecks,
        count: "watches",
        requires: "watches-read",
      },
      { path: "/verifier", label: "Verifier Pool", icon: Gavel },
      { path: "/lifecycle", label: "Lifecycle", icon: Activity },
    ],
  },
  {
    label: "Governance",
    entries: [
      { path: "/scope", label: "Scope & Access", icon: ShieldCheck },
      { path: "/audit", label: "Audit", icon: ScrollText },
      {
        // What the PROCESS did, as opposed to who changed what (Audit) or what
        // is true now (the feed). Operator-only at the kernel, so the nav entry
        // is absent for a Viewer rather than leading to a refusal.
        path: "/logs",
        label: "Logs",
        icon: ScrollText,
        requires: "kernel-logs",
      },
      { path: "/cost", label: "Cost & Energy", icon: Receipt },
      { path: "/plugins", label: "Plugins", icon: Blocks },
    ],
  },
];

export interface NavRailProps {
  collapsed: boolean;
  onToggle: () => void;
  /** `pending_hitl.length`. The row is absent entirely at zero. */
  needsYouCount: number;
  /** Right-aligned row counts, keyed as in `NavCountKey`. */
  counts?: Partial<Record<NavCountKey, number>>;
  /** Which counts are currently *live* (accent) rather than merely present. */
  liveCounts?: Partial<Record<NavCountKey, boolean>>;
  /** The handshake's capability list — destinations gate on it. */
  capabilities?: readonly string[];
  onOpenPalette: () => void;
}

export function NavRail({
  collapsed,
  onToggle,
  needsYouCount,
  counts,
  liveCounts,
  capabilities = [],
  onOpenPalette,
}: NavRailProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const isActive = (entry: NavEntry) =>
    currentPath === entry.path ||
    currentPath.startsWith(entry.path + "/") ||
    (entry.matches?.some(
      (m) => currentPath === m || currentPath.startsWith(m + "/"),
    ) ??
      false);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full flex-none flex-col bg-[var(--bg-surface)] shadow-[inset_-1px_0_0_var(--border-subtle)]"
      style={{
        width: collapsed
          ? "var(--nav-rail-collapsed-w)"
          : "var(--nav-rail-w)",
      }}
    >
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {/* Never rendered at zero. A "Needs you: 0" row trains the operator to
            ignore the one row that must never be ignored. */}
        {needsYouCount > 0 && (
          <Link
            to="/inbox"
            className={cn(
              "mb-4 flex items-center gap-2 rounded-[var(--radius-nav)] px-2.5 py-2 transition-colors",
              "tint-fill tint-ring hover:brightness-110",
            )}
            style={{ "--tint": "var(--status-warn)" } as React.CSSProperties}
            title={collapsed ? `Needs you — ${needsYouCount}` : undefined}
          >
            <span
              aria-hidden="true"
              className="cambrian-live-pulse size-1.5 shrink-0 rounded-full bg-[var(--status-warn)]"
            />
            {!collapsed && (
              <>
                <span className="flex-1 text-[13px] font-medium text-[var(--fg-primary)]">
                  Needs you
                </span>
                <span className="font-mono text-[10.5px] font-semibold text-[var(--status-warn)]">
                  {needsYouCount}
                </span>
              </>
            )}
          </Link>
        )}

        <div className="flex flex-col gap-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <div className="px-2.5 pb-[7px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--fg-muted)_35%,transparent)]">
                  {group.label}
                </div>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.entries
                  .filter((e) => !e.requires || capabilities.includes(e.requires))
                  .map((entry) => {
                  const active = isActive(entry);
                  const count = entry.count ? counts?.[entry.count] : undefined;
                  const live = entry.count ? liveCounts?.[entry.count] : false;
                  const Icon = entry.icon;
                  return (
                    <li key={entry.path}>
                      <Link
                        to={entry.path}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? entry.label : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded-[var(--radius-nav)] px-2.5 py-[7px] text-[13px] transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-[color-mix(in_srgb,var(--accent-bg)_13%,transparent)] font-medium text-[var(--fg-primary)] shadow-[inset_2px_0_0_var(--accent-bg)]"
                            : "text-[color-mix(in_srgb,var(--fg-secondary)_72%,transparent)] hover:bg-[var(--list-row-bg-hover)] hover:text-[var(--fg-primary)]",
                        )}
                      >
                        <Icon
                          aria-hidden="true"
                          size={15}
                          strokeWidth={1.75}
                          className="shrink-0"
                        />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{entry.label}</span>
                            {count != null && count > 0 && (
                              <span
                                className={cn(
                                  "font-mono text-[10px]",
                                  live
                                    ? "text-[var(--color-accent-400)]"
                                    : "text-[var(--fg-muted)]",
                                )}
                              >
                                {count}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* The `g x` hints used to be drawn next to every label, at 10px, heavier
          than the labels themselves. The bindings still exist — they moved into
          the palette and the shortcut sheet, where they are looked up. */}
      <div className="flex flex-none items-center gap-1.5 p-2 shadow-[inset_0_1px_0_var(--border-subtle)]">
        <button
          type="button"
          onClick={onOpenPalette}
          className={cn(
            "flex h-[30px] flex-1 items-center gap-2 rounded-md px-2 text-[12px] transition-colors",
            "border border-[var(--button-secondary-border)] text-[var(--fg-secondary)]",
            "hover:bg-[var(--list-row-bg-hover)] hover:text-[var(--fg-primary)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
          )}
          aria-label="Search and jump"
        >
          <Search aria-hidden="true" size={14} strokeWidth={1.75} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search &amp; jump</span>
              <kbd className="font-mono text-[10px] text-[var(--fg-muted)]">⌘K</kbd>
            </>
          )}
        </button>
        {!collapsed && (
          <Link
            to="/settings"
            aria-label="Settings"
            className={cn(
              "flex size-[30px] flex-none items-center justify-center rounded-md transition-colors",
              "border border-[var(--button-secondary-border)] text-[var(--fg-secondary)]",
              "hover:bg-[var(--list-row-bg-hover)] hover:text-[var(--fg-primary)]",
            )}
          >
            <Settings aria-hidden="true" size={15} strokeWidth={1.75} />
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand nav rail" : "Collapse nav rail"}
        className="flex-none px-2 pb-2 text-[10px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
      >
        {collapsed ? "›" : "‹ Collapse"}
      </button>
    </nav>
  );
}
