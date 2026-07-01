# Cambrian UI — Development Rules (CLAUDE.md)

## Session Bootstrap (REQUIRED)

Every new session MUST start by reading, in full:
1. **`CONTEXT.md`** (this directory) — the project source of truth: architecture, layer responsibilities, status, decisions, glossary.
2. **`docs/web-ui-prd.md`** — the product spec (what to build: 53 user stories, 24 use cases, the V1 demo path, out of scope).
3. **`proto/operator.proto`** — the vendored, pinned gRPC contract. The *only* API to the runtime.

Then read the **layer file for the layer you are working in**, and its `CLAUDE.md`:
- Working in the **Rust core / transport / state** → `src-tauri/CONTEXT.md` + `src-tauri/CLAUDE.md`.
- Working in the **webview / UI / projection** → `src/CONTEXT.md` + `src/CLAUDE.md`.

Do not assume anything about the runtime, the transport, or the domain terminology without consulting these. For runtime-side rationale, the kernel repo's `docs/adr/0047-operator-transport-plane.md` is the authority (this UI consumes ADR-0047's Operator Transport Plane).

## The architecture in one paragraph

This is a **Tauri 2** desktop app: a **Rust core** + a **React 19 / TypeScript** webview. The Rust core holds a **native `tonic` gRPC client** (one HTTP/2 connection) to the Cambrian runtime-core's **`OperatorConsole`** service, and bridges to the webview over **Tauri IPC**. Two hops: `kernel ──gRPC──> Rust core ──Tauri IPC──> webview`. The webview NEVER speaks gRPC and NEVER opens a socket to the kernel. The Rust core is the **client-side state of record**; the webview store is a **projection/cache**.

## Non-negotiable rules

- **Only `OperatorConsole`.** The runtime is reachable exclusively through the `OperatorConsole` gRPC service in `proto/operator.proto`. Never call the agent-facing `Orchestrator`/`AgentService`. Never bypass the kernel (no direct DB, no parallel store). The UI is a **controller over the kernel's boundary, not a back door**.
- **gRPC lives in the Rust core only.** Put `tonic`/`prost` and all kernel I/O in `src-tauri`. The webview gets typed data via Tauri commands/events. Do NOT add gRPC-Web, Envoy, `protobuf.js`, or browser sockets — they are unnecessary and forbidden by the architecture (the kernel speaks native HTTP/2 gRPC, which the Rust core handles).
- **The vendored proto is pinned and read-only.** Do not hand-edit `proto/operator.proto`. Re-vendor from the kernel repo (`api/proto/operator.proto`) when the contract bumps, and update the pinned-version header + `CONTEXT.md`.
- **Use the kernel's vocabulary verbatim** (Substrate, ExecutionPlan, Gatekeeper, Auctioneer, TrustScore, HITL, Inject, Plans in Flight, …). Never invent synonyms. See `CONTEXT.md §10`.
- **Realtime by default.** No "click to refresh" anywhere. State updates by folding the `StreamEvents` feed. The status of the connection (live / reconnecting / down) and what is stale must always be honest and visible.

## Transport rules (implement in the Rust core)

- **Auth:** `Login(username,password) → {token, role}`; send `authorization: Bearer <token>` on every call. Store the token in the **OS keychain**. Unauthenticated ⇒ rejected. Secure-by-default: no kernel accounts ⇒ login fails (surface that state). TLS is additive on the remote hop.
- **Feed:** subscribe `StreamEvents(last_seq)`. Events carry a **global monotonic `seq`** (the cursor) and **absolute-state** payloads. Fold them **idempotently** (last-writer-wins by id) — never as increments.
- **Recovery:** on a `ResyncRequired` event (cursor aged out of the ~120s spool), call `Snapshot`, replace state, and resubscribe from `Snapshot.as_of_seq`. Re-received events after a snapshot are harmless (idempotent fold). Gaps are impossible; duplicates are fine.
- **`token` events** (`seq=0`) are **live-only, never replayed** — accumulate text live; resync it from snapshot/pull on reconnect, not by replaying chunks.
- **Reconnect** (Rust↔kernel) with backoff+jitter (`base=1s ×2 cap=30s ±10%`); after ~2–5 min surface "kernel unreachable". A webview reload is a cheap local resync from the still-connected core — not a kernel reconnect.
- **Commands:** every mutating command needs a client-generated **`command_id` (UUID)** + a **mandatory `reason`**; reuse the same `command_id` across retries (the kernel dedups → `CommandAck{deduped}`). The actor comes from the token, never the body.
- **Roles & capabilities:** Operator vs Viewer is **server-enforced** (Viewer mutations → `PermissionDenied`); reflect it by hiding mutating controls. Read `kernel_version`/`contract_version`/`capabilities[]` from `Snapshot` — **hide surfaces the kernel doesn't advertise** and **warn on contract-version skew**.

## Development rules

- **Match the existing stack:** Tauri 2, React 19 + TypeScript + Vite, **Bun** for JS deps, Cargo for the Rust core. Don't introduce a second framework or a second visual language.
- **Dark-mode-first, dense, keyboard-friendly, accessible by construction** (WCAG AA in dark mode minimum). Accessibility is not a follow-on (PRD story 46).
- **Every screen traces to a PRD user story.** A screen with no story is scope creep; a story with no screen is a gap. The PRD (`docs/web-ui-prd.md`) is normative.
- **The plan is the centre of gravity.** When a session has a running plan, the plan view is always visible; chat and console are *around* it.
- **State of record = Rust core; projection = webview.** Batch high-frequency event classes (tokens, plan ticks) at the core→webview seam (~60fps/100ms); deliver control classes (HITL, audit, errors, health) immediately and un-batched.
- After changing how the UI talks to the runtime (transport, recovery, auth, the consumed contract), **update `CONTEXT.md`** so it always reflects the current integration.

## What works today (so you can build against reality)

The runtime's Operator Transport Plane is fully implemented: all `OperatorConsole` RPCs respond; the feed carries auction / agent-ready / session-lifecycle / memory-written / HITL-raised / verifier-round / LLM-health / plan-state / audit / (best-effort) token events; commands have real effects; audit is durable. Deferred kernel-side items (design around them): always-on PauseController on the execute path, the LLM inject-planner, precise token `step_index`. See `CONTEXT.md §11`.
