import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Blocks,
  Bot,
  Database,
  Gavel,
  GitMerge,
  Home,
  Inbox,
  Library,
  ListChecks,
  MessagesSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Receipt,
  Scale as ScaleIcon,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Waypoints,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  /** The group heading. Groups answer a question; the label names it. */
  label: string;
  entries: readonly NavEntry[];
}

export type NavCountKey = "plans" | "sessions" | "agents" | "watches";

/**
 * Four groups, each answering one question:
 *   Work                  what am I doing
 *   Agents & automation   what can act here, and what starts it
 *   Governance            what is allowed, what happened, what did it cost
 *   System                how the kernel itself is running
 *
 * Home and Inbox sit above the groups: they are where an operator starts, and
 * the inbox is the one blocking question that must be visible from everywhere.
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
      {
        // ADR-0118: the knowledge substrate's console. Gated on the capability
        // the plugin reports after Build finds Postgres — a deployment without
        // it is CORRECT, and the entry stays absent rather than leading to a
        // refusal.
        path: "/knowledge",
        label: "Knowledge",
        icon: Library,
        requires: "substrate-query",
      },
      {
        // Contract 0098: the identity plane's review lane. A QUEUE — proposals
        // a machine was not trusted to confirm on its own, waiting on a person —
        // beside Knowledge because confirming one changes what Knowledge answers.
        // Gated on `links`, which a kernel without a link store never advertises.
        path: "/links",
        label: "Link review",
        icon: GitMerge,
        requires: "links",
      },
    ],
  },
  {
    label: "Agents & automation",
    entries: [
      // Agents, Tools & Skills and MCP are one destination with three tabs —
      // see RuntimeTabs.
      {
        path: "/agents",
        label: "Agents & tools",
        icon: Bot,
        count: "agents",
        matches: ["/tools", "/mcp"],
      },
      {
        path: "/watch",
        label: "Reactive pipelines",
        icon: Waypoints,
        count: "watches",
        requires: "watches-read",
      },
      {
        // The Ingress Studio (ADR-0112): where external sources become armed
        // ingresses. Gated on `ingress-studio`, reported only after the plugin's
        // Build finds Postgres and evidence capture.
        path: "/ingress-studio",
        label: "Ingress Studio",
        icon: Radio,
        requires: "ingress-studio",
      },
      {
        // A door into the system that carries real people: its people, its
        // activity and its credential are three jobs on three clocks.
        path: "/telegram",
        label: "Telegram",
        icon: Send,
        requires: "telegram-ingress",
      },
    ],
  },
  {
    label: "Governance",
    entries: [
      { path: "/scope", label: "Scope & Access", icon: ShieldCheck },
      { path: "/audit", label: "Audit", icon: ScrollText },
      {
        // The drift product's own output (ADR-0102): "what did we promise, and
        // does the record agree". Gated on `record-lane`, reported only after
        // the plugin finds a store.
        path: "/drift",
        label: "Drift",
        icon: ScaleIcon,
        requires: "record-lane",
      },
      { path: "/cost", label: "Cost & Energy", icon: Receipt },
    ],
  },
  {
    label: "System",
    entries: [
      { path: "/verifier", label: "Verifier Pool", icon: Gavel },
      { path: "/lifecycle", label: "Lifecycle", icon: Activity },
      {
        // What the PROCESS did, as opposed to who changed what (Audit).
        // Operator-only at the kernel, so absent for a Viewer.
        path: "/logs",
        label: "Logs",
        icon: TerminalSquare,
        requires: "kernel-logs",
      },
      { path: "/plugins", label: "Plugins", icon: Blocks },
    ],
  },
];

/** Where a path sits in the navigation — for the header's breadcrumb. */
export function navLocation(pathname: string): { group?: string; label: string } | null {
  if (pathname === "/") return { label: "Home" };
  if (pathname === "/inbox" || pathname.startsWith("/inbox/")) return { label: "Inbox" };
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return { label: "Settings" };
  for (const group of NAV_GROUPS) {
    for (const entry of group.entries) {
      const paths = [entry.path, ...(entry.matches ?? [])];
      if (paths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
        return { group: group.label, label: entry.label };
      }
    }
  }
  return null;
}

export interface NavRailProps {
  collapsed: boolean;
  onToggle: () => void;
  /** `pending_hitl.length`. Drives the Inbox badge, which is absent at zero. */
  needsYouCount: number;
  /** Right-aligned row counts, keyed as in `NavCountKey`. */
  counts?: Partial<Record<NavCountKey, number>>;
  /** Which counts are currently *live* (accent) rather than merely present. */
  liveCounts?: Partial<Record<NavCountKey, boolean>>;
  /** The handshake's capability list — destinations gate on it. */
  capabilities?: readonly string[];
  /** The signed-in role, shown in the rail footer. */
  role?: string | null;
  onOpenPalette: () => void;
}

const rowBase =
  "group flex h-8 items-center gap-2.5 rounded-[var(--radius-nav)] px-2 text-[13px] transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]";
const rowIdle =
  "text-[var(--fg-secondary)] hover:bg-[var(--nav-item-hover)] hover:text-[var(--fg-primary)]";
const rowActive = "bg-[var(--nav-item-active)] font-medium text-[var(--fg-primary)]";

function RowIcon({ icon: Icon, active }: { icon: LucideIcon; active?: boolean }) {
  return (
    <Icon
      aria-hidden="true"
      size={16}
      strokeWidth={1.75}
      className={cn(
        "shrink-0",
        active
          ? "text-[var(--fg-primary)]"
          : "text-[var(--fg-muted)] group-hover:text-[var(--fg-primary)]",
      )}
    />
  );
}

