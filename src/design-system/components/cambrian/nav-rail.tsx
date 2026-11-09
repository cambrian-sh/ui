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

export function NavRail({ collapsed, onToggle, counts, capabilities = [], role = null, onOpenPalette }: NavRailProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const isActive = (entry: NavEntry) =>
    currentPath === entry.path ||
    currentPath.startsWith(entry.path + "/") ||
    (entry.matches?.some((m) => currentPath === m || currentPath.startsWith(m + "/")) ?? false);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full flex-none flex-col bg-[var(--bg-surface)] shadow-[inset_-1px_0_0_var(--border-subtle)]"
      style={{ width: collapsed ? "var(--nav-rail-collapsed-w)" : "var(--nav-rail-w)" }}
    >
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="flex flex-col gap-4">
          {NAV_GROUPS.map((group) => {
            const entries = group.entries.filter((e) => entryAvailable(e, capabilities, role));
            if (entries.length === 0) return null;
            return (
              <div key={group.label}>
                {!collapsed && (
                  <div className="px-2.5 pb-[7px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                    {group.label}
                  </div>
                )}
                <ul className="flex flex-col gap-0.5">
                  {entries.map((entry) => {
                    const active = isActive(entry);
                    const count = entry.count ? counts?.[entry.count] ?? 0 : 0;
                    const urgent = entry.count === "inbox" && count > 0;
                    const Icon = entry.icon;
                    return (
                      <li key={entry.path}>
                        <Link
                          to={entry.path}
                          aria-current={active ? "page" : undefined}
                          aria-label={count > 0 ? `${entry.label}, ${count} waiting` : undefined}
                          title={collapsed ? entry.label : undefined}
                          className={cn(
                            "relative flex items-center gap-2 rounded-[var(--radius-nav)] px-2.5 py-[7px] text-[13px] transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
                            collapsed && "justify-center px-0",
                            active
                              ? "bg-[color-mix(in_srgb,var(--accent-bg)_13%,transparent)] font-medium text-[var(--fg-primary)] shadow-[inset_2px_0_0_var(--accent-bg)]"
                              : "text-[var(--fg-secondary)] hover:bg-[var(--list-row-bg-hover)] hover:text-[var(--fg-primary)]",
                          )}
                        >
                          <Icon aria-hidden="true" size={15} strokeWidth={1.75} className="shrink-0" />
                          {!collapsed && <span className="flex-1 truncate">{entry.label}</span>}
                          {count > 0 &&
                            (urgent ? (
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "flex h-[17px] min-w-[17px] items-center justify-center rounded-[9px] bg-[var(--status-warn)] px-1 font-mono text-[10px] font-semibold text-[var(--bg-canvas)]",
                                  collapsed && "absolute right-1 top-0.5 h-[14px] min-w-[14px] text-[9px]",
                                )}
                              >
                                {count > 99 ? "99+" : count}
                              </span>
                            ) : (
                              !collapsed && (
                                <span aria-hidden="true" className="font-mono text-[10px] text-[var(--fg-muted)]">
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

      <div className="flex flex-none items-center gap-1.5 p-2 shadow-[inset_0_1px_0_var(--border-subtle)]">
        <button
          type="button"
          onClick={onOpenPalette}
          className={cn(
            "flex h-[30px] flex-1 items-center gap-2 rounded-md px-2 text-[12px] transition-colors",
            "border border-[var(--button-secondary-border)] text-[var(--fg-secondary)]",
            "hover:bg-[var(--list-row-bg-hover)] hover:text-[var(--fg-primary)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            collapsed && "justify-center px-0",
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
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            )}
          >
            <Settings aria-hidden="true" size={15} strokeWidth={1.75} />
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="flex-none px-2 pb-2 text-[10px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        {collapsed ? "›" : "‹ Collapse"}
      </button>
    </nav>
  );
}
