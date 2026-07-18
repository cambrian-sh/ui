# Cambrian UI — CONTEXT.md (Source of Truth)

**Version:** 0.1 — aligned to kernel ADR-0047, contract version **`0057`** (kernel `0.6.9-alpha`).
**Authority for this project.** This file is the authoritative reference for the UI app's **architecture, layer responsibilities/boundaries, current status, and the integration contract with the runtime-core**. For layer-level detail read the nested files: [`src-tauri/CONTEXT.md`](src-tauri/CONTEXT.md) (Rust core / transport) and [`src/CONTEXT.md`](src/CONTEXT.md) (webview). For the product spec read [`docs/web-ui-prd.md`](docs/web-ui-prd.md); for the wire contract read [`proto/operator.proto`](proto/operator.proto); for the runtime-side rationale read the kernel repo `docs/adr/0047-operator-transport-plane.md`.

Do not assume anything about the runtime, the transport, or the domain terminology without consulting these.

---

## Implementation Status

| Area | Status |
|---|---|
| Project scaffold (Tauri 2 + React 19 + TS + Vite + Bun) | **Present** |
| **Rust core: gRPC transport client, feed-fold state of record, auth, recovery, Tauri bridge** | **IMPLEMENTED** — `tonic` `OperatorConsole` client, login+keychain, the feed loop (snapshot→cursor→resync→reconnect), 9 `op_*` commands, `kernel://state`/`kernel://token` events. `cargo check`+`clippy` clean. State structs now aligned with webview `types.ts` (Vec-based sessions/plans, `ConnectionState` struct, subsystem cache fields). See `src-tauri/CONTEXT.md`. |
| Webview: projection store, screens, design system | **IMPLEMENTED** — Zustand projection (hydrate/fold/reset), design system (tokens, primitives, Cambrian components), chat surface, plan work surface, memory explorer, nav rail, status strip, command palette. See `src/CONTEXT.md`. |
| Console screens (PRD-06) — Sessions, Plans in Flight, Agents, Tools & Skills, MCP, Scope, Watch, Lifecycle, Verifier, Cost | **SHIPPED** — Sessions (UI-IMPL-19), Plans in Flight (UI-IMPL-20), data model extension (UI-IMPL-21a), Agents (UI-IMPL-22), Tools & Skills (UI-IMPL-22b), MCP (UI-IMPL-23), Scope (UI-IMPL-24), Watch (UI-IMPL-25), Lifecycle (UI-IMPL-26), Verifier (UI-IMPL-27), Cost & Energy (UI-IMPL-28). All P2 console screens complete. |
| Memory explorer (PRD-05) — list, detail, compare, blast-radius | **Vertical-slice minimal** — list + filter + open + tag with blast-radius. Compare/graph/bulk (P3 UI-IMPL-31…35) deferred. |
| Audit & export (PRD-07) — list, deep-link, CSV/JSON export | **Vertical-slice minimal** — read-only audit tail. Mutations + export (P4 UI-IMPL-36…37) deferred. |
| Configuration (PRD-07) — settings, first-run, profiles | **Vertical-slice minimal** — connection settings (Settings → Connection). Runtime/UI/Profiles (P5 UI-IMPL-37) deferred. |
| Vendored contract `proto/operator.proto` | **Present, pinned to `0057`** (re-vendored 2026-07-17: adds the memory read/ingest surface incl. the binary/docling upload lane) |
| Runtime-core Operator Transport Plane (the thing we integrate against) | **Implemented & serving** (kernel ADR-0047; see §6) |

The **Rust core (`src-tauri`) and the webview (`src`) are both built**. The console subsystem and memory explorer are partially shipped (vertical slice + P2 console screens complete). The build order is the parent UX PRD §13 (vertical slice → P1 subsystems read → P2 subsystems read+mutate → P3 memory explorer → P4 audit & export → P5 configuration → P6 polish & a11y).

---

## 1. Core Philosophy

