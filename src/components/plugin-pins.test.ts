/**
 * Every plugin a screen wraps in `PluginSurface` must have a pinned version in
 * `PINNED_PLUGIN_VERSIONS` (src-tauri/src/pb.rs, ADR-0089).
 *
 * An unpinned plugin id makes `plugin_skew` answer `Unknown`, so `PluginSurface`
 * shows the "no pinned expectation" banner on every visit, even on a matched
 * build — and a real skew on that plane then looks exactly like the always-on
 * banner (T-20261113-pinned-plugin-versions-omits-five-premium). The pin table
 * lives in Rust and the surfaces in TypeScript, so nothing but this test ties
 * the two together.
 */
import { describe, expect, it } from 'vitest';
import pbRs from '../../src-tauri/src/pb.rs?raw';

const screens = import.meta.glob<string>('../screens/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Plugin ids pinned in pb.rs's PINNED_PLUGIN_VERSIONS table. */
function pinnedIds(source: string): string[] {
  const table = source.match(
    /pub const PINNED_PLUGIN_VERSIONS:[^=]*=\s*&\[([\s\S]*?)\];/,
  );
  if (!table) throw new Error('PINNED_PLUGIN_VERSIONS not found in pb.rs');
  return [...table[1].matchAll(/\(\s*"([^"]+)"\s*,\s*"[^"]+"\s*\)/g)].map(
    (m) => m[1],
  );
}

/**
 * Plugin ids passed to PluginSurface in one screen file: a string literal
 * (`pluginId="org-directory"`) or a module constant
 * (`pluginId={ACCESS_POLICY_PLUGIN_ID}` with `const ACCESS_POLICY_PLUGIN_ID = 'authz'`).
 */
function surfacePluginIds(file: string, source: string): string[] {
  if (!source.includes('<PluginSurface')) return [];
  const ids: string[] = [];
  for (const m of source.matchAll(/pluginId=(?:"([^"]+)"|\{(\w+)\})/g)) {
    if (m[1]) {
      ids.push(m[1]);
      continue;
    }
    const decl = source.match(
      new RegExp(`const\\s+${m[2]}\\s*=\\s*['"]([^'"]+)['"]`),
    );
    if (!decl) {
      throw new Error(`${file}: cannot resolve pluginId={${m[2]}} to a string`);
    }
    ids.push(decl[1]);
  }
  return ids;
}

describe('PINNED_PLUGIN_VERSIONS covers every PluginSurface', () => {
  const pinned = pinnedIds(pbRs);

  it('parses the pin table', () => {
    expect(pinned).toContain('authz');
  });

  it('has a pin for each pluginId a screen passes to PluginSurface', () => {
    const used = new Map<string, string>();
    for (const [file, source] of Object.entries(screens)) {
      for (const id of surfacePluginIds(file, source)) used.set(id, file);
    }
    // Guard against the scan silently matching nothing.
    expect(used.size).toBeGreaterThan(0);
    const missing = [...used].filter(([id]) => !pinned.includes(id));
    expect(missing).toEqual([]);
  });
});
