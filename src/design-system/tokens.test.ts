/**
 * The tokens.css <-> tokens.ts drift check UI-001 decided on.
 *
 * `tokens.ts` is the typed mirror of the CSS custom properties in
 * `styles/*.css`. Nothing ties the two together at build time, so a token
 * renamed or removed in CSS would leave the TS mirror pointing at a variable
 * that no longer exists — `var(--gone)` resolves to nothing, silently
 * (T-20261113-design-system-tokens-ts-has-no-importers-and).
 */
import { describe, expect, it } from 'vitest';
import { tokens, type Theme, type Density } from './tokens';

// Read from disk: vitest runs with `css: false`, which stubs every .css import
// (even `?raw`) to an empty string. `node:fs` is loaded through a string-typed
// specifier because the webview tsconfig carries no Node types. Paths are
// relative to the ui/ package root, where vitest runs (jsdom gives
// import.meta.url a non-file scheme, so it cannot anchor the path).
type Fs = {
  readdirSync(dir: string): string[];
  readFileSync(file: string, encoding: 'utf8'): string;
};
const fsModule: string = 'node:fs';
const fs = (await import(/* @vite-ignore */ fsModule)) as Fs;
const stylesDir = 'src/design-system/styles';
const css = fs
  .readdirSync(stylesDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(`${stylesDir}/${f}`, 'utf8'))
  .join('\n');

/** Every `var(--name)` reference in the tokens object, recursively. */
function referencedVars(node: unknown): string[] {
  if (typeof node === 'string') {
    return [...node.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]);
  }
  if (node && typeof node === 'object') {
    return Object.values(node).flatMap(referencedVars);
  }
  return [];
}

/** Custom properties DECLARED (`--name:`) anywhere in the design-system styles. */
function declaredVars(source: string): Set<string> {
  return new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1].slice(2)));
}

describe('design tokens: tokens.ts mirrors styles/*.css (UI-001)', () => {
  const declared = declaredVars(css);

  it('reads the stylesheets', () => {
    expect(declared.size).toBeGreaterThan(0);
  });

  it('declares every custom property the typed mirror references', () => {
    const refs = referencedVars(tokens);
    expect(refs.length).toBeGreaterThan(0);
    const missing = [...new Set(refs)].filter((name) => !declared.has(name));
    expect(missing).toEqual([]);
  });

  it('has a [data-theme] block for every Theme the type allows', () => {
    const themes: Record<Theme, true> = { light: true, dark: true, nocturne: true };
    for (const theme of Object.keys(themes)) {
      expect(css, `no [data-theme="${theme}"] block`).toContain(`[data-theme="${theme}"]`);
    }
  });

  it('has a [data-density] block for every non-default Density', () => {
    const densities: Record<Density, true> = { compact: true, default: true, spacious: true };
    for (const density of Object.keys(densities).filter((d) => d !== 'default')) {
      expect(css, `no [data-density="${density}"] block`).toContain(
        `[data-density="${density}"]`,
      );
    }
  });
});
