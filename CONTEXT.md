# CONTEXT.md — ui (Cambrian Studio, the operator console)

Cambrian Studio is a Tauri 2 desktop app (AGPL-3.0): a Rust core (`src-tauri/`, the only gRPC speaker
and the client-side state of record) and a React 19 + TypeScript webview (`src/`, a projection that
never speaks gRPC), with the operator-plane protos vendored under `proto/`. It is the human surface of a
running kernel and reaches it only through the operator plane.

## Build and test

```sh
bun install                       # webview deps
bun run dev                       # Vite dev server (webview only)
VITE_USE_MOCK_IPC=1 bun run dev   # webview on simulated IPC; ?scenario=populated|empty|degraded|viewer|disconnected
bun run build                     # tsc + vite production build
bun run test                      # vitest; bun run typecheck = tsc --noEmit
cd src-tauri && cargo check       # Rust core (cargo test for its unit tests)
bun run tauri dev                 # full app (Rust + webview)
bun run studio                    # local kernel + Tauri dev + dev bridge (live session also at http://localhost:1420)
bun run gen:dev-bridge            # after changing a #[tauri::command]
```

## Where the documentation is
- **Areas of this repo** are documented by knowledge cards in HQ. For any file or folder run
  `brief <path>` (HQ MCP tool, or `C:/Users/afsin/Dev/hq/bin/hq.exe brief <path> --config hq.yaml` from the
  workspace root); a card also loads automatically when you open a matching file. Cards are the area
  documentation; the whole subsystem is `card.subsystem.operator-ui`.
- **Changing what a card says**: `read_doc cards/<name>.md`, edit, `write_doc` with a reason. Do not add facts here.
- **Why it is this shape**: ADRs and decisions in HQ (`search_docs`, `read_doc adrs/…`; status `list_decisions`).
- **Open work and known gaps**: HQ tickets (`list_tickets repo=ui`).
- **Rules for agents**: [`AGENTS.md`](AGENTS.md) and the workspace [`../AGENTS.md`](../AGENTS.md).
