import { describe, expect, it } from 'vitest';
import { cardAction, pluginRoute } from './panelRegistry';

describe('panelRegistry', () => {
  it('offers Open only for a plugin this build has a destination for', () => {
    expect(pluginRoute('telegram')).toBe('/telegram');
    // The kernel can run a plugin whose admin plane this console has never heard
    // of. An Open button leading nowhere is worse than an honest absence.
    expect(pluginRoute('some-future-plugin')).toBeUndefined();
  });

  it('sends telegram to its own page rather than expanding in place', () => {
    // The whole point of the move: Plugins is an index, not a container for
    // three unrelated admin UIs.
    expect(pluginRoute('telegram')).toMatch(/^\//);
  });

  it('never offers Open for a plugin that is not running', () => {
    // Locked, expired, unverifiable — all inactive. There is nothing to open, and
    // a disabled button implies there would be if you paid.
    expect(cardAction('telegram', false, true)).toBe('none');
  });

  it('sends an active plugin whose controls are a NAV destination elsewhere', () => {
    // Reactive owns a whole section; reproducing it inside a card would be a
    // worse version of the real thing.
    expect(cardAction('reactive', true, true)).toBe('elsewhere');
  });

  it('says nothing for an active plugin that contributes no surface at all', () => {
    expect(cardAction('progress', true, false)).toBe('none');
  });

  it('opens telegram, because this build knows where its page is', () => {
    expect(cardAction('telegram', true, true)).toBe('open');
  });
});
