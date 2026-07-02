# UI-007 — Keyboard Library

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-01 ([../prd/01-foundation.md](../prd/01-foundation.md)) §9 defines the keyboard foundation: 17 V1 shortcuts + the `Cmd/Ctrl-K` command palette + the `?` shortcut palette. The shortcuts are split into:
- **Global single-letter shortcuts** — `g s`, `g p`, `g a`, `g t`, `g m`, `g y`, `g o`, `g w`, `g l`, `g v`, `g c`, `g u`, `g x`, `c`, `i`, `a`, `r`, `e`, `j`, `k`, `Enter`, `Esc`, `?`, `1`…`9`, `t`, `/`, `n`, `[`, `]`, `{`, `}`.
- **Global chord shortcuts** — `Cmd/Ctrl-K`.
- **Contextual shortcuts** — `c` (when on a session), `i` (when a plan is running), `a/r/e` (when an intervention is highlighted), etc.

The library must:
- Support **chord sequences** (`g` then `s`, with a 1-second window).
- Support **scope** (a shortcut only fires when its scope condition is true — e.g. `i` only when a plan is running).
- Be **type-safe** (the keyboard map is a typed object).
- Honour the `prefers-reduced-motion` rule (the keyboard map must NOT depend on motion; the related motion is the status-pill state change, which is instant — PRD-01 §4.4).
- Work with the existing input fields (chat input, inject input) without hijacking key events inside them.

### Options

| Option | Chord support | Scope support | Bundle | React 19 fit | Notes |
|:-------|:-------------|:-------------|:-------|:-------------|:------|
| **`react-hotkeys-hook`** | ✅ via `useHotkeys('g>s', handler)` | ✅ `enableOnFormTags`, `enabled` | ~3 KB | ✅ | Composable hook; the chord is `g>s` syntax. Scope via `enabled` prop. Mature. |
| **Mousetrap** | ✅ (chord sequences) | ⚠️ manual | ~5 KB | ❌ (vanilla, no React) | Mature vanilla library; React integration is manual. |
| **Custom event listener** | ✅ (manual) | ✅ (manual) | 0 KB | ✅ | A thin custom hook over `window.addEventListener('keydown')`. The keyboard map is a typed object. Zero deps. |
| **`@react-hookz/web` keypress hook** | ❌ single key only | ⚠️ | ~1 KB | ✅ | Lacks chord support. |
| **Framer Motion / Motion's keyboard** | n/a | n/a | n/a | n/a | Not a keyboard library; out of scope. |

## Decision

**Recommended:** **`react-hotkeys-hook`**.

Rationale:

1. **Chord support out of the box.** The 12 `g x` navigation entries are chord sequences (`g` then `s`/`p`/`a`/etc.). The library's `g>s` syntax is the natural shape.
2. **Composable scope.** `useHotkeys('i', handler, { enabled: isPlanRunning })` is the natural way to express the "when a plan is running" scope from PRD-01 §9.
3. **Form-input awareness.** The `enableOnFormTags` option lets the chat input and inject input (PRD-03) absorb keys when focused, without the library hijacking them.
4. **Type-safe wrapper.** We wrap `useHotkeys` in a typed `useShortcut(ShortcutId)` hook; the keyboard map (PRD-01 §9) is the single source of truth.
5. **Bundle cost is ~3 KB.** Worth it for the chord + scope + form-input story.

The deciding factor against a custom event listener is the chord support. The 12 `g x` chords are the highest-frequency keyboard use in the operator's day; getting them right matters. The deciding factor against Mousetrap is the React-19 idioms; a vanilla library means manual lifecycle management.

## Consequences

**Positive.**

- Every PRD's keyboard entry (PRD-02's `[` / `]` / `{` / `}`, PRD-03's `c` / `i` / `n`, PRD-04's `a` / `r` / `e`, PRD-05's `j` / `k` / `Enter`, PRD-06's `1`…`9` / `/`, PRD-07's `?`) becomes a one-line `useHotkeys` call.
- Chord sequences work; `g>s` is the 1-second-window navigation.
- Form inputs are not hijacked. The chat input keeps `Enter` for send, `Shift-Enter` for newline; the inject input keeps `Cmd/Ctrl-Enter` for submit (PRD-03 §5.7 + §5.5).
- Type-safe wrapper. A typo in a shortcut id is a compile error.

**Negative / risks.**

- One library to keep updated. Mature; low risk.
- Chord sequences have a 1-second window by default. Operators learn the cadence; 1 second is the right balance (shorter is frustrating, longer is sluggish).

**Out of scope here** (handled in PRD-02 §8): the `?` shortcut palette modal (a search-over-shortcuts component), the `Cmd/Ctrl-K` command palette modal (a free-text-over-actions component). The library binds the keys; the modals are PRD-01 components.

**Reversibility.** High. The keyboard map is data; swapping the library rewires the bindings, not the consumers.
