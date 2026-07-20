# Rust Core (`src-tauri`) — CONTEXT.md

**Scope:** the Tauri **Rust core** — the transport client, the client-side **state of record**, and the bridge to the webview. This file owns the **full transport contract and recovery rules**. Read the project root `../CONTEXT.md` first; the wire types are in `../proto/operator.proto`.

The Rust core is the **only** thing that talks gRPC to the runtime-core. The webview never does.

---

## Status

**IMPLEMENTED** (transport layer). `cargo check` + `cargo clippy` clean. Deps added to `Cargo.toml`: `tonic` (+tls), `prost`, `prost-types`, `tokio` (full), `tokio-stream`, `uuid`, `keyring`, `thiserror`, `tracing`; build-dep `tonic-build`. Connects to the kernel's gRPC TCP port (`http://host:<server.port>` — the same listener the Operator Transport Plane is registered on).

---

## As-built module map

| File | Responsibility |
|---|---|
| `build.rs` | `tonic-build` codegen — generates the `OperatorConsole` **client** (no server stubs) from `../proto/operator.proto`; `rerun-if-changed` on the proto. |
| `src/pb.rs` | `tonic::include_proto!("cambrian")` + `PINNED_CONTRACT_VERSION = "0057"`. The generated `tonic`/`prost` types live here; **nothing outside the core references them**. |
| `src/state.rs` | The **state of record**: `StateOfRecord` (connection, role, handshake, cursor, plans-by-id, sessions, audit tail, pending HITL) + an **idempotent absolute-state `fold`** (last-writer-wins by id; `token` events return `false` and are excluded) + `apply_snapshot` + `reset_live`. The fold also populates **subsystem caches**: `AgentReadyOp` → `agents`, `WatchTriggeredOp` → `watch_configs` (idempotent by id). `tools`/`skills`/`watch_configs` are additionally upserted from the `List*` RPCs. Serde-serializable (it IS the projection). |
| `src/transport.rs` | The gRPC client + **`AuthInterceptor`** (bearer token), `login` (+ OS-keychain persistence), the **command senders**, and the **feed loop** (`run_feed`/`drain`/`backoff`): snapshot-seed → subscribe-from-cursor → fold+emit → `Resync` re-snapshot → reconnect with exponential backoff → `Unreachable`. |
| `src/lib.rs` | The **Tauri bridge**: managed `Transport` state + the `op_*` commands + `run()`. |

`internal` rule (enforced): all gRPC/`tonic`/`prost` types stay in `pb.rs`/`transport.rs`; the webview receives only plain serde projection types (`StateOfRecord`, token chunks) over Tauri events.

---

## The Tauri bridge surface (what the webview calls / listens to)

**Commands** (`invoke('op_*', { … })`), all async, errors are `String`:

| Command | Args | Returns |
|---|---|---|
| `op_login` | `endpoint, username, password` | `role` (`"operator"`/`"viewer"`) — also starts the feed loop |
| `op_get_state` | — | `StateOfRecord` (for hydration on mount) |
| `op_create_session` | `goal, reason` | `session_id` |
| `op_send_message` | `session_id, text, reason` | `deduped: bool` |
| `op_inject_correction` | `session_id, instruction, reason` | `deduped: bool` |
| `op_pause_session` / `op_resume_session` | `session_id, reason` | `deduped: bool` |
| `op_resolve_hitl` | `intervention_id, approve, reason` | `deduped: bool` |
| `op_set_tool_grant` | `agent_id, tool_name, granted, reason` | `deduped: bool` |
| `op_ingest_memory` | `text, content, filename, content_type, context, tags, importance, source, session_id, reason` | `(doc_id, deduped)` |
| `op_query_memory` | `query, top_k, source, session, min_importance` | `MemoryHit[]` |
| `op_list_tools` | — | `ToolSummary[]` — also **upserts** `tools` into `StateOfRecord` and re-emits `kernel://state` |
| `op_list_skills` | — | `SkillSummary[]` — also **upserts** `skills` into `StateOfRecord` and re-emits `kernel://state` |
| `op_list_watches` | — | `WatchConfigSummary[]` — also **upserts** `watch_configs` into `StateOfRecord` and re-emits `kernel://state` |

> `command_id` (UUID) is generated **inside the core** per call; `reason` is mandatory (the kernel rejects empty). The webview never sends a token or actor — auth is the core's interceptor.

**Memory (contract `0057`, capability `memory-ingest-binary`).** `op_ingest_memory` has two mutually exclusive body lanes: `text` (markdown/plain) or `content` (raw file bytes) + `filename`. The kernel rejects both-or-neither and rejects `content` without a `filename` — the extension is what routes the chunker and what opens the docling_agent's binary-parse gate. Bytes cross the IPC bridge as a JS array, NOT a path: the kernel may not be on this machine, so a path it cannot read would be a lie. `context` is folded into the document body kernel-side (metadata is never chunked, so a note stored beside the document could never affect retrieval). `op_query_memory` returns ranked **evidence, not an answer** — `MemoryHit.text` is the quotable chunk and `section_path` its structural breadcrumb; `summary` is a truncated preview and must never be quoted as a source. Gate the file-upload affordance on the `memory-ingest-binary` capability: an older kernel silently ingests text-only.

**Events** (`listen('kernel://*')`):
- `kernel://state` → the full `StateOfRecord` projection, emitted on connection change, snapshot, and each structural feed event.
- `kernel://token` → `{ session_id, step_index, text }`, the live-only token lane (never part of `StateOfRecord`).