export function NavRail({
  collapsed,
  onToggle,
  needsYouCount,
  counts,
  liveCounts,
  capabilities = [],
  role,
  onOpenPalette,
}: NavRailProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const matchesPath = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath === path || currentPath.startsWith(path + "/");
  const isActive = (entry: NavEntry) =>
    matchesPath(entry.path) || (entry.matches?.some(matchesPath) ?? false);

  const inboxActive = matchesPath("/inbox");
  const homeActive = matchesPath("/");
  const settingsActive = matchesPath("/settings");

  return (
    <nav
      aria-label="Primary"
      className="flex h-full flex-none flex-col bg-[var(--bg-sidebar)] shadow-[inset_-1px_0_0_var(--border-subtle)]"
      style={{
        width: collapsed ? "var(--nav-rail-collapsed-w)" : "var(--nav-rail-w)",
      }}
    >
      {/* Brand — same height as the header beside it, so the two read as one bar. */}
      <div
        className={cn(
          "flex h-[var(--header-h)] flex-none items-center gap-2.5",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <img src="/cambrian-mark.svg" alt="" aria-hidden="true" className="size-5 flex-none" />
        {!collapsed && (
          <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--fg-primary)]">
            Cambrian <span className="font-normal text-[var(--fg-muted)]">Studio</span>
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <ul className="flex flex-col gap-px">
          <li>
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label="Search and jump"
              title={collapsed ? "Search and jump (⌘K)" : undefined}
              className={cn(rowBase, rowIdle, "w-full", collapsed && "justify-center px-0")}
            >
              <RowIcon icon={Search} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Search</span>
                  <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 font-mono text-[10.5px] text-[var(--fg-muted)]">
                    ⌘K
                  </kbd>
                </>
              )}
            </button>
          </li>
          <li>
            <Link
              to="/"
              aria-current={homeActive ? "page" : undefined}
              title={collapsed ? "Home" : undefined}
              className={cn(rowBase, homeActive ? rowActive : rowIdle, collapsed && "justify-center px-0")}
            >
              <RowIcon icon={Home} active={homeActive} />
              {!collapsed && <span className="flex-1 truncate">Home</span>}
            </Link>
          </li>
          <li>
            {/* The one row that must never be ignored: it changes tone when a
                plan is held waiting on the operator, and carries no zero badge. */}
            <Link
              to="/inbox"
              aria-current={inboxActive ? "page" : undefined}
              title={collapsed ? (needsYouCount > 0 ? `Inbox — ${needsYouCount} need you` : "Inbox") : undefined}
              className={cn(rowBase, inboxActive ? rowActive : rowIdle, collapsed && "relative justify-center px-0")}
            >
              <RowIcon icon={Inbox} active={inboxActive} />
              {!collapsed && <span className="flex-1 truncate">Inbox</span>}
              {needsYouCount > 0 &&
                (collapsed ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-3 top-1.5 size-2 rounded-full bg-[var(--status-warn)]"
                  />
                ) : (
                  <span
                    className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--status-warn)] px-1.5 text-[11px] font-semibold text-[var(--bg-canvas)]"
                    aria-label={`${needsYouCount} need you`}
                  >
                    {needsYouCount}
                  </span>
                ))}
            </Link>
          </li>
        </ul>

        <div className="mt-4 flex flex-col gap-4">
          {NAV_GROUPS.map((group) => {
            const entries = group.entries.filter(
              (e) => !e.requires || capabilities.includes(e.requires),
            );
            if (entries.length === 0) return null;
            return (
              <div key={group.label}>
                {collapsed ? (
                  <div aria-hidden="true" className="mx-3 mb-2 h-px bg-[var(--border-subtle)]" />
                ) : (
                  <div className="px-2 pb-1 text-[11.5px] font-medium text-[var(--fg-muted)]">
                    {group.label}
                  </div>
                )}
                <ul className="flex flex-col gap-px">
                  {entries.map((entry) => {
                    const active = isActive(entry);
                    const count = entry.count ? counts?.[entry.count] : undefined;
                    const live = entry.count ? liveCounts?.[entry.count] : false;
                    return (
                      <li key={entry.path}>
                        <Link
                          to={entry.path}
                          aria-current={active ? "page" : undefined}
                          title={collapsed ? entry.label : undefined}
                          className={cn(
                            rowBase,
                            active ? rowActive : rowIdle,
                            collapsed && "justify-center px-0",
                          )}
                        >
                          <RowIcon icon={entry.icon} active={active} />
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate">{entry.label}</span>
                              {count != null && count > 0 && (
                                <span
                                  className={cn(
                                    "flex items-center gap-1 text-[11.5px] tabular-nums",
                                    live
                                      ? "text-[var(--status-live)]"
                                      : "text-[var(--fg-muted)]",
                                  )}
                                >
                                  {live && (
                                    <span
                                      aria-hidden="true"
                                      className="size-1.5 rounded-full bg-[var(--status-live)]"
                                    />
                                  )}
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
            );
          })}
        </div>
      </div>

      <div className="flex flex-none flex-col gap-px border-t border-[var(--border-subtle)] p-2">
        <Link
          to="/settings"
          aria-current={settingsActive ? "page" : undefined}
          title={collapsed ? "Settings" : undefined}
          className={cn(rowBase, settingsActive ? rowActive : rowIdle, collapsed && "justify-center px-0")}
        >
          <RowIcon icon={Settings} active={settingsActive} />
          {!collapsed && <span className="flex-1 truncate">Settings</span>}
        </Link>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between pl-2")}>
          {!collapsed && role && (
            <span className="text-[11.5px] text-[var(--fg-muted)]" title="Your role on this kernel">
              Signed in as <span className="capitalize">{role}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex size-8 items-center justify-center rounded-[var(--radius-nav)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--nav-item-hover)] hover:text-[var(--fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" size={16} strokeWidth={1.75} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={16} strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
