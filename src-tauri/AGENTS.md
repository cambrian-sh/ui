# Rust Core (`src-tauri`) — Development Rules (CLAUDE.md)

## Bootstrap
Read, in order: project root `../CONTEXT.md`, this directory's `CONTEXT.md` (the full transport contract + recovery rules), and the vendored `../proto/operator.proto`. The product spec is `../docs/web-ui-prd.md`.

## What this layer is
The Tauri **Rust core**: the native `tonic` gRPC client to the runtime-core's `OperatorConsole`, the **client-side state of record** (folds the event feed), and the Tauri bridge to the webview. This is the **only** layer that speaks gRPC.

## Rules
- **All kernel I/O lives here.** `tonic`/`prost`/gRPC types never leave the Rust core. The webview receives only plain serde projection types over Tauri events.
- **Only `OperatorConsole`.** Never call the agent-facing `Orchestrator`/`AgentService`; never bypass the kernel.
- **Generate from the pinned proto.** Use `tonic-build` in `build.rs` against `../proto/operator.proto`. Do not hand-write message types or edit the vendored proto. When the contract bumps, re-vendor + regenerate.
- **Fold absolute-state events idempotently** (last-writer-wins by id). Never treat an event as an increment. `Snapshot.as_of_seq` is a lower bound; re-received events after a snapshot are harmless.
- **Implement the recovery state machine exactly** (cursor resume → `ResyncRequired` → `Snapshot` → resubscribe from `as_of_seq`). `token` events (`seq=0`) are live-only — never replay them.
- **Reconnect** with backoff+jitter (`base=1s ×2 cap=30s ±10%`); after ~2–5 min emit a first-class "kernel unreachable" state. Refresh the token before reconnecting if expired.
- **Auth on every call:** `Bearer <token>` from the OS keychain; TLS on the remote hop (additive). Secure-by-default (no kernel accounts ⇒ login fails — surface it).
- **Commands:** generate one `command_id` (UUID) per user action and reuse it across retries (the kernel dedups); `reason` is mandatory; the `actor` comes from the token, never the body. Keep an outbound ACK/retry queue across reconnects.
- **Bridge discipline:** batch high-frequency event classes (`token`, `plan_state`) at the core→webview seam; deliver control classes (`hitl_raised`, `audit`, errors, `llm_health`) immediately.
- **Add dependencies deliberately:** `tonic`, `prost`, `tokio`, `tonic-build`, a keychain crate. Keep the dependency set minimal and justified.
- After changing transport/recovery/auth/state behavior, **update this directory's `CONTEXT.md`** (and `../CONTEXT.md` if a project-level fact changed).

## Honesty
Never fake a connection or silently swallow a kernel error. Surface live / reconnecting / down and the kernel's actual error to the webview as a first-class state. A degraded connection is a state, not a hidden failure.
