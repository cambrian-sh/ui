import { useEffect, useState } from 'react';

/**
 * The three layouts this console has.
 *
 *   mobile   < 768px    tab bar, no rail, no inspector; detail is a full push
 *   compact  768–1279   rail collapses to icons, inspector becomes an overlay
 *   full     >= 1280    the rail + main + inspector layout
 */
export type Breakpoint = 'mobile' | 'compact' | 'full';

const MOBILE_MAX = 767;
const COMPACT_MAX = 1279;

export function breakpointFor(width: number): Breakpoint {
  if (width <= MOBILE_MAX) return 'mobile';
  if (width <= COMPACT_MAX) return 'compact';
  return 'full';
}

/**
 * Tracks the viewport against the three layouts.
 *
 * Reads the width during the first render rather than in an effect, so the
 * first paint is already the right layout — mounting the desktop rail and then
 * replacing it on a phone is a visible flash, and on a slow webview it is a
 * layout shift under the user's thumb.
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window === 'undefined' ? 'full' : breakpointFor(window.innerWidth),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setBreakpoint(breakpointFor(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return breakpoint;
}
