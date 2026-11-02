# CONTEXT.md — Cambrian UI

A **Tauri 2 + React 19 + TypeScript** desktop app. Three layers:

1. **Rust core** (`src-tauri/`) — the ONLY gRPC speaker; owns the transport,
   state of record, auth, and recovery. See `src-tauri/CONTEXT.md`.
2. **Webview** (`src/`) — a projection/cache of the Rust core's state; never
   speaks gRPC. See `src/CONTEXT.md`.
3. **Proto** (`proto/`) — vendored from `cambrian-core/api/proto/operator.proto`.

For agent rules see `AGENTS.md`. For per-ADR status see `cambrian-knowledge/adrs/`.

---

## Knowledge & work tracking

This file is the *current shape* of the operator UI. It is not where decisions or work live:

- **Why it is this shape** — ADRs and decisions in `../cambrian-knowledge/`. Query the
  graph (`search_graph`, `query_graph`) rather than citing from memory; check an ADR's
  freshness before building on it.
- **What is being done, and what is broken** — tickets: `list_tickets` (`repo: "ui"`), or the
  knowledge-board Tickets view. Every change is ticketed, claimed, and closed with a
  resolution — the protocol is root [`AGENTS.md`](../AGENTS.md) §0.
- **What has been measured** — benchmark runs in `../cambrian-knowledge/benchmarks/`
  (`list_benchmarks` by `tag`/`adr`, or the knowledge-board Benchmarks page). Every benchmark
  run is recorded there, with a verdict — the procedure is root [`AGENTS.md`](../AGENTS.md) §0.5.
- **Every gap listed in this file should have a ticket.** Put its id next to the gap
  (`— T-20261031-…`); when the ticket closes, update or remove the gap here in the same change.

## Build & Run

```bash
bun install                  # webview deps
bun run dev                  # Vite dev server (webview only)
bun run build                # tsc + vite production build
bun run test                 # vitest (830+ tests)
cargo check                  # Rust core type-check
cargo tauri dev              # full Tauri dev (Rust + webview)
```

---

## Architecture

- **Contract pinned to `0099`** (`src-tauri/src/pb.rs` `PINNED_CONTRACT_VERSION`, history
  there). The Rust core handshakes and shows a skew banner on mismatch. 0099 added `Logout`,
  the ADR-0134 event-time fields on memory ingest/query/hits and the ADR-0101 D8 file facts
  on config-write outcomes. The console uses all three
  (T-20261101-ui-for-contract-0099-logout-config-override):
  - **Sign out** (`op_logout` → `Logout`, then the same local teardown as `op_disconnect`;
    `src/lib/signOut.ts` also drops webview caches and chat/discovery pointers). Shown in the
    header and Settings › Connection only when the kernel advertises `logout`; a token the
    kernel did not revoke (older kernel, unreachable) is said so on the login screen.
  - **D8 file facts**: `ConfigFileFacts` (settings/ConfigFileFacts.tsx) under every config
    write ack (generator, role assignment, MCP server) — "written to <file>", or a warning
    "stored; overrides <file> (file value: X)" with **Revert to file** (`op_delete_config` →
    `DeleteConfig`). Dispatch & retrieval lists every `value_source == "store"` key with the
    same revert. Gap: `GetConfigSchema` does not say which file a stored key overrides, so
    the read-side marker names the store, not the file.
  - **Event time** (capability `memory-event-time`): hits and citations carry
    `event_time_unix_ms` / `event_time_end_unix_ms` / `time_source` / `time_precision`
    (flattened `EventTime` in transport.rs); `src/lib/eventTime.ts` formats to precision
    (date-only precisions in UTC, never a clock time) and labels non-explicit sources. The
    ingest form sends `occurred_at` + `time_precision`. The memory detail shows the kernel's
    ingest time (document listing), never the UI-side receipt clock. Not sent: the event
    window (`event_after`/`event_before`) — the kernel refuses it until ADR-0134 P2 — and
    `reference_time`, `parts`.
- **Premium planes**: AccessPolicyAdmin, TelegramAdmin,
  IngressStudioAdmin, SubstrateLane, Telemetry, Links (on the OSS contract).
  Each rides the same gRPC channel + bearer token; gated by capability strings.
- **Data flow**: Rust core streams `kernel://state` (absolute-state projection)
  → Zustand store → React screens. Writes go through `invoke('op_*')` →
  Rust core → gRPC → kernel. No polling. (The drift console and its RecordLane
  plane were removed 2026-10-31 with the premium drift product.)
- **Plugin surfaces** wrap in `PluginSurface.tsx` (ADR-0089) — per-plugin skew
  banner, absent state, all automatic.

---

## Key Invariants

- The webview holds NO kernel state the core didn't give it.
- Every mutation requires a `reason` (kernel rejects empty).
- `command_id` is generated inside the Rust core, never by the webview.
- Token events (`seq=0`) are live-only, never replayed, never stored as record.
- TanStack Query is for imperative edges only — nothing on `kernel://state` may be cached there.
