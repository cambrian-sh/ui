# UI-004 — State Management

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-02 ([../prd/02-shell-and-layout.md](../prd/02-shell-and-layout.md)) requires a **projection store** — the webview-side state that mirrors the Rust core's `StateOfRecord` (EC-4). The store is folded from `kernel://state` events (UI-005). The shell, the chat surface (PRD-03), the plan work surface (PRD-04), the memory explorer (PRD-05), the operator console (PRD-06), and the configuration surface (PRD-07) all read from it.

EC-2 (PRD-01 §2.5) locks the framework: **React 19 + TypeScript + Vite**. The state management library must be idiomatic React 19, support selectors (per-screen re-render minimisation), and be testable (UI-008).

### Two flavours of state

The webview has two distinct state flavours that the chosen solution must accommodate:

1. **Projection state (the bulk).** The folded `StateOfRecord`: connection status, role, plans in flight, sessions, audit tail, pending HITL. Read-heavy. Updated by fold on every `kernel://state` event. Concurrent reads from many components.
2. **UI state (per-screen).** Selected item in a list, focused row in a table, draft text in the chat input (PRD-03), active tab in the inspector, panel widths (PRD-02 §3.3). Component-local or screen-shared.

### Options

| Option | Projection state | UI state | Bundle | React 19 fit | Notes |
|:-------|:-----------------|:---------|:-------|:-------------|:------|
| **Zustand** | ✅ vanilla store, used outside React for the fold loop | ✅ per-slice stores | tiny | ✅ (no provider) | The `src/CONTEXT.md` target architecture names Zustand as the intended store. Vanilla store works for the fold loop (UI-005) without React context. |
| **Jotai** | ✅ atoms, fine-grained re-render | ✅ atoms | small | ✅ (no provider) | Atom-based; great for per-screen UI state, but the fold loop touching hundreds of atoms gets fiddly. |
| **Redux Toolkit** | ✅ slice store, RTK Query for server | ✅ slice store | medium-large | ✅ | Heavier; great tooling (Redux DevTools) but ceremony-heavy. The fold loop is straightforward but verbose. |
| **TanStack Query** | ⚠️ designed for HTTP fetch + cache, not a stream-fold | n/a | small | ✅ | Pairs well with something else for projection state. Useful for any HTTP-style read (e.g. audit export — PRD-07). |
| **Valtio** | ✅ proxy-based | ✅ | small | ✅ (proxy proxying) | Proxy-based; less common in React 19 ecosystem. |
| **Zustand + TanStack Query** | ✅ Zustand for projection | ✅ per-screen in Zustand; Query for fetch-style reads | small + small | ✅ | The "projection is a Zustand store, audit export is a TanStack Query" split. Best ergonomics for this codebase. |

## Decision

**Recommended:** **Zustand for projection + per-screen UI state, plus TanStack Query for fetch-style reads (audit export, snapshot hydration as a fallback, anything that has a request/response shape).**

Rationale:

1. **The fold loop is outside React.** The Tauri `kernel://state` listener (UI-005) runs once, on the Tauri side, and pushes snapshots into a Zustand vanilla store. A vanilla store (no provider) is exactly the right shape — the store exists whether or not React is mounted, and any number of components subscribe via selectors.
2. **Per-screen state lives in per-slice stores.** Each screen has a Zustand slice: `useSessionList`, `useMemoryExplorer`, `useShellChrome`. Selectors give fine-grained re-render control (a row that didn't change doesn't re-render when the snapshot updates).
3. **TanStack Query fills the request/response gap.** Audit export (PRD-07), any snapshot hydration fallback, any HTTP-style read. Query's caching + dedup + retry is the right shape.
4. **`src/CONTEXT.md` already names Zustand as the target.** The in-repo target architecture doc is a soft signal; we follow it.
5. **Smallest reasonable bundle.** Zustand is ~1 KB; TanStack Query is ~10 KB. Total ~11 KB. Redux Toolkit is ~15 KB plus the devtools. The shell can afford this; we don't need the overhead.

The deciding factor against Jotai is the fold loop ergonomics — a single `set(state, snapshot)` is easier to reason about than touching 50 atoms. The deciding factor against Redux Toolkit is the ceremony relative to the bundle/feature payoff at this scale.

## Consequences

**Positive.**

- The fold loop is a single function: `useProjectionStore.setState(snapshot)` from the Tauri event listener. No React context, no provider, no hooks-in-render side effects.
- Selectors give per-row re-render control on the lists (sessions, plans, agents, memory) — a row whose data didn't change does not re-render.
- The Zustand DevTools middleware is one line; the time-travel debugger is free.
- TanStack Query's query keys give us a typed cache for audit + snapshot reads.

**Negative / risks.**

- Two state libraries. The "Zustand for X, Query for Y" split is a mental-model split; new contributors must learn both.
- The fold loop must be careful about partial snapshots. A `setState` with a partial snapshot would corrupt the projection; the fold is an idempotent absolute-state replacement (per `ui/src-tauri/CONTEXT.md`'s "Idempotent fold" contract), and the webview must honour it (UI-005).
- Zustand's lack of provider makes testing slightly unusual; UI-008's test stack handles this with `createStore` per test.

**Out of scope here** (handled in UI-005): the fold semantics (snapshot replacement vs delta), the re-hydration on `RESYNC_REQUIRED`, the optimistic-mutation pattern.

**Reversibility.** Medium-high. Zustand is a thin layer; swapping for Jotai or Valtio is mechanical. TanStack Query is well-established and unlikely to be replaced.
