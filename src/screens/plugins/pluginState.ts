import type { PluginState } from '@/ipc/types';

/**
 * The four card states a plugin can be in (`10a`).
 *
 * The kernel's `PluginState.state` carries `active | deps_unmet | not_entitled |
 * expired` (ADR-0082 D9). The design asks for a fourth situation the enum does
 * NOT express: **the licence check itself failed**.
 *
 * That matters because a failed check *fails closed* — the plugin is off, the
 * operator's work is intact, and it will start on its own when the check
 * succeeds. Rendering that as `not_entitled` would tell an operator they do not
 * own something they paid for, and rendering it as a silent absence is worse.
 * So it is a distinct state here, and the kernel gap is recorded in report.md.
 */
export type PluginCardState =
  | 'active'
  | 'off'
  | 'not_entitled'
  | 'expired'
  | 'unverifiable';

export interface PluginCard {
  plugin: PluginState;
  card: PluginCardState;
  /** One clause saying why it is in this state. */
  why: string;
  /** What the operator can do about it, if anything. */
  action: string | null;
}

// A state string this build does not recognise falls through to `unverifiable`
// below. That is deliberate: a kernel newer than this console can name a state
// we have never heard of, and the safe reading is "we cannot confirm this is
// on", never "you do not have it".

export function classifyPlugin(plugin: PluginState): PluginCard {
  const missing = plugin.missing?.length ? plugin.missing.join(', ') : '';

  switch (plugin.state) {
    case 'active':
      return { plugin, card: 'active', why: plugin.reason || 'Running.', action: 'Open' };

    case 'deps_unmet':
      return {
        plugin,
        card: 'off',
        // "You have it; it has nowhere to send" — the licence is fine, something
        // it depends on is not.
        why:
          plugin.reason ||
          (missing
            ? `You have it; it is waiting on ${missing}.`
            : 'You have it; something it depends on is not configured.'),
        action: 'Add credentials',
      };

    case 'not_entitled':
      return {
        plugin,
        card: 'not_entitled',
        why: plugin.reason || 'Not included in your plan.',
        action: 'What it does',
      };

    case 'expired':
      return {
        plugin,
        card: 'expired',
        why: plugin.reason || 'The licence for this plugin has expired.',
        action: 'What it does',
      };

    default:
      return {
        plugin,
        card: 'unverifiable',
        why:
          plugin.reason ||
          `This build does not recognise the state “${plugin.state}”, so it cannot confirm the plugin is running.`,
        action: null,
      };
  }
}

/**
 * The surfaces a plugin contributes, phrased for its state.
 *
 * "Adds" when it is on, "would add" when it is not — a locked plugin still
 * lists them, because otherwise the only way to learn a capability exists is a
 * sales call.
 */
export function surfacePhrasing(card: PluginCardState): 'adds' | 'would add' {
  return card === 'active' ? 'adds' : 'would add';
}

/** Does this plugin's absence remove a nav destination? */
export function contributesNav(plugin: PluginState): boolean {
  return (plugin.panels?.length ?? 0) > 0;
}
