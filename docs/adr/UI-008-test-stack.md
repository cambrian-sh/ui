# UI-008 — Test Stack

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-01 ([../prd/01-foundation.md](../prd/01-foundation.md)) §8 commits to **a11y built in, not a follow-on**. The test stack must cover the product PRD's "What is tested" requirements (UI-1 through UI-8): the 24 use cases, the 53 user stories, the realtime promise (ID-5), the audit promise (ID-6), the vocabulary promise (ID-2), the remote-connection promise (ID-10), the design-system promise (ID-8), and the "out of scope" tests (a regression that adds a marketing site fails).

The product PRD §"Testing Decisions" is explicit: "Accessibility tests are part of 'good test.' Keyboard navigation, focus order, screen reader, contrast."

EC-2 (PRD-01 §2.5) locks the framework: React 19 + TypeScript + Vite. EC-3 locks the runner: Bun. The test stack must integrate with Vite + Bun.

### What must be tested (test pyramid)

| Layer | Tool | What |
|:------|:-----|:-----|
| **Unit** | Vitest | Pure functions, design-system tokens, the fold loop (UI-005), the keyboard map (PRD-01 §9), the state vocabulary reducer (PRD-01 §10), the per-screen Zustand slices. |
| **Component** | Vitest + React Testing Library | Every PRD-01 component renders correctly. Snapshots are *not* the primary test; behavioural assertions are. |
| **A11y unit** | Vitest + jest-axe (or vitest-axe) | Every component meets axe-core rules in isolation. The design-system inventory is the choke point. |
| **End-to-end** | Playwright | The 24 use cases (UC-1…UC-24), the V1 demo path, role-gating flows, keyboard navigation, deep links, the realtime fold. |
| **A11y e2e** | Playwright + @axe-core/playwright | Full-page axe scans on every screen. WCAG AA at minimum; AAA preferred (PRD-01 §8). |
| **Visual regression** (optional) | Playwright's screenshot diff | The status strip, the PlanCard, the memory graph — surfaces with strong visual contracts. **Defer to a follow-on; not V1.** |
| **Out-of-scope regression** | Custom Playwright assertion | Asserting that the dev server does not serve `/blog`, `/pricing`, `/docs` (no marketing site); that the bundle does not include a marketplace package. |

### Options

| Option | Vitest | RTL | axe-core | Playwright | Bun fit | Notes |
|:-------|:------:|:---:|:--------:|:----------:|:-------:|:------|
| **Vitest + RTL + jest-axe + Playwright + @axe-core/playwright** | ✅ | ✅ | ✅ | ✅ | ✅ | The standard React 19 + Vite + TS stack. Bun runs Vitest. Playwright is its own runner. |
| **Jest + Cypress + jest-axe** | ❌ | ✅ | ✅ | (Cypress, not Playwright) | ⚠️ Jest does not run on Bun; Cypress is heavier | Heavier; Cypress's e2e model is less idiomatic for a Tauri webview than Playwright's. |
| **Vitest + Testing Library + Playwright** (no axe) | ✅ | ✅ | ❌ | ✅ | ✅ | Misses the a11y promise. Fails PRD-01 §8. |
| **Storybook + Chromatic** | ❌ | n/a | ❌ | n/a | ⚠️ | Visual regression, not behavioural. Not V1. |

## Decision

**Recommended:** **Vitest + React Testing Library + jest-axe (or vitest-axe) for unit/component/a11y-unit; Playwright + @axe-core/playwright for e2e + a11y-e2e; defer visual regression to a follow-on.**

Rationale:

1. **Vitest is the Vite-native test runner.** Same Vite config; same module resolution; same transform pipeline. ESM-native, fast, well-supported on Bun.
2. **React Testing Library tests the user, not the implementation.** Product PRD §"What is tested" is explicit: "Test what the user sees and does, not the implementation behind it." RTL is the canonical implementation of that rule.
3. **axe-core in two places is non-negotiable.** The component-level sweep catches design-system violations at PR time; the full-page sweep catches screen-level violations that emerge from composition. PRD-01 §8 + product PRD "Accessibility tests are part of 'good test'" — both covered.
4. **Playwright is the right e2e runner for a Tauri webview.** It supports headless Chromium with the same engine the Tauri webview uses (WebKit on macOS, Chromium on Linux/Windows). The e2e tests can target either the live Tauri shell or a plain Vite dev server for component-level flows.
5. **Bun runs Vitest.** No friction.
6. **Out-of-scope regressions as Playwright assertions** are the cleanest way to enforce "no marketing site" / "no marketplace" / "no mobile" (product PRD §"Out of scope" + §"Out-of-scope tests").

The deciding factor against Jest is the Bun fit. The deciding factor against Cypress is the Tauri-webview integration; Playwright is the more idiomatic choice.

## Consequences

**Positive.**

- One test runner (Vitest) for unit + component + a11y-unit. One test runner (Playwright) for e2e + a11y-e2e. Two is the minimum.
- The test stack is Bun-compatible end-to-end.
- A11y is tested at two levels (component, page) — the design-system violations are caught at PR time, the composition violations are caught at e2e time.
- The 24 use cases (UC-1…UC-24) and the 53 user stories (Story 1…53) have a 1:1 mapping to test files; the test pyramid is the regression net.

**Negative / risks.**

- Two test runners. New contributors must learn both. Vitest first; Playwright second.
- Playwright in a Tauri context has been historically fiddly. The 2025+ Tauri + Playwright integration is stable; we test against the Vite dev server for most flows and the Tauri shell only for the gRPC-via-Tauri-IPC path.
- jest-axe vs vitest-axe: `vitest-axe` is the maintained wrapper for Vitest. We commit to `vitest-axe`.
- Visual regression is deferred. If the design system drifts visually, we'll catch it in the design-system component tests + manual QA, not in CI. A follow-on ADR adds visual regression.

**Out of scope here** (handled in PRD-07): the audit-log replay tests, the audit export schema tests, the per-tenant role policy tests.

**Reversibility.** Medium. Vitest ↔ Jest is mechanical; RTL stays. Playwright ↔ Cypress is harder (different test models). The a11y stack (axe-core) is portable.
