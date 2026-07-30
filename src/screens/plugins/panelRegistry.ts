// Where a plugin's controls live, if this console has any.
//
// A plugin card can always say what a plugin IS. Whether this console can also
// CONFIGURE it is a separate fact: the kernel may run a plugin whose admin plane
// this build has never heard of, and an "Open" button leading nowhere is worse
// than one that is honestly absent.
//
// Every entry is a ROUTE rather than a panel rendered in place. Plugins answers
// "what is this kernel running, and why is that surface missing"; a bridge that
// carries real people is a different question on a different clock, and folding
// it into an expander here made a page you scroll past to reach the page you
// wanted. So this page links out and stays the index it is good at being.

/** Plugin id -> the route that configures it. */
export const PLUGIN_ROUTES: Record<string, string> = {
  telegram: '/telegram',
};

export function pluginRoute(pluginId: string): string | undefined {
  return PLUGIN_ROUTES[pluginId];
}

/**
 * Why a card's primary action is what it is.
 *
 * `open` — this build has a destination for it and the plugin is running.
 * `elsewhere` — active and contributes surfaces, but its controls are somewhere
 *   this registry does not name (Reactive owns a whole nav section of its own).
 * `none` — nothing to open: not active, or no surface anywhere.
 */
export type CardAction = 'open' | 'elsewhere' | 'none';

export function cardAction(pluginId: string, active: boolean, contributesNav: boolean): CardAction {
  if (!active) return 'none';
  if (pluginRoute(pluginId)) return 'open';
  return contributesNav ? 'elsewhere' : 'none';
}
