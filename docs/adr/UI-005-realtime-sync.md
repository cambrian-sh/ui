# UI-005 — Realtime Sync Strategy

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-02 ([../prd/02-shell-and-layout.md](../prd/02-shell-and-layout.md)) requires a **hydration contract**: on shell mount, call `op_get_state` (Tauri IPC) once; thereafter, fold every `kernel://state` event into the projection store. The contract is fixed by EC-4 (gRPC in Rust core) and the in-repo `ui/src-tauri/CONTEXT.md` (full transport contract).

EC-5 pins the proto: `ui/proto/operator.proto` at contract 0047. The Rust core emits `OperatorEvent` envelopes with a `oneof` payload covering 15 event types (per the explore). The webview's job is to fold these into the Zustand store (UI-004).

The decisions this ADR records are: **how** the fold works (snapshot vs delta), **what to do** on `RESYNC_REQUIRED`, **how to handle** the `kernel://token` live-only lane, and **how to keep the UI responsive** when the event stream is bursty.

### The shape of the data

The Rust core's `StateOfRecord` (per `ui/src-tauri/state.rs`) is the **single source of truth**. The webview never owns state the kernel doesn't know about. The Tauri `op_get_state` returns a `StateOfRecord`; the `kernel://state` event also carries a `StateOfRecord` (full snapshot, not delta). This is the contract: **every `kernel://state` event is a full absolute-state snapshot**, and the fold is an idempotent replacement.

### Options

| Strategy | Latency | CPU on webview | Burst resilience | Simplicity | Notes |
|:---------|:-------:|:--------------:|:----------------:|:----------:|:------|
| **Replace on every event** (the spec) | ✅ lowest | ⚠️ re-render cost per event | ⚠️ burst = O(n) per snapshot | ✅ trivial | What `ui/src-tauri/CONTEXT.md` describes. The webview trusts the snapshot. |
| **Delta-based fold** | ✅ low | ✅ only changed fields | ✅ | ❌ complex | Requires the Rust core to emit diffs. Out of scope per the existing contract. |
| **Replace + diff-then-render** (memo on the consumer) | ✅ low | ✅ unchanged fields skip | ✅ | ⚠️ | The store replaces; selectors compute diffs. Combines the trust of replace with the CPU of delta. **This is the recommended path.** |
| **Debounced replace (coalesce bursty events)** | ⚠️ higher latency | ✅ fewer re-renders | ✅ | ⚠️ | The kernel's status strip's `Event backlog` field exists precisely to surface this. Adds a small latency; trades against the realtime promise. |

## Decision

**Recommended:** **Replace on every event, with selector-level memoisation on the consumer side.**

Rationale:

1. **The Rust core is the source of truth.** `ui/src-tauri/CONTEXT.md` is explicit: `kernel://state` is a full `StateOfRecord` snapshot, the fold is idempotent. The webview does not own state; it renders what the kernel says.
2. **Burst resilience comes from selectors, not from debouncing.** Zustand selectors compute their result on read; if the underlying data didn't change, the component does not re-render. The webview is `O(rows_touched)` per snapshot, not `O(total_rows)`.
3. **`RESYNC_REQUIRED` is a re-hydrate.** When the kernel sends `RESYNC_REQUIRED` (cursor lost), the webview drops the projection store, calls `op_get_state` again, and re-folds. No special logic; the same path.
4. **The `kernel://token` live-only lane never goes through the projection store.** Tokens are ephemeral, never replayed. They are a separate React-side subscription (PRD-04 owns the agent output stream surface).

The deciding factor against debouncing is product PRD ID-5 (realtime default, no manual refresh). Debouncing is a latency tax; the operator would see stale state. The deciding factor against delta-based fold is the existing kernel contract — we don't get to renegotiate it for the UI.

## Consequences

**Positive.**

- The fold is a single function: `useProjectionStore.setState(snapshot)`. Stateless. Trivial to test (UI-008).
- Burst resilience: 100 events arriving in 100 ms = 100 setState calls = the store replaces 100 times. Selectors with shallow equality checks skip re-renders for unchanged slices. The cost is bounded by the number of *changed* rows.
- `RESYNC_REQUIRED` is a re-hydrate, not a special case.
- The `kernel://token` lane is separated by design — no risk of token chunks polluting the projection.

**Negative / risks.**

- Re-render cost is non-zero on every event. The shell's status strip (PRD-02 §6) and the lists (PRD-05, PRD-06) are the hot spots. Selectors must use shallow equality (`zustand/shallow`) and memo-friendly returns.
- A burst of N snapshots in 1 second means N store replacements. If the burst rate is very high (e.g. 1000 events/s during a memory consolidation), the event backlog indicator (PRD-02 §6.1) will go amber and tell the operator. We do **not** silently drop events.
- The Rust core's fold contract is absolute-state; if it ever ships a delta, the webview's fold must be updated. The contract is pinned (EC-5); a re-vendor triggers a review.

**Out of scope here** (handled in PRD-04, PRD-05): the per-list virtualisation, the per-row memoisation, the rendering pipeline that turns store state into pixels.

**Reversibility.** High. The fold is a single function; if we ever need to switch to delta-based fold, the rest of the app is unaffected.
