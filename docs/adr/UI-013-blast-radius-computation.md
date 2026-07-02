# UI-013 — Blast-Radius Computation Seam

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-05 ([../prd/05-memory-explorer.md](../prd/05-memory-explorer.md)) §7 requires a **blast-radius preview panel** that appears above the confirm-with-consequence bar in any mutating action form (tag a memory, supersede, delete, scope change, write-tag change, tool-grant change — PRD-07 §11 reuses the same panel for the Settings surface). The panel shows: which agents' `EffectiveScope` is now widened or narrowed, and which `EffectiveForCaller` results would change (kernel ADR-0034 / 0035).

The blast-radius semantics are kernel-side: the kernel owns the `EffectiveScope` (the CNF intersection of caller and agent scope tags), the `DefaultWriteTags` classification, the `CallerScope` re-derivation (kernel ADR-0034 Phase 2 + 0035), and the k-anonymity floor (kernel ADR-0034 D11). The UI is a controller (product PRD ID-3 + ID-9); it does not own scope decisions.

### The question

**Where does the computation live?** Two options:

1. **Kernel-driven via gRPC.** The webview calls a Tauri command (e.g. `op_blast_radius_preview(mutation)`); the kernel computes and returns the affected agents / plans. The webview renders.
2. **UI-side using the kernel's scope data.** The webview receives the agents' current `EffectiveScope` + `DefaultWriteTags` + the scope vocabulary + the documents' scope tags, and computes the impact locally.

### Constraints

1. **The kernel is the source of truth for scope** (product PRD ID-3 + ID-9 + kernel ADR-0034 / 0035). The UI is a controller.
2. **The computation must be fast** — the operator types a tag and the panel updates on every keystroke (PRD-05 §12, throttled to 250 ms per PRD-01 §4.4).
3. **The computation must be consistent with the kernel's actual behaviour** — the panel must show what the kernel will do, not an approximation.
4. **The computation must be secure** — the scope data and the documents' tags are sensitive (some are kernel-derived; some are operator-classified). The webview must not be able to bypass the kernel's scope decisions.
5. **The panel must be realtime** — the operator sees the impact update as they type.

### Options

| Option | Latency | Consistency with kernel | Security | Implementation cost | Notes |
|:-------|:-------:|:----------------------:|:--------:|:-------------------:|:------|
| **Kernel-driven via gRPC** (Tauri command) | ⚠️ per-keystroke RPC (throttled) | ✅ exact | ✅ kernel is the source | ✅ trivial — call the kernel | The recommended path. |
| **UI-side computation** | ✅ instant | ⚠️ must mirror the kernel's `Allows` predicate exactly | ❌ UI has access to all scope data | ⚠️ must port the kernel's `Allows` predicate to TypeScript and keep it in sync | High maintenance; security risk; drifts from the kernel. |
| **Hybrid: cache the kernel's result, recompute on server event** | ✅ most of the time | ✅ exact when cached | ✅ | ⚠️ | The cache is the per-mutation snapshot; recomputation on every server event is a notification, not a re-derivation. Adds complexity. |

## Decision

**Recommended:** **Kernel-driven via gRPC** (Tauri command `op_blast_radius_preview`).

Rationale:

1. **The kernel is the source of truth.** Product PRD ID-3 + ID-9: the UI is a controller, not the source of scope decisions. Mirroring the kernel's `Allows` predicate in TypeScript is a maintenance burden and a security risk.
2. **The 250 ms throttle is enough.** PRD-05 §12 throttles the recompute to 250 ms. A Tauri IPC call at that cadence is well within the latency budget; the Tauri IPC is in-process (Rust → JS), not network.
3. **The kernel can pre-compute the data needed for the panel.** The kernel's `EffectiveScope` is derived; the kernel has the `CallerScope`; the kernel has the documents' tags. The kernel can answer "what would change if this tag were applied" in O(agents) + O(plans) — fast.
4. **Security.** The kernel's blast-radius response is computed against the operator's authority; the webview cannot bypass the kernel's classification (kernel ADR-0035). The UI-side computation would either need to enforce the same kernel-derived classification (duplicating the kernel logic) or be insecure.
5. **Reversibility.** The contract is the Tauri command. Swapping the implementation later is a kernel change, not a UI rewrite.

The deciding factor against UI-side computation is the maintenance + security risk. The deciding factor against the hybrid is the added complexity for marginal benefit (the per-keystroke RPC is already cheap).

## Consequences

**Positive.**

- The blast-radius panel is **exact** — what the kernel will do, not an approximation.
- The kernel's `EffectiveScope` logic is in one place; the UI is a renderer.
- The Tauri command is reusable from PRD-07's Settings surface (scope changes, write-tag changes, tool-grant changes).
- The 250 ms throttle keeps the IPC rate low.

**Negative / risks.**

- Per-keystroke IPC. The throttle (250 ms) is the rate-limiter; the kernel's computation is fast enough.
- The kernel must expose a new Tauri command (`op_blast_radius_preview`). This is a small addition to the in-repo `ui/src-tauri/src/lib.rs` (which already has 9 commands).
- If the kernel's blast-radius computation is slow, the panel feels laggy. Mitigation: cache the last computation; show the previous result while the new one is in flight.
- The mutation form's confirm-with-consequence bar must not enable until the panel has rendered the impact (PRD-05 §7: "the operator must read the blast radius before the confirm-with-consequence bar enables"). The enable signal is a separate state on the panel.

**Out of scope here** (handled in PRD-07): the Settings surface's use of the same panel for scope / write-tag / tool-grant changes.

**Reversibility.** High. The Tauri command is the contract. Swapping the implementation is a kernel change.
