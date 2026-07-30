import type { ReactNode } from 'react';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { RuntimeTabs } from './RuntimeTabs';
import { MobileRuntime } from './MobileRuntime';

/**
 * The frame the three runtime consoles share: one title, one tab row, then the
 * console itself. Applied at the route so each console stays a plain screen and
 * keeps its own tests.
 *
 * On a phone the consoles are replaced entirely by read-only tiles — every
 * control in this section is a policy-grade decision, and none of them should
 * be made from a surface that cannot show the consequence.
 */
export function RuntimeSection({ children }: { children: ReactNode }) {
  const isMobile = useBreakpoint() === 'mobile';

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <MobileRuntime />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RuntimeTabs />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
