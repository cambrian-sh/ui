import { Link, useRouterState } from '@tanstack/react-router';
import { Database, Inbox, LayoutGrid, MessagesSquare, Network } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/design-system/lib/utils';
import { badgeCount } from '@/lib/format';
import { routeAllowedForRole } from '@/lib/roleGate';
import type { Role } from '@/ipc/types';

interface Tab {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Matches these prefixes too, so a detail push keeps its tab lit. */
  matches?: readonly string[];
}

const TABS: readonly Tab[] = [
  { path: '/chat', label: 'Chat', icon: MessagesSquare },
  { path: '/inbox', label: 'Inbox', icon: Inbox },
  { path: '/tasks', label: 'Tasks', icon: Network },
  { path: '/memory', label: 'Memory', icon: Database },
  { path: '/agents', label: 'Runtime', icon: LayoutGrid, matches: ['/tools', '/mcp', '/watch', '/skills'] },
];

export interface MobileTabBarProps {
  /** Every pending decision (useInbox) — the same count the rail shows. */
  needsYouCount: number;
  /** ADR-0142: a member sees only the tabs their role can reach. */
  role?: Role | null;
}

/**
 * The mobile primary navigation.
 *
 * Five tabs, each at least 48px tall and carrying a label as well as an icon:
 * this is the one surface where an operator is acting from a phone, often to
 * approve something irreversible, and an unlabelled icon row is where mis-taps
 * come from.
 */
export function MobileTabBar({ needsYouCount, role = null }: MobileTabBarProps) {
  const routerState = useRouterState();
  const path = routerState.location.pathname;
  const count = badgeCount(needsYouCount);

  const isActive = (tab: Tab) =>
    path.startsWith(tab.path) || (tab.matches?.some((m) => path.startsWith(m)) ?? false);

  return (
    <nav
      aria-label="Primary"
      className="flex flex-none items-stretch bg-[color-mix(in_srgb,var(--bg-surface)_94%,transparent)] shadow-[inset_0_1px_0_var(--border-subtle)] backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.filter((tab) => routeAllowedForRole(tab.path, role)).map((tab) => {
        const active = isActive(tab);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-[var(--mobile-tab-bar-h)] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors',
              active
                ? 'text-[var(--color-accent-400)]'
                : 'text-[color-mix(in_srgb,var(--fg-secondary)_45%,transparent)]',
            )}
          >
            <span className="relative">
              <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
              {tab.path === '/inbox' && count && (
                <span className="absolute -right-2.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-[8px] bg-[var(--status-warn)] px-1 font-mono text-[9.5px] font-semibold text-[var(--bg-canvas)]">
                  {count}
                </span>
              )}
            </span>
            <span className={cn('text-[10.5px]', active && 'font-medium')}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