**Pending (follow-ups, not blocking):** outbound ACK/retry queue for commands mid-reconnect; backoff jitter (single client — low value); TLS endpoint selection; token-restore-from-keychain on startup; per-class batching at the bridge (currently emit-per-structural-event, which is low-frequency); richer projections for auction/verifier/llm-health as their screens land.

---

## The contract: `OperatorConsole`

One gRPC service, `cambrian.OperatorConsole` (NOT the agent-facing `Orchestrator`/`AgentService`). Generated from the pinned `../proto/operator.proto`.

### RPCs

- **`Login(username, password) → {token, role}`** — the only unauthenticated RPC.
- **`StreamEvents(SubscribeRequest{last_seq}) → stream OperatorEvent`** — the realtime feed.
- **`Snapshot() → SnapshotResponse`** — bounded live state + the capability/version handshake.
- **`QueryAudit(filter) → entries`** — paged audit log (any role).
- **Commands** (Operator-only, idempotent, audited) → `CommandAck{command_id, deduped}` (except `CreateSession` → `{session_id}`): `CreateSession`, `SendMessage`, `InjectCorrection`, `PauseSession`, `ResumeSession`, `ResolveHITL`, `SetToolGrant`, `TagMemory`, `SetScope`, `RegisterSkill`, `RegisterMCP`, `TriggerConsolidation`.

### `OperatorEvent` (the feed envelope)

`{ seq: u64, ts, session_id, payload: oneof }`. `seq` is a **global monotonic** cursor across all classes/sessions. Payloads are **absolute-state** (the new value, not increments). Classes: `resync` (control), `auction`, `agent_ready`, `session_dormant`, `session_completed`, `memory_pressure`, `daemon_crashed` (premium), `watch_triggered` (premium), `memory_written`, `hitl_raised`, `verifier_round`, `llm_health`, `plan_state`, `audit`, `token` (live-only).

---

## Recovery state machine (implement exactly)

The kernel retains a bounded in-memory spool (~**120 s**). Two moves:

1. **Subscribe with the cursor.** `StreamEvents(last_seq)` where `last_seq` = highest `seq` seen (`0` = start of the retained window). In-window → the kernel replays the gap then continues live.
2. **On a `resync` (`ResyncRequired`) event** — your cursor aged out: call `Snapshot`, **replace** the state of record from it, then **resubscribe from `Snapshot.as_of_seq`**.

### The idempotent-fold contract (correctness-critical)

- `Snapshot.as_of_seq` is a **lower bound**. Resume from `as_of_seq + 1`; you **may** re-receive events the snapshot already reflected — **harmless**, because the fold is idempotent (absolute-state, last-writer-wins by id). **Gaps are impossible; duplicates are fine.** Never treat an event as an increment.
- **`token` events have `seq = 0`, are live-only, and are NEVER replayed.** Append their text to the active step's live buffer; on reconnect, do not replay chunks — the accumulated text is reconstructed from the snapshot / a content pull.

### Reconnect (Rust core ↔ kernel)

Backoff + jitter on the one connection: `base=1s, factor=2, cap=30s, jitter=±10%`; cap attempts ~2–5 min, then emit a first-class **"kernel unreachable"** projection. Before reconnecting, refresh the token if expired. The webview↔core hop is in-process — not given network-grade resilience; a webview reload re-hydrates from the still-live core.

---

## Auth

- `Login` once → token bound to `{principal, role}`. Send `authorization: Bearer <token>` on **every** call (interceptor), including `StreamEvents` open. Missing/invalid ⇒ `Unauthenticated`.
- Store the token in the **OS keychain**, never passed to the webview in the clear beyond what a session needs.
- **Secure-by-default:** the kernel only has accounts if seeded (env on the kernel side). No creds ⇒ login fails — surface it, don't retry blindly.
- **TLS** is required on the remote kernel hop (additive to the credential — TLS authenticates the server, not the client). Loopback dev may be plaintext.

## Commands

- Generate a **`command_id` (UUID)** per user action; **reuse it across retries** (the kernel dedups → `CommandAck{deduped:true}`, no double mutation). Hold un-ACKed commands in the outbound queue across a reconnect and replay them.
- **`reason` is mandatory** on every mutation (empty ⇒ `InvalidArgument`). The `actor` is derived from the token server-side — never send it in the body.
- Semantics to honor: `InjectCorrection` needs a **live execution** (`FailedPrecondition` otherwise); `SendMessage` returns immediately (watch `plan_state`/`token`); `ResolveHITL` keys on the `intervention_id` from a `hitl_raised` event; `TagMemory` add=widen / remove=narrow (vocabulary-validated server-side).

## Capability + version handshake

`Snapshot` carries `kernel_version`, `contract_version`, `capabilities[]`. Compare `contract_version` to the pinned `0057`. Emit a projection that lets the webview **hide unsupported surfaces** (e.g. watch/daemon when absent) and **warn on skew**. A newer kernel serves your pinned calls; pinned-ahead calls return `Unimplemented` — degrade gracefully.

## The Tauri bridge

- Expose user intents as `#[tauri::command]`s that call the gRPC client and return/ack.
- Emit **projection events** (typed, serde) to the webview as the state of record changes. **Batch** high-frequency classes (`token`, `plan_state` ticks) at ~60fps / 100ms; deliver **control** classes (`hitl_raised`, `audit`, errors, `llm_health`) immediately and un-batched.
- The webview holds no kernel state the core didn't give it; a webview reload re-requests the current projection.
