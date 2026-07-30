import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const routerState = { location: { pathname: '/sessions' } };

vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => routerState,
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { NavRail } from './nav-rail';

function renderRail(props: Partial<React.ComponentProps<typeof NavRail>> = {}) {
  return render(
    <NavRail
      collapsed={false}
      onToggle={() => {}}
      needsYouCount={0}
      onOpenPalette={() => {}}
      {...props}
    />,
  );
}

describe('NavRail', () => {
  it('renders nothing at all for "Needs you" when the count is zero', () => {
    // Not a greyed row, not a zero — absent. A permanent "Needs you: 0" trains
    // the operator to skip the one row that must never be skipped.
    renderRail({ needsYouCount: 0 });
    expect(screen.queryByText('Needs you')).not.toBeInTheDocument();
  });

  it('pins "Needs you" above everything with its count once something is waiting', () => {
    renderRail({ needsYouCount: 3 });
    expect(screen.getByText('Needs you')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('groups navigation instead of listing fourteen flat entries', () => {
    renderRail();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Execution')).toBeInTheDocument();
    expect(screen.getByText('Governance')).toBeInTheDocument();
  });

  it('does not draw keyboard hints next to every label', () => {
    // The bindings still exist in lib/keyboard.ts — they are looked up in the
    // palette and the shortcut sheet, not rendered at 10px on every row.
    renderRail();
    expect(screen.queryByText('g s')).not.toBeInTheDocument();
    expect(screen.queryByText('g p')).not.toBeInTheDocument();
  });

  it('marks the active destination, including when a sibling tab is open', () => {
    routerState.location.pathname = '/mcp';
    renderRail();
    // Agents / Tools & Skills / MCP are one destination now, so MCP keeps the
    // single Runtime row lit rather than lighting nothing.
    const runtime = screen.getByText('Runtime');
    expect(runtime.closest('a')).toHaveAttribute('aria-current', 'page');
    routerState.location.pathname = '/sessions';
  });

  it('omits a row count when there is nothing to count', () => {
    renderRail({ counts: { sessions: 0, plans: 2 } });
    expect(screen.getByText('2')).toBeInTheDocument();
    // sessions is 0 — no badge, same rule as the inbox.
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
