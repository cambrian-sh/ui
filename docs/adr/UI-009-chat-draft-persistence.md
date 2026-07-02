# UI-009 — Chat Draft Persistence (localStorage)

**Date:** 2026-06-22 (revised v0.2; original v0.1 proposed tauri-plugin-store and was superseded)
**Status:** Accepted

## Context

PRD-03 ([../prd/03-chat-surface.md](../prd/03-chat-surface.md)) §11 requires that the chat input and the inject input both **survive a refresh, a restart, and a `RESYNC_REQUIRED`** (Story 53). Drafts are local to the operator's device — not audited, not synced, not a kernel-side concern.

EC-1 (PRD-01 §2.5) locks the deployment shape: **Tauri 2 desktop shell**. The webview is packaged inside a Tauri application; the Tauri webview is a Chromium-based browser; `localStorage` is available natively. The org-wide convention is that **all our web-based frontends use Tailwind + shadcn/ui** — the same draft UX should be portable to any of them (Tauri, Electron, plain browser) without a Tauri-specific Rust plugin.

### What must be persisted

- The chat input's current text per session.
- The inject input's current text per plan.
- The last selected plan in the inject input's selector.

### Constraints

1. **Survive refresh** (the Tauri webview reloads; the host process stays).
2. **Survive app restart** (the Tauri process exits; the host filesystem persists).
3. **Survive `RESYNC_REQUIRED`** (the projection store is wiped; the draft is unrelated to the projection).
4. **No kernel involvement.** Drafts are a UI concern. The kernel's session-event log is the record of *sent* messages, not of in-progress drafts.
5. **Per operator + per device.** A draft is for the operator's current device; it is not synced across machines.
6. **Bounded size.** A draft is at most a few KB. The persistence layer must not become a vector for unbounded growth.
7. **Crash-safe enough.** If the app crashes mid-typing, the draft up to the last debounced save is recoverable. Atomic-write-level crash safety is not required.
8. **Cross-frontend portability.** The persistence mechanism must be a standard browser/web API so the same draft UX works in any Tauri / Electron / browser frontend, not a Tauri-specific plugin.

### Options

| Option | Bundle | Persist across refresh | Persist across restart | Crash-safe | Tauri fit | Notes |
|:-------|:-------|:----------------------:|:----------------------:|:----------:|:---------:|:------|
| **`localStorage`** (Recommended) | 0 KB | ✅ | ✅ | ⚠️ (synchronous; not atomic — debounce mitigates) | ✅ (webview API) | **Recommended.** Standard browser API, 5–10 MB per origin, synchronous, safe to call from any handler. Works in Tauri, Electron, plain browser — cross-frontend portable. |
| `sessionStorage` | 0 KB | ✅ | ❌ | ❌ | ✅ | Per-tab. Lost on app restart. Fails constraint 2. |
| IndexedDB | 0 KB | ✅ | ✅ | ✅ (transactional) | ✅ (webview API) | Async. The right shape for structured data, overkill for a single text field per session. |
| `tauri-plugin-store` (original v0.1) | ~50 KB (Rust) | ✅ | ✅ | ✅ (atomic file writes) | ✅ (Tauri 2 plugin) | Tauri-specific. The original v0.1 recommendation; superseded for cross-frontend portability. |
| Tauri `fs` plugin | ~30 KB (Rust) | ✅ | ✅ | ⚠️ (manual atomic-write) | ✅ | Most flexible; most ceremony; Tauri-specific. |
| Rust-side `State` in the existing Tauri core | 0 KB (already in core) | ✅ | ⚠️ (in-memory only) | ⚠️ | ✅ (but new state to add) | The Rust core has a `StateOfRecord` for kernel state. Drafts are not kernel state; bolting them in violates the EC-4 boundary. |

## Decision

**Recommended:** **`localStorage`**.

Rationale:

1. **Zero new dependencies.** No Rust plugin, no JS library, no IPC. Browser API.
2. **Cross-frontend portability.** `localStorage` is a standard browser API; any frontend that uses a browser-like environment (Tauri, Electron, plain browser) can use the same persistence layer. `tauri-plugin-store` is Tauri-specific; if we ever need draft recovery in a non-Tauri frontend, we'd duplicate the code or carry the plugin's surface across.
3. **Synchronous and safe.** `localStorage.setItem` is synchronous; safe to call from any handler. The webview is single-threaded; the synchronous write doesn't block the UI.
4. **Sufficient for the use case.** Drafts are a few KB per session; `localStorage`'s 5–10 MB per origin is more than enough.
5. **Per-session + per-plan keys.** The wrapper (PRD-03 §11) uses keys like `draft:chat:$sessionId` and `draft:inject:$planId`. The data shape is `{ value, updatedAt }`; the wrapper debounces writes (200 ms) and flushes on `blur` and `beforeunload`.
6. **Per-instance scoping.** Multiple instances of the same Tauri shell (PRD-07 §3.1) share the same `localStorage`. The keys include the instance id (`draft:$instanceId:chat:$sessionId`) to avoid cross-instance bleed.

The deciding factor against `tauri-plugin-store` was the cross-frontend portability constraint (constraint 8). The deciding factor against IndexedDB was the ceremony for a single text field per session. The crash-safety gap (constraint 7) is mitigated by the 200 ms debounce + `blur` / `beforeunload` flush; we accept "the last 200 ms of typing may be lost on a hard crash" as a reasonable trade-off for portability.

## Consequences

**Positive.**

- Drafts survive refresh, restart, and `RESYNC_REQUIRED` (constraints 1, 2, 3).
- Per-session, per-plan keys. Cleanup is the wrapper's responsibility (TTL on entries, eviction on session completion).
- No new dependencies. Zero bundle cost.
- Cross-frontend portability: the same draft UX code works in any Tauri / Electron / browser frontend.
- The wrapper is testable: tests use a `Map`-backed mock for `localStorage`.
- Per-instance scoping prevents cross-instance bleed.

**Negative / risks.**

- **Crash-safety is weaker than `tauri-plugin-store`.** `localStorage` writes are synchronous but not atomic. A hard crash between write and the next event can lose the last keystrokes. Mitigation: the wrapper debounces writes (200 ms) and flushes on `blur` and `beforeunload`. The 200 ms window is the accepted data-loss ceiling.
- **`localStorage` is per-origin.** Multiple Tauri instances share the same `localStorage`. The keys include the instance id (see §6 in PRD-03) to scope the drafts.
- **The store grows over time.** A cleanup policy is needed (older-than-N-days drafts are evicted). The policy is a follow-on; this ADR ships the persistence.
- **A multi-tab / multi-window Tauri shell would share the store.** The operator's experience is one window; multi-window is a follow-on.
- **The kernel's session event log is the record of *sent* messages, not of in-progress drafts.** This is by design (drafts are local), but worth being explicit.

**Out of scope here** (handled in PRD-07): the audit of the chat input (no audit on chat messages per PRD-03 §9.1).

**Reversibility.** High. Swapping `localStorage` for `tauri-plugin-store` later is mechanical (the wrapper hides the implementation). The keys and the data shape stay.
