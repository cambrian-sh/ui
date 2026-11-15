# CONTEXT.md — ui/src-tauri (Cambrian Studio Rust core)

The Tauri Rust core: the only gRPC client of the kernel, the client-side state of record, and the
bridge to the webview. Build and test commands are in [`../CONTEXT.md`](../CONTEXT.md).

## Where the documentation is
- **Areas of this folder** are documented by knowledge cards in HQ: run `brief <path>` (e.g.
  `brief ui/src-tauri/src/transport.rs`); a card also loads automatically when you open a matching file.
  Start with `card.ui.operator-transport` (feed loop, state of record, pins) and `card.ui.auth-sessions`.
- **Changing what a card says**: `read_doc cards/<name>.md`, edit, `write_doc` with a reason. Do not add facts here.
- **Open work and known gaps**: HQ tickets (`list_tickets repo=ui`).
- **Rules for agents**: [`AGENTS.md`](AGENTS.md), [`../AGENTS.md`](../AGENTS.md) and the workspace
  [`../../AGENTS.md`](../../AGENTS.md).
