# CONTEXT.md — ui/src (Cambrian Studio webview)

The React 19 + TypeScript webview: a projection of the Rust core's state that never speaks gRPC.
Build and test commands are in [`../CONTEXT.md`](../CONTEXT.md).

## Where the documentation is
- **Areas of this folder** are documented by knowledge cards in HQ: run `brief <path>` (e.g.
  `brief ui/src/screens/inbox`); a card also loads automatically when you open a matching file.
  Start with `card.ui.capability-gating` (IPC, store, gating) and `card.ui.shell-routing` (shell, rail).
- **Changing what a card says**: `read_doc cards/<name>.md`, edit, `write_doc` with a reason. Do not add facts here.
- **Open work and known gaps**: HQ tickets (`list_tickets repo=ui`).
- **Rules for agents**: [`AGENTS.md`](AGENTS.md), [`../AGENTS.md`](../AGENTS.md) and the workspace
  [`../../AGENTS.md`](../../AGENTS.md).