The Cambrian UI is a **desktop mission-control** for a running Cambrian runtime ("runtime-core" / Substrate / kernel). One application, two surfaces — a **chat surface** (talk to a session, watch its plan form and execute, steer it) and an **operator console** (inspect/steer agents, tools, skills, MCP, memory, scope, lifecycle, verifier, cost, audit) — sharing one realtime data plane, one design system, one audit story. It replaces the deleted TUI's *role*.

Three principles govern every decision:

1. **Controller, not back door.** The UI mutates and reads the runtime **only** through the kernel's documented operator surface (the `OperatorConsole` gRPC service). It never bypasses the kernel, never writes to its databases, never maintains a parallel copy of kernel data.
2. **The runtime's vocabulary is the UI's vocabulary.** Cambrian's domain terms are used verbatim; the UI invents no synonyms (§7 glossary).
3. **Two-tier state: state of record vs projection.** The **Rust core** is the client-side state of record (it owns the connection and folds the feed); the **webview** is a projection/cache of it. This is the load-bearing architectural idea (§2).

---

## 2. Architecture & Layer Breakdown

The app is a **Tauri 2** desktop application with two layers across two hops:

```
Go kernel ──gRPC/HTTP2 (tonic, ONE conn)──> Rust core (src-tauri) ──Tauri IPC──> Webview (src)
 [runtime-core]      [the transport client]      [state of record]        [a projection/cache]
```

The webview **never** speaks gRPC and **never** opens a socket to the kernel. All kernel I/O is in the Rust core. This dissolves the browser-era transport problem entirely: **no gRPC-Web, no Envoy, no protobuf.js, no browser sockets, no multi-tab/leader-election** — those exist only when a browser speaks gRPC, which here it does not.

### `src-tauri/` — the Rust core (transport + state of record + bridge)

The integration engine. Responsibilities: hold the native `tonic` gRPC client to `OperatorConsole`; authenticate (Login → token in OS keychain → bearer interceptor); drain `StreamEvents` and **fold the absolute-state feed into typed state** (the state of record); run the **recovery state machine** (cursor resume → `ResyncRequired` → `Snapshot` → resubscribe); send **idempotent, audited commands** (command_id + reason, retry queue); reconnect with backoff+jitter; and expose a **Tauri command/event surface** to the webview (typed projections out, user intents in). **Full transport contract + recovery rules live in [`src-tauri/CONTEXT.md`](src-tauri/CONTEXT.md).**

### `src/` — the webview (projection + screens + design system)

The presentation layer. Responsibilities: a **projection store** hydrated from the core over Tauri events (a cache, not the source of truth); **screens that each trace to a PRD user story**; the **design system** (dark-mode-first, dense, keyboard-friendly, accessible by construction); and the **Tauri IPC client** (invoke command intents, subscribe to projection events). It consumes typed data; it does not know gRPC exists. **Detail in [`src/CONTEXT.md`](src/CONTEXT.md).**

### `proto/` — the vendored contract

`operator.proto`, **vendored and pinned** to contract `0057`, header-stamped DO-NOT-EDIT. The single source of the wire types. Re-vendor from the kernel repo `api/proto/operator.proto` when the contract bumps.

### `docs/` — the product spec

`web-ui-prd.md` — normative: 53 user stories, 24 use cases, the V1 demo path, out-of-scope. Every screen must trace to a story.

---

## 3. The integration boundary (summary)

