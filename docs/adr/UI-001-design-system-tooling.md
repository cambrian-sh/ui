# UI-001 — Design System Tooling (Tailwind v4 + shadcn/ui component library)

**Date:** 2026-06-22 (revised v0.2; original v0.1 proposed vanilla-extract and was superseded)
**Status:** Accepted

## Context

PRD-01 ([../prd/01-foundation.md](../prd/01-foundation.md)) §3 commits to a **4-layer token taxonomy** (primitive → semantic → component → density) and §3.2 commits to a **reusable, composable component library** that every other Cambrian web-based frontend can import. LD-7 (UX PRD §2.7) commits to "Tokens are consumed by Tailwind via CSS variables emitted at build time."

The org-wide convention: **every Cambrian web-based frontend uses Tailwind + shadcn/ui**. The design system must be portable across them — CSS-in-JS (vanilla-extract, Panda, Stitches) breaks this because it doesn't compose with the Tailwind classes that other frontends use.

This ADR records: **how the tokens are emitted, how the component library is structured, and how cross-frontend composability is achieved.**

## Constraints

1. **The component library is the deliverable.** shadcn/ui is installed + customised + extended into a curated, reusable, composable component library. That library is what ships, not just tokens.
2. **Cross-frontend composability.** All our other web-based frontends use Tailwind + shadcn. The chosen implementation must be portable — other frontends import the same library, inherit the same design system, share the same tokens.
3. **TypeScript = developer convenience, not runtime.** TypeScript tokens for autocomplete + type safety on token names. Tailwind-native CSS as the source of truth. **No CSS-in-JS runtime.**
4. **LD-7 contract.** "Tokens are consumed by Tailwind via CSS variables emitted at build time." Honored verbatim.
5. **Theme + density switching.** The 4-layer taxonomy must support runtime theme (dark / light, both V1 per LD-3) and density (compact / default / spacious) switching via `data-theme` / `data-density` attributes.
6. **No CSS-in-JS.** The original v0.1 of this ADR proposed vanilla-extract; the user clarified that all our other web-based frontends use Tailwind + shadcn, so the library must be portable. CSS-in-JS is therefore rejected.

## Options considered

| Option | Type safety | Build-time | Runtime toggle | Cross-frontend | Notes |
|:-------|:-----------:|:----------:|:--------------:|:--------------:|:------|
| **Tailwind v4 `@theme` + CSS variables + shadcn/ui** | ✅ via TS `tokens.ts` | ✅ zero-runtime | ✅ via `data-theme` / `data-density` | ✅ native (Tailwind + shadcn is the org convention) | **Recommended.** |
| vanilla-extract (original v0.1) | ✅ | ✅ zero-runtime | ✅ | ❌ breaks Tailwind composability | **Rejected.** Cross-frontend constraint. |
| Panda CSS | ✅ | ✅ | ✅ | ⚠️ possible but non-idiomatic | Rejected. |
| Stitches | ✅ | ✅ | ✅ | ❌ archived (2023) | Rejected. |
| Plain CSS variables + TS types | ⚠️ partial | ✅ | ✅ | ✅ | Workable but no token emission step; we'd hand-write the build glue. |
| StyleX (Meta) | ✅ | ✅ | ✅ | ⚠️ | Rejected. |

## Decision

**Recommended:** **Tailwind v4 `@theme` directive + CSS variables + shadcn/ui component library.**

### Architecture

**1. Tokens: declared in CSS via Tailwind v4's `@theme` directive.**

```css
/* tokens.css — the source of truth */
@import "tailwindcss";

@theme {
  /* Primitive layer */
  --color-neutral-50: oklch(0.985 0 0);
  --color-neutral-900: oklch(0.18 0 0);
  --color-accent-brand: oklch(0.65 0.18 250);

  /* Semantic layer (resolved to primitives) */
  --color-bg-canvas: var(--color-neutral-50);
  --color-bg-surface: var(--color-neutral-100);
  --color-fg-primary: var(--color-neutral-900);
  --color-accent-fg: var(--color-accent-brand);

  /* Component layer (resolved to semantics) */
  --color-button-primary-bg: var(--color-accent-brand);
  --color-button-primary-fg: var(--color-neutral-50);

  /* Density layer (per density mode) */
  --density-row-h: 36px;
}
```

**2. TypeScript mirror: a thin `tokens.ts` file** exports typed references for autocomplete and compile-time safety. **No CSS-in-JS runtime.** The CSS is the source of truth; the TS file is a developer convenience.

