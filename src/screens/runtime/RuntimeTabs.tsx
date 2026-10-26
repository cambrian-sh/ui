import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from '@/design-system/lib/utils';

interface RuntimeTab {
  path: '/agents' | '/tools' | '/mcp';
  label: string;
  /** What this tab answers, for the subtitle. */
  hint: string;
}

const TABS: readonly RuntimeTab[] = [
  { path: '/agents', label: 'Agents', hint: 'who can act' },
  { path: '/tools', label: 'Tools & Skills', hint: 'what they can do' },
  { path: '/mcp', label: 'MCP', hint: 'where the tools come from' },
];

/**
 * Runtime, as one destination with three tabs.
 *
 * Agents, Tools & Skills and MCP answer a single question — *what can act here,
 * and what is it allowed to do* — but they used to be three separate rail
 * entries, so a grant, an effect class, and the server supplying the tool were
 * three navigations apart. An operator investigating "why can this agent send
 * to Telegram" had to hold the answer across three screens.
 *
 * The three routes are kept (each is independently deep-linkable, and each has
 * its own filters and focus param) and unified by this header, so the rail
 * carries one entry instead of three.
 */
export function RuntimeTabs() {
  const routerState = useRouterState();
  const path = routerState.location.pathname;

  return (
    <div className="flex-none px-[22px] pt-4">
      <h1 className="type-page-title">Runtime</h1>
      <p className="type-page-description mt-1">
        What can act in this deployment, and what it is allowed to do.
      </p>

      <nav aria-label="Runtime sections" className="mt-3 flex items-center gap-1">
        {TABS.map((tab) => {
          const active = path.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              search={{ focus: undefined }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-baseline gap-2 rounded-t-md px-3 py-2 text-[13px] transition-colors',
                active
                  ? 'font-medium text-[var(--fg-primary)] shadow-[inset_0_-2px_0_var(--accent-bg)]'
                  : 'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
              )}
            >
              {tab.label}
              <span className="hidden text-[11px] text-[var(--fg-muted)] lg:inline">
                {tab.hint}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
