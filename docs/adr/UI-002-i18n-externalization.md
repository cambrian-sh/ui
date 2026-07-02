# UI-002 — i18n Externalization Strategy

**Date:** 2026-06-22
**Status:** Accepted

## Context

The product PRD (`../prd/web-ui-prd.md` "Out of Scope") and the requirements document (`../requirements/web-ui-requirements.md` §3) are explicit: **V1 is English-only; i18n is a follow-on, not a V1 feature**. The same documents add a *hard* constraint: **strings must be externalised** so the follow-on is a translation project, not a refactor.

We must pick a string externalization strategy now (before any UI code lands) that satisfies the constraint and does not paint us into a corner.

### Constraints

1. **English-only at V1.** No shipped translations. The English source string is the only string at runtime.
2. **Type-safe at the call site.** A typo in a key is a compile error or a build-time error, not a silent fallback.
3. **No string literals in component code.** Every visible string lives in a messages file (or equivalent). The linter enforces this on the same pass as the token rules (PRD-01 §11).
4. **Pluralization, interpolation, formatting** must be supported when we do add languages. Even at V1, `count`, `date`, and `number` formatting are needed (Story 4 — "the operator sees the streamed output… elapsed time, cost so far" — and Story 12 — "current step, active agent, confidence, TrustScore, cost so far, elapsed time" — use pluralization and number formatting).
5. **Bundle size.** No shipped translations → near-zero overhead. Translation files are loaded on demand when i18n is enabled (the follow-on).
6. **Tree-shakable.** Unused keys are not bundled.
7. **Lightweight integration.** Plays well with Vite, vanilla-extract (UI-001), and shadcn/ui.

### Options

| Option | Type safety | Build-time | Plural/number | Vite fit | Notes |
|:-------|:-----------:|:----------:|:-------------:|:--------:|:------|
| **i18next + react-i18next** | ⚠️ key-based; types via `i18next-typescript` or a codegen step | ✅ | ✅ ICU MessageFormat via plugins | ✅ | Most popular in the React ecosystem. Mature, lots of plugins (ICU, backend loaders, language detection). Key-based by default; full type safety requires an extra tool. |
| **FormatJS / react-intl** | ✅ typed via babel-plugin | ✅ | ✅ ICU natively | ✅ | ICU MessageFormat as the source of truth. Typed via babel macros. Best for large, formally-translated products. Heavier setup. |
| **Lingui** | ✅ typed via babel-plugin | ✅ | ✅ ICU + macros | ✅ | Macro-based (`<Trans>`, `t`); minimal runtime. Best ergonomics for a TS-first codebase; smaller community than i18next. |
| **Custom lightweight** | ✅ | ✅ | ⚠️ hand-rolled | ✅ | A `.ts` map of `Record<Namespace, Record<Key, string>>` + a `t(ns, key)` helper. Zero deps. Plural/format must be hand-rolled. |
| **Lingui recommended** | ✅ | ✅ | ✅ | ✅ | See Lingui row. |

## Decision

**Recommended:** **Lingui**.

Rationale:

1. **TS-first ergonomics.** Lingui's `t` macro + babel-plugin produce a typed messages catalogue at build time. A typo in a key is a compile error.
2. **ICU native.** Pluralization, gender, select, and number formatting are first-class via MessageFormat. The V1 source strings can use ICU placeholders without committing to translations.
3. **Smallest reasonable runtime.** Macro-based extraction means V1 ships zero translation runtime; the English catalogue is the source of truth. When we add a second language, only that catalogue loads.
4. **Plays well with Vite.** The `@lingui/babel-plugin-extract-messages` runs in the babel pass; the catalogue is JSON in `src/locales/en/messages.json`. Vite bundles the JSON; unused keys are tree-shaken.
5. **Migration path is clean.** When the follow-on ships, we add `src/locales/<lang>/messages.json` and a runtime loader. No component refactor.

i18next is a viable alternative; the deciding factor against it is the type-safety story (key-based by default; the codegen step is extra glue) and the fact that Lingui's macro model matches our "no string literals in component code" lint rule more naturally.

FormatJS is the most formally correct for an enterprise multi-locale product; it is overkill for a dev-tools operator console and adds babel-macro ceremony that is harder to onboard a small team into.

Custom lightweight is a viable fallback. If we want zero new dependencies and are willing to hand-roll `pluralize` + `Intl.NumberFormat` helpers, this works. It is the lowest-cost option; it is also the most likely to need replacing when the follow-on lands.

## Consequences

**Positive.**

- Every visible string is a `t\`...\`` macro call (or `<Trans>…</Trans>` for inline JSX). The linter (PRD-01 §11) rejects raw string literals in component code outside the messages catalogue.
- The V1 source catalogue is a single JSON file. Reviewing a string change is `git diff src/locales/en/messages.json`.
- The follow-on (adding a second language) is purely additive: a new JSON catalogue, a runtime loader, a language switcher in PRD-07 Settings. No component changes.

**Negative / risks.**

- babel macros are part of the build chain. The team must be comfortable with babel; Vite uses esbuild for TS, so we add a babel pass for `.tsx` files. The build gets one more moving part.
- ICU MessageFormat is precise but verbose. A simple plural requires `{count, plural, one {# item} other {# items}}` in the source. Worth the precision; not free.
- If we never add a second language, the ceremony is overhead. Mitigation: the English catalogue is the V1 deliverable; the rest is dormant until activated.

**Out of scope here** (handled in PRD-07): the language switcher, the per-operator language preference, the locale-aware date/number formatting on the cost panel.

**Reversibility.** High. Swapping Lingui for i18next later means rewriting the message extraction step but leaves the message catalogue and component call sites semantically equivalent.