```typescript
// tokens.ts
export const tokens = {
  bg: {
    canvas: 'var(--color-bg-canvas)',
    surface: 'var(--color-bg-surface)',
  },
  fg: {
    primary: 'var(--color-fg-primary)',
  },
  button: {
    primary: {
      bg: 'var(--color-button-primary-bg)',
      fg: 'var(--color-button-primary-fg)',
    },
  },
} as const;
```

**3. Components: shadcn/ui customised to consume our tokens.**

```bash
# Install shadcn/ui into the design system
bunx shadcn@latest init
bunx shadcn@latest add button card dialog ...
```

Then each shadcn/ui component is **edited** to consume our component tokens instead of the shadcn defaults. The customised component is the source — the shadcn upstream is a reference, not a runtime dependency.

**4. New components: added to the library** for the Cambrian-specific surfaces (PlanCard, BidPanel, MemoryListRow, etc.). Each new component goes through the inventory (PRD-01 §6) and is published once.

**5. Cross-frontend composability.** The library is published as a workspace package. Other frontends (which all use Tailwind + shadcn per the org convention) install it, get the tokens + components + motion + a11y, and inherit the design system.

### Rationale

1. **Cross-frontend composability is the load-bearing constraint.** Every other Cambrian web-based frontend uses Tailwind + shadcn. The library must compose with that. CSS-in-JS (vanilla-extract, Panda, Stitches) doesn't compose with Tailwind classes — it would force a per-frontend re-implementation. Tailwind-native CSS is the only choice that works across the org.
2. **The component library is the deliverable, not just tokens.** shadcn/ui is the de-facto React + Tailwind component foundation. Customising shadcn/ui (the shadcn pattern: copy + edit) gives us a curated library that ships with our tokens, our motion, our a11y.
3. **LD-7 is honored verbatim.** "Tokens are consumed by Tailwind via CSS variables emitted at build time." Tailwind v4's `@theme` directive is exactly this.
4. **TypeScript for developer convenience.** The `tokens.ts` file gives autocomplete + compile-time safety on token names. It's a thin mirror, not a runtime; the CSS is the source of truth.
5. **Zero runtime cost.** Tailwind v4's `@theme` directive emits CSS variables at build time. There is no CSS-in-JS runtime. The browser's CSS engine handles everything.
6. **Theme + density switching is trivial.** A `data-theme` / `data-density` attribute on `<html>` flips the tokens. No JavaScript branching in components.

## Consequences

**Positive.**

- The 4-layer token taxonomy maps cleanly to Tailwind v4's `@theme` blocks. Each layer is a separate section of the CSS.
- Theme (dark / light) and density (compact / default / spacious) switching is a single `data-theme` / `data-density` attribute on `<html>`. No JavaScript branching in components.
- shadcn/ui primitives drop in unchanged (after we customise them to consume our tokens). The shadcn pattern (copy + edit) means we own the source.
- The component library is **portable** — other frontends install it, inherit the design system.
- No CSS-in-JS runtime cost. The browser's CSS engine handles everything.
- TypeScript autocomplete on token names via the `tokens.ts` mirror.
- The `bunx shadcn@latest` workflow is the standard React + Tailwind install path; no custom tooling.

**Negative / risks.**

- Tailwind v4 is newer than v3; some ecosystem packages haven't caught up. Mitigation: we use only the stable `@theme` directive; we avoid v4-only plugins that haven't stabilised.
- The shadcn pattern (copy + edit) means we own the source; upstream shadcn updates are not automatic. We re-sync shadcn manually when needed (a small, infrequent task).
- The `tokens.ts` mirror can drift from the CSS source of truth if not maintained. Mitigation: a build-time check that every CSS variable is mirrored in TS, and vice versa.
- The component library is a workspace package; it needs to be published (or at least versioned) for other frontends to import. The exact publish mechanism is a follow-on (workspace + npm, or workspace + git, or a monorepo).
- Bun (PRD-01 §2.5 EC-3) is the dev runner; shadcn/ui's CLI is `pnpm dlx` (or `bunx`). We use `bunx` for consistency with EC-3.

**Out of scope here** (handled in PRD-01 §6 + the component inventory): the specific list of customised shadcn/ui components, the new components we add for Cambrian-specific surfaces, the per-component API.

**Reversibility.** Medium. Swapping Tailwind v4 for vanilla-extract is mechanical (the tokens migrate) but loses the cross-frontend composability — which is the load-bearing constraint. The component library is the harder change to reverse.
