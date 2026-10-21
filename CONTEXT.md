# CONTEXT.md — Cambrian Studio

**Cambrian Studio** is a **Tauri 2 + React 19 + TypeScript** desktop app. Three layers:

1. **Rust core** (`src-tauri/`) — the ONLY gRPC speaker; owns the transport,
   state of record, auth, and recovery. See `src-tauri/CONTEXT.md`.
2. **Webview** (`src/`) — a projection/cache of the Rust core's state; never
   speaks gRPC. See `src/CONTEXT.md`.
3. **Proto** (`proto/`) — vendored from `cambrian-core/api/proto/operator.proto`.

For agent rules see `AGENTS.md`. For per-ADR status see `cambrian-knowledge/adrs/`.

---

## Build & Run

```bash
bun install                  # webview deps
bun run dev                  # Vite dev server (webview only)
bun run build                # tsc + vite production build
bun run test                 # vitest (830+ tests)
cargo check                  # Rust core type-check
cargo tauri dev              # full Tauri dev (Rust + webview)
bun run studio               # local kernel + Tauri dev + dev bridge: the live
                             # session is also at http://localhost:1420 in a browser
VITE_USE_MOCK_IPC=1 bun run dev   # webview on simulated IPC; ?scenario=populated|empty|degraded|viewer|disconnected
```

---

## Architecture

- **Contract pinned to `0095`** (kernel v0.6.10-alpha). The Rust core handshakes
  and shows a skew banner on mismatch.
- **Premium planes**: AccessPolicyAdmin, TelegramAdmin, RecordLane,
  IngressStudioAdmin, SubstrateLane, Telemetry, Links (on the OSS contract).
  Each rides the same gRPC channel + bearer token; gated by capability strings.
- **Data flow**: Rust core streams `kernel://state` (absolute-state projection)
  → Zustand store → React screens. Writes go through `invoke('op_*')` →
  Rust core → gRPC → kernel. No polling except the drift console (no feed lane).
- **Plugin surfaces** wrap in `PluginSurface.tsx` (ADR-0089) — per-plugin skew
  banner, absent state, all automatic.

---

## Key Invariants

- The webview holds NO kernel state the core didn't give it.
- Every mutation requires a `reason` (kernel rejects empty).
- `command_id` is generated inside the Rust core, never by the webview.
- Token events (`seq=0`) are live-only, never replayed, never stored as record.
- TanStack Query is for imperative edges only — nothing on `kernel://state` may be cached there.
