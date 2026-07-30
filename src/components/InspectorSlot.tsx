import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * The shell's right inspector, as a slot any screen can fill.
 *
 * The console used to keep a permanent 360px inspector mounted in the shell AND
 * a second 360px aside inside the sessions console, so a 1440px window gave the
 * list 480px and both panels said "select something". The inspector is not a
 * region of the layout — it is the detail of a selection, and it should not
 * exist when there is no selection.
 *
 * So the shell owns the frame and screens render into it:
 *
 *   {selected && <Inspector label="Step detail"><StepDetail … /></Inspector>}
 *
 * When no screen renders an `<Inspector>`, the aside is not in the DOM at all —
 * the main pane simply gets the width. That is the contract the layout tests
 * assert, and it is what stops a second permanent aside creeping back in.
 */

interface InspectorSlotValue {
  /** The mounted aside, once the shell has rendered one. */
  element: HTMLElement | null;
  register: () => void;
  unregister: () => void;
}

const InspectorSlotContext = createContext<InspectorSlotValue | null>(null);

export interface InspectorHostState {
  /** True when some screen is currently asking for the inspector. */
  active: boolean;
  /** Attach to the aside the shell renders when `active`. */
  ref: (node: HTMLElement | null) => void;
  provider: (children: ReactNode) => ReactNode;
}

/**
 * Shell-side half of the slot. Returns whether an inspector is wanted, a ref for
 * the aside, and the provider to wrap the routed content in.
 */
export function useInspectorHost(): InspectorHostState {
  // A count, not a boolean: during a route transition the outgoing screen's
  // cleanup can run after the incoming screen's effect, and a boolean would
  // tear the aside down underneath a screen that still wants it.
  const [claims, setClaims] = useState(0);
  const [element, setElement] = useState<HTMLElement | null>(null);

  const register = useCallback(() => setClaims((n) => n + 1), []);
  const unregister = useCallback(() => setClaims((n) => Math.max(0, n - 1)), []);
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);

  const value = useMemo<InspectorSlotValue>(
    () => ({ element, register, unregister }),
    [element, register, unregister],
  );

  const provider = useCallback(
    (children: ReactNode) => (
      <InspectorSlotContext.Provider value={value}>
        {children}
      </InspectorSlotContext.Provider>
    ),
    [value],
  );

  return { active: claims > 0, ref, provider };
}

export interface InspectorProps {
  children: ReactNode;
  /** Names the region for screen readers. Say what is being inspected. */
  label: string;
}

/**
 * Screen-side half. Render this when — and only when — something is selected.
 */
export function Inspector({ children, label }: InspectorProps) {
  const slot = useContext(InspectorSlotContext);

  useEffect(() => {
    if (!slot) return;
    slot.register();
    return () => slot.unregister();
    // register/unregister are stable; re-running on `element` would double-count.
  }, [slot?.register, slot?.unregister]);

  const body = (
    <div role="complementary" aria-label={label} className="h-full overflow-y-auto">
      {children}
    </div>
  );

  // No shell above us at all — a screen rendered on its own, or in a test.
  // Rendering in place is more useful than rendering nothing, and it keeps a
  // screen from silently losing its detail view outside the app frame.
  if (!slot) return body;

  // In a shell, but the shell is not offering an inspector right now (mobile).
  // There, detail is a full-screen push and the screen navigates instead.
  if (!slot.element) return null;

  return createPortal(body, slot.element);
}

/**
 * True when this tree is inside a shell that offers an inspector. Screens can
 * use it to fall back to an inline panel (mobile, tests) instead of rendering
 * a detail view that would go nowhere.
 */
export function useHasInspectorSlot(): boolean {
  return useContext(InspectorSlotContext) !== null;
}
