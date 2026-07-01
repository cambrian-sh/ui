# Webview (`src`) — Development Rules (CLAUDE.md)

## Bootstrap
Read, in order: project root `../CONTEXT.md`, this directory's `CONTEXT.md`, and the product spec `../docs/web-ui-prd.md`. You do **not** need the proto here (the webview never speaks gRPC) — but you may consult `../src-tauri/CONTEXT.md` to know what projection events/intents the core exposes.

## What this layer is
The **React 19 + TypeScript** webview: the presentation layer and a **projection/cache** of the Rust core's state of record. It reaches the runtime **only** through the Rust core, over Tauri IPC.

## Rules
- **No gRPC, no kernel I/O, no network to the kernel.** The webview talks only to the Rust core via Tauri `invoke` (intents) and `listen` (projection events). If you find yourself importing a gRPC/HTTP client to reach the kernel, stop — that belongs in `src-tauri`.
- **The store is a projection, not the source of truth.** Hydrate it from the core's events; on mount/reload re-request the current projection. Never invent kernel state locally.
- **Realtime by default — no "click to refresh" anywhere.** Render from folded projection events.
- **Mutations are loud:** a destructive action (delete memory, revoke grant, override HITL) needs a confirmation naming the consequence, and a **mandatory reason** field passed to the core. Reads are quiet.
- **Every screen traces to a PRD user story** (`../docs/web-ui-prd.md`). No screen without a story; surface a story with no screen as a gap.
- **The plan is the centre of gravity** — keep the plan view visible while a plan runs.
- **Use the kernel's vocabulary verbatim** (Substrate, ExecutionPlan, Gatekeeper, TrustScore, HITL, Inject, Plans in Flight, …). No synonyms. Externalize strings (i18n is a follow-on, but no hardcoded user-facing copy scattered inline).
- **Reflect role + capabilities** from the core: hide/disable mutating controls for Viewers; hide unsupported surfaces; show a version-skew banner. The kernel enforces; the UI reflects.
- **Accessible + dark-mode-first by construction** (keyboard, focus order, WCAG AA contrast, screen reader). Not a polish step.
- **One design system, one visual language.** No second framework, no bespoke per-screen styles. Match the stack: React 19 + TS + Vite + Bun.
- After changing how the webview consumes the core's projections/intents, **update this directory's `CONTEXT.md`**.

## Honesty
Crashed agents, failed plans, verification disagreements, a disconnected kernel — render these as first-class states, never hide them. When the core reports the kernel is unreachable or a mutation failed, show the real reason, not a generic toast.
