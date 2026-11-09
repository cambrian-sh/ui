import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const routerState = { location: { pathname: '/chat' } };

vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => routerState,
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { NavRail, entryAvailable } from './nav-rail';

function renderRail(props: Partial<React.ComponentProps<typeof NavRail>> = {}) {
  return render(<NavRail collapsed={false} onToggle={() => {}} onOpenPalette={() => {}} {...props} />);
}

describe('NavRail', () => {
  it('groups destinations by the question they answer', () => {
    renderRail();
    for (const g of ['Work', 'Knowledge', 'Automate', 'Admin']) {
      expect(screen.getByText(g)).toBeInTheDocument();
    }
  });

  it('badges the inbox with the pending count, and never draws a zero', () => {
    const { rerender } = renderRail({ counts: { inbox: 0 } });
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    rerender(<NavRail collapsed={false} onToggle={() => {}} onOpenPalette={() => {}} counts={{ inbox: 3 }} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inbox, 3 waiting' })).toBeInTheDocument();
  });

  it('hides capability-gated destinations the kernel does not advertise', () => {
    renderRail({ capabilities: [] });
    expect(screen.queryByText('Pipelines')).not.toBeInTheDocument();
    expect(screen.queryByText('Access policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Skills')).not.toBeInTheDocument();
  });

  it('shows them once advertised (requiresAny included)', () => {
    renderRail({ capabilities: ['watches-read', 'access-policy', 'skills-lifecycle'] });
    expect(screen.getByText('Pipelines')).toBeInTheDocument();
    expect(screen.getByText('Access policy')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('keeps Runtime lit when a sibling tab is open', () => {
    routerState.location.pathname = '/mcp';
    renderRail();
    expect(screen.getByText('Runtime').closest('a')).toHaveAttribute('aria-current', 'page');
    routerState.location.pathname = '/chat';
  });

  it('no longer lists the deleted dead screens', () => {
    renderRail({ capabilities: ['audit'] });
    for (const gone of ['Verifier Pool', 'Lifecycle', 'Cost & Energy', 'Plans in flight']) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });
});

describe('entryAvailable', () => {
  it('combines requires and requiresAny', () => {
    expect(entryAvailable({}, [])).toBe(true);
    expect(entryAvailable({ requires: 'a' }, ['a'])).toBe(true);
    expect(entryAvailable({ requiresAny: ['x', 'y'] }, ['y'])).toBe(true);
    expect(entryAvailable({ requiresAny: ['x'] }, [])).toBe(false);
  });
});
