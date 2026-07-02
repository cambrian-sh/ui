# UI-006 — Motion Library

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-01 ([../prd/01-foundation.md](../prd/01-foundation.md)) §4.4 + §7 enforces a **strict motion budget**: ≤250 ms in, ≤600 ms out, two named easings, no scale, no rotation, no glow, no neon, no particle effects. The motion is bounded: pulse, trail, status pill (instant), skeleton (1.5 s shimmer, the only loop).

The motion we need is:
- The pulse (background tint, 250 ms in / 600 ms out).
- The trail (2 px vertical mark, 250 ms in / hold / 600 ms out).
- The skeleton shimmer (1.5 s loop).
- The chat surface's `≤250 ms in` for new blocks (PRD-03).
- The status strip's `ConnectionBadge` state change (PRD-02 §6).
- The density toggle re-flow (token-driven; the shell re-spaces on density change).

### Options

| Option | Bundle | React 19 fit | LD-2 compliance | Notes |
|:-------|:-------|:-------------|:----------------|:------|
| **CSS-only** (`transition` + `@keyframes` + `prefers-reduced-motion`) | 0 KB | ✅ | ✅ direct | The motion budget is so constrained that a JS animation library is overkill. CSS handles all 5 cases. |
| **Framer Motion** (now "Motion") | ~30 KB | ✅ | ⚠️ possible but the library is built for the broader motion vocabulary we forbid | Powerful, but the library's defaults (spring physics, scale, rotation) push against LD-2. Customising every component to remove the defaults is more work than CSS. |
| **Motion One** (the lower-level version) | ~10 KB | ✅ | ⚠️ same | Lower-level than Framer Motion; still brings a vocabulary that has to be constrained. |
| **GSAP** | ~25 KB | ⚠️ imperative | ❌ | Overkill; GSAP's strength is the complex sequences we forbid. |
| **Auto-Animate** | ~5 KB | ✅ | ⚠️ | Layout animations on list reorder; useful but doesn't cover pulse/trail/skeleton. |

## Decision

**Recommended:** **CSS-only**, with a thin in-house helper for the `prefers-reduced-motion` opt-out.

Rationale:

1. **The motion budget is 5 cases.** Pulse, trail, skeleton, new-block in, connection-badge change. CSS handles all 5 with `transition` + `@keyframes`.
2. **LD-2 compliance is direct.** Writing CSS that matches the spec is straightforward; configuring a library to match the spec is configuration overhead.
3. **Zero bundle cost.** No JS animation runtime. The 30 KB Motion library buys us capabilities (springs, layout animations, gesture-driven sequences) we don't need and explicitly forbid.
4. **Reduced-motion is one media query.** `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }` is the helper. The PRD-01 §8 contract that "realtime state is still communicated via status pills, text, and live regions — only the visual motion is reduced" is satisfied by the existing semantic components (status pill, text label).
5. **Performance is CSS-engine-optimal.** The browser's compositor handles opacity and transform on a separate thread. JS animation libraries can match this but require the right configuration.

The deciding factor against Motion is the default vocabulary. The library is excellent, but our motion budget is *smaller* than the library's minimum useful surface. Adding the library to "satisfy a checklist" is overhead.

## Consequences

**Positive.**

- Zero bundle cost. Zero JS animation runtime. The motion is a stylesheet concern.
- The motion budget is enforceable as a lint rule: any `transition` or `animation` property must be in the design-system stylesheet; any motion in component code is a violation of PRD-01 §11.
- Reduced-motion is one media query; the accessibility contract (PRD-01 §8) is satisfied.

**Negative / risks.**

- Sequencing complex multi-step animations (e.g. a card that slides in, pulses, then settles) is harder in CSS than in JS. We don't have such sequences today; if we do later, a small JS helper for the rare case is fine.
- Designers iterating on the motion curve must edit the design-system stylesheet, not the component. This is by design (PRD-01 §11 forbids bespoke per-component motion).

**Out of scope here** (handled in PRD-04): the per-step status pill transitions, the bid panel's transient overlay behaviour. These are CSS-only and use the same tokens.

**Reversibility.** High. Adding Motion later for the rare complex sequence is non-breaking; CSS motion is still the default for the 80% case.
