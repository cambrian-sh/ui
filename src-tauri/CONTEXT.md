# CONTEXT.md — Rust Core (`src-tauri`)

The Tauri **Rust core** — the transport client, the client-side **state of
record**, and the bridge to the webview. The **only** thing that talks gRPC
to the runtime-core. The webview never does.

Read `../CONTEXT.md` for the project overview. Wire types are in
`../proto/operator.proto`. For per-ADR status see `cambrian-knowledge/adrs/`.

---

## Module Map

| File | Responsibility |
|---|---|
| `build.rs` | `tonic-build` codegen — generates `OperatorConsole` client from `../proto/operator.proto`. |
| `src/pb.rs` | `tonic::include_proto!("cambrian")` + `PINNED_CONTRACT_VERSION` (currently `0085`) + plugin skew table. |
| `src/links.rs` | Identity plane review lane (contract 0098): candidates, confirm, retract. |
| `src/state.rs` | `StateOfRecord` — idempotent absolute-state fold (last-writer-wins by id). |
| `src/transport.rs` | gRPC client + `AuthInterceptor` (bearer), login, feed loop (`run_feed`/`drain`/`backoff`). |
| `src/lib.rs` | Tauri bridge: managed `Transport` state + `op_*` commands + `run()`. |

**Internal rule**: all `tonic`/`prost` types stay in `pb.rs`/`transport.rs`.
The webview receives only plain serde types over Tauri events.

---

## Recovery State Machine (implement exactly)

The kernel retains a bounded in-memory spool (~120 s). Two moves:

1. **Subscribe with cursor.** `StreamEvents(last_seq)` — in-window replays
   the gap then continues live.
2. **On `ResyncRequired`** — cursor aged out: call `Snapshot`, replace state,
   resubscribe from `Snapshot.as_of_seq`.

**Idempotent-fold contract**: `Snapshot.as_of_seq` is a lower bound; duplicates
are harmless (absolute-state). Gaps are impossible. `token` events have `seq=0`,
are live-only, never replayed.

**Reconnect**: backoff (base=1s, factor=2, cap=30s, jitter=±10%); after ~2-5 min
emit "kernel unreachable". `op_disconnect` sets a stop flag + wakes the loop.

---

## Auth

- `Login` once → token bound to `{principal, role}`. Bearer on every call.
- Token stored in **OS keychain**, never passed to webview in the clear.
- Endpoint normalization: bare localhost → `http://`, bare domain → `https://` + TLS.
- `command_id` (UUID) generated per action; reuse across retries (kernel dedups).
- `reason` mandatory on every mutation (empty → `InvalidArgument`).

---

## The Operator Plane (two services, one connection)

1. **`cambrian.OperatorConsole`** — pinned OSS contract, version-handshaked.
2. **Premium planes** (AccessPolicyAdmin, TelegramAdmin,
   IngressStudioAdmin, SubstrateLane, Telemetry) — same channel + bearer token.
   No separate version handshake; gated by capability strings.

Neither is the agent-facing `Orchestrator`/`AgentService`. The core never
carries an `x-agent-id` principal.