One gRPC service, `cambrian.OperatorConsole` (distinct from the kernel's agent-facing `Orchestrator`/`AgentService` — never call those). It offers: **`Login`**; reads/stream **`StreamEvents`** / **`Snapshot`** / **`QueryAudit`** (any role); and **commands** `CreateSession`/`SendMessage`/`InjectCorrection`/`PauseSession`/`ResumeSession`/`ResolveHITL`/`SetToolGrant`/`TagMemory`/`SetScope`/`RegisterSkill`/`RegisterMCP`/`TriggerConsolidation` (Operator-only, idempotent, audited). The feed delivers a globally-sequenced stream of absolute-state `OperatorEvent`s. **The full RPC + event catalog, sequencing, recovery, auth, and idempotency rules are owned by [`src-tauri/CONTEXT.md`](src-tauri/CONTEXT.md)** (the Rust core implements them).

---

## 4. Frozen architectural decisions

| Decision | Choice & consequence |
|---|---|
| Desktop shell | **Tauri 2** — Rust core + webview, OS keychain, in-process IPC. |
| Webview | **React 19 + TypeScript + Vite**, **Bun** package manager. |
| Transport | **gRPC + Protocol Buffers** over HTTP/2, **native `tonic` in the Rust core**. NOT gRPC-Web. |
| State | **Rust core = state of record; webview = projection.** Webview reload = cheap local resync from the still-connected core, not a kernel reconnect. |
| Contract | One vendored, **pinned** `operator.proto`; runtime skew detected via the `Snapshot` capability/version handshake. |
| Realtime | The feed is the only source of live state; **no "click to refresh" anywhere**. |

---

## 5. Hard Rules

1. **Only `OperatorConsole`.** Never call agent-facing RPCs; never bypass the kernel; never invent a parallel store.
2. **Kernel vocabulary, verbatim** (§7).
3. **gRPC lives in the Rust core only.** The webview consumes Tauri-bridged projections.
4. **Mutations are loud + audited** (every command carries `command_id` + `reason`); **reads are quiet**.
5. **Realtime by default; honest about the connection** (live / reconnecting / down + what is stale is a first-class state).
6. **Every screen traces to a PRD user story.**
7. After changing how the UI integrates with the runtime, **update this file and the relevant layer `CONTEXT.md`**.

---

## 6. What the runtime serves today

The runtime's Operator Transport Plane (kernel ADR-0047) is **fully implemented and registered** — all `OperatorConsole` RPCs respond. Live on the feed: auction, agent-ready, session lifecycle, memory-pressure, daemon-crash, watch-triggered, **memory-written, HITL-raised, verifier-round, LLM-health, plan-state, audit**, and best-effort **token** chunks. Commands have real effects; the audit log is durable (Postgres). **Deferred kernel-side (design around these):** always-on PauseController on the operator execute path (destructive-step HITL pause is opt-in; tool-approval HITL via `ResolveHITL` works), the LLM inject-planner (inject currently replaces the forward plan with the routed instruction), precise token `step_index` (currently `0`). Kernel detail: `CURRENT_CODEBASE_STATE.md` §0047.

---

## 7. Glossary

**Cambrian domain terms (use verbatim).** Substrate, Handoff, ExecutionPlan, Step, Planner, Gatekeeper, Auctioneer, Verifier, Agent (Cognitive/Model/Daemon), TrustScore, GatekeeperScore, Session, Checkpoint, EpisodicMemory, LTM, MnemonicFact, MnemonicScene, ProceduralTemplate, NegativeEdge, Scope, EffectiveScope, DefaultWriteTags, k-anonymity, Tool/Skill/MCP, Tier-1/Tier-2 disclosure, HITL, PauseController, EventBus, Consolidation, Lifecycle, LLM Provider, Circuit Breaker. Full definitions: kernel `CONTEXT.md §7`, PRD §10.

**UI-app terms.**
- **Runtime-core / kernel / Substrate** — the Go runtime this app controls.
- **Operator Transport Plane** — the kernel's `OperatorConsole` gRPC surface (ADR-0047) that this app is the client of.
- **Rust core** — the `src-tauri` Tauri backend; the gRPC client and **state of record**.
- **Webview** — the `src` React app; a **projection/cache** of the core's state.
- **The feed** — the `StreamEvents` stream of sequenced, absolute-state `OperatorEvent`s.
- **seq / cursor** — the global monotonic sequence number; the resume position.
- **Resync** — the `ResyncRequired` → `Snapshot` → resubscribe recovery move.
- **Projection** — typed state the core pushes to the webview over Tauri events.
- **Plans in Flight** — the live set of running plans, folded from `plan_state` events.
- **Capability handshake** — the `kernel_version`/`contract_version`/`capabilities` in `Snapshot` that drive surface visibility + skew warnings.
