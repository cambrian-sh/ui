import { Link, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  Database,
  GitMerge,
  Inbox,
  LayoutGrid,
  Library,
  ListChecks,
  MessagesSquare,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Radio,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Building2,
  Sparkles,
  Workflow,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/design-system/lib/utils";
import { ORG_DIRECTORY_CAPABILITY } from "@/lib/hierarchy";

export interface NavEntry {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Which count, if any, sits on the right of the row. */
  count?: NavCountKey;
  /** Other paths that keep this row lit (tabs under one destination). */
  matches?: readonly string[];
  /**
   * Capability the destination needs to exist at all — THE gating rule for every
   * premium or optional surface (AGENTS.md §5.2, ADR-0082 D2). On a build
   * without it the RPCs answer Unimplemented and the events never publish, so a
   * rail entry would be a lie. The Plugins page is the one place that says it
   * could exist.
   */
  requires?: string;
  /** Like `requires`, satisfied by any one of these. */
  requiresAny?: readonly string[];
  /**
   * ADR-0142: open to a `member` — a signed-in person with no console role.
   * The kernel lets a member reach only their own surfaces (chat, their
   * approvals, their accounts); every other destination would answer
   * PermissionDenied, so it is not shown. Default: console roles only.
   */
  forMembers?: boolean;
}

export interface NavGroup {
  /** The uppercase kicker. Each group answers one question. */
  label: string;
  entries: readonly NavEntry[];
}

export type NavCountKey = "inbox" | "tasks";

/**
 * Four groups, each answering one question (investigations/
 * 2026-11-06-operator-console-redesign.md §5):
 *
 *   Work       what am I doing                     (the end user lives here)
 *   Knowledge  what does it know, how does it act
 *   Automate   what runs without me
 *   Admin      who may do what, and what happened
 *
 * The inbox is a rail entry with a badge rather than a banner: the count is
 * every pending decision (tool approvals, skill access, skill proposals), and
 * it is drawn only when it is non-zero.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Work",
    entries: [
      { path: "/chat", label: "Chat", icon: MessagesSquare, forMembers: true },
      { path: "/inbox", label: "Inbox", icon: Inbox, count: "inbox", forMembers: true },
      { path: "/tasks", label: "Tasks", icon: Network, count: "tasks" },
    ],
  },
  {
    label: "Knowledge",
    entries: [
      { path: "/memory", label: "Memory", icon: Database },
      {
        path: "/skills",
        label: "Skills",
        icon: Sparkles,
        requiresAny: ["skills-read", "skills-lifecycle", "skill-grants"],
      },
      { path: "/knowledge", label: "Knowledge", icon: Library, requires: "substrate-query" },
      { path: "/links", label: "Link review", icon: GitMerge, requires: "links" },
    ],
  },
  {
    label: "Automate",
    entries: [
      { path: "/integrations", label: "Integrations", icon: Plug, forMembers: true },
      { path: "/watch", label: "Pipelines", icon: Radio, requires: "watches-read" },
      { path: "/plan-builder", label: "Plan builder", icon: ListChecks },
      { path: "/ingress-studio", label: "Ingress Studio", icon: Workflow, requires: "ingress-studio" },
      { path: "/telegram", label: "Telegram", icon: Send, requires: "telegram-ingress" },
    ],
  },
  {
    label: "Admin",
    entries: [
      // Agents, Tools and MCP are one destination with three tabs (RuntimeTabs).
      { path: "/agents", label: "Runtime", icon: LayoutGrid, matches: ["/tools", "/mcp"] },
      { path: "/scope", label: "Access policy", icon: ShieldCheck, requires: "access-policy" },
      // ADR-0142 D5/D6 (stage 2, premium): org tree, mapping rules, SCIM, reconcile.
      { path: "/organisation", label: "Organisation", icon: Building2, requires: ORG_DIRECTORY_CAPABILITY },
      { path: "/audit", label: "Audit", icon: ScrollText, requires: "audit" },
      { path: "/logs", label: "Logs", icon: FileText, requires: "kernel-logs" },
      { path: "/plugins", label: "Plugins", icon: Blocks },
    ],
  },
];

/**
 * One gating rule for rail entries and screens alike: the capability the
 * kernel advertises, and (ADR-0142) whether the signed-in person's role can
 * reach the destination at all. `role` omitted = not role-gated (a console role).
 */
export function entryAvailable(
  entry: Pick<NavEntry, "requires" | "requiresAny" | "forMembers">,
  capabilities: readonly string[],
  role?: string | null,
): boolean {
  if (role === "member" && !entry.forMembers) return false;
  if (entry.requires && !capabilities.includes(entry.requires)) return false;
  if (entry.requiresAny && !entry.requiresAny.some((c) => capabilities.includes(c))) return false;
  return true;
}

/** Where a path sits in the navigation — for the header's breadcrumb. */
export function navLocation(pathname: string): { group?: string; label: string } | null {
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
  /** Right-aligned row counts. A zero is never drawn. */
  counts?: Partial<Record<NavCountKey, number>>;
  /** The signed-in role (ADR-0142): a member sees only their own surfaces. */
  role?: string | null;
  /** The handshake's capability list — destinations gate on it. */
  capabilities?: readonly string[];
  onOpenPalette: () => void;
}

const rowBase =
  "group relative flex h-8 items-center gap-2.5 rounded-[var(--radius-nav)] px-2 text-[13px] transition-colors " +
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

export function NavRail({ collapsed, onToggle, counts, capabilities = [], role = null, onOpenPalette }: NavRailProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const matchesPath = (path: string) => currentPath === path || currentPath.startsWith(path + "/");
  const isActive = (entry: NavEntry) =>
    matchesPath(entry.path) || (entry.matches?.some(matchesPath) ?? false);
  const settingsActive = matchesPath("/settings");

  return (
    <nav
      aria-label="Primary"
      className="flex h-full flex-none flex-col bg-[var(--bg-sidebar)] shadow-[inset_-1px_0_0_var(--border-subtle)]"
      style={{ width: collapsed ? "var(--nav-rail-collapsed-w)" : "var(--nav-rail-w)" }}
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

        <div className="mt-4 flex flex-col gap-4">
          {NAV_GROUPS.map((group) => {
            const entries = group.entries.filter((e) => entryAvailable(e, capabilities, role));
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
                    const count = entry.count ? counts?.[entry.count] ?? 0 : 0;
                    // The inbox is the one row that must never be ignored: it
                    // changes tone when something waits on the operator, and
                    // carries no zero badge.
                    const urgent = entry.count === "inbox" && count > 0;
                    return (
                      <li key={entry.path}>
                        <Link
                          to={entry.path}
                          aria-current={active ? "page" : undefined}
                          aria-label={count > 0 ? `${entry.label}, ${count} waiting` : undefined}
                          title={collapsed ? entry.label : undefined}
                          className={cn(rowBase, active ? rowActive : rowIdle, collapsed && "justify-center px-0")}
                        >
                          <RowIcon icon={entry.icon} active={active} />
                          {!collapsed && <span className="flex-1 truncate">{entry.label}</span>}
                          {count > 0 &&
                            (urgent ? (
                              collapsed ? (
                                <span
                                  aria-hidden="true"
                                  className="absolute right-3 top-1.5 size-2 rounded-full bg-[var(--status-warn)]"
                                />
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--status-warn)] px-1.5 text-[11px] font-semibold text-[var(--bg-canvas)]"
                                >
                                  {count > 99 ? "99+" : count}
                                </span>
                              )
                            ) : (
                              !collapsed && (
                                <span aria-hidden="true" className="text-[11.5px] tabular-nums text-[var(--fg-muted)]">
                                  {count}
                                </span>
                              )
                            ))}
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
          aria-label="Settings"
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
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="ml-auto flex size-8 items-center justify-center rounded-[var(--radius-nav)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--nav-item-hover)] hover:text-[var(--fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
