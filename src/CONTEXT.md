# Webview (`src`) — CONTEXT.md

**Scope:** the **React 19 + TypeScript** webview — the presentation layer. It is a **projection/cache** of the Rust core's state, never a source of truth, and it **does not speak gRPC**. Read the project root `../CONTEXT.md` first; transport detail is in `../src-tauri/CONTEXT.md`.

---

## Status

- **Scaffold:** Vite, React 19, Bun, Tailwind CSS, Radix UI primitives.
- **IPC & Store:** `ipc/` and `store/` are fully implemented. The webview hydrates from `op_get_state` and listens to `kernel://state` and `kernel://token`.
- **Screens Implemented:**
  - Sessions (UI-IMPL-19)
  - Plans in Flight (UI-IMPL-20)
  - Agents (UI-IMPL-22)
  - Tools & Skills (UI-IMPL-22b)
  - MCP Servers (UI-IMPL-23)
  - Scope (UI-IMPL-24)
  - Lifecycle (UI-IMPL-26)
- **Design System:** `design-system/` is established with tokens, components, and utilities.
- **Audit remediation (Phase 1–4):** the full middleware audit is tracked in `../docs/plan-remediation.md` (5 phases, 17 tickets). Phase 1 (Safety Net: `ErrorBoundary`, hardened `formatRelativeTime`, `useStore` selector), Phase 2 (Mutation Integrity) and Phase 3 (Unwired Actions: grant/revoke, registerMCP, setScope, HITL resolve) are complete. Phase 4 (Test Hardening) — T4.1 is done: `tsc --noEmit` clean and **148 tests pass** (74 net-new across all mutating + read-only screens). A shared `useMutation` hook lives at `lib/useMutation.ts`; Tool/MCP/Scope/ChatSurface/SessionDetail/Lifecycle gate mutations by `role === 'operator'` and surface real kernel errors via `ErrorState`; memory/plan reason fallbacks removed so an empty reason is never faked (buttons disable instead).
- **Known gap (follow-up, not T4.1 scope):** `MemoryDetail` and `PlanWorkSurface` (Phase 2 reason-gating) implement the mandatory-reason gate but do **not** reflect `role` (a Viewer can click Tag/Delete/Pause/Resume) and do **not** use `useMutation`/`ErrorState` (no failure UI). The plan's T4.1 "Viewer sees disabled controls" + "mutation rejects → ErrorState" bullets are therefore untestable for these two screens. Recommend a follow-up ticket to add role gating + `useMutation`/`ErrorState` (per AGENTS.md "hide/disable mutating controls for Viewers"), after which the missing Viewer/failure tests can be added.

---

## Responsibilities (target module map)

| Area (target) | Responsibility |
|---|---|
| `ipc/` | The Tauri client: `invoke(...)` user intents (login, send_message, inject, set_grant, …) and `listen(...)` for **projection events** from the Rust core. This is the only way the webview reaches the runtime — through the core. |
| `store/` | A **projection store** (e.g. Zustand) hydrated from the core's events. A **cache**, not the state of record. On mount / after a reload, re-request the current projection from the core. |
| `screens/` | One screen per PRD surface; **each screen traces to a user story** in `../docs/web-ui-prd.md`. The plan view is the centre of gravity when a plan is running. |
| `design/` | The design system: tokens (color/type/spacing/motion/elevation/focus), components, iconography — derived from Cambrian brand assets. **Dark-mode-first, dense, keyboard-friendly, accessible by construction.** |

---

## How the webview gets data (no gRPC here)

```
Rust core (state of record) ──Tauri events (typed projections)──> store ──> React screens
React screens ──Tauri invoke (op_* intents)──> Rust core ──gRPC──> kernel
```

The Rust core's bridge is **live** (see `../src-tauri/CONTEXT.md` for the full table). Concretely:

- **Listen to events** (`@tauri-apps/api/event` `listen`):
  - `kernel://state` → the full `StateOfRecord` projection — `{ connection, role, kernel_version, contract_version, capabilities, contract_skew, cursor, plans, sessions, audit_tail, pending_hitl, agents, tools, skills, mcp_servers }`. Replace the store with it (the core is authoritative). Emitted on connection change, snapshot, and each structural feed event.
  - `kernel://token` → `{ session_id, step_index, text }` — the live-only token lane; append to the active step's output buffer, do NOT store it as record.
- **Invoke commands** (`@tauri-apps/api/core` `invoke`): `op_login(endpoint, username, password) → role`, `op_get_state() → StateOfRecord` (hydrate on mount), `op_create_session`, `op_send_message`, `op_inject_correction`, `op_pause_session`, `op_resume_session`, `op_resolve_hitl`, `op_set_tool_grant`. All async; errors come back as strings — surface the real message, not a generic toast.
- **Reads are push, writes are intents.** No "click to refresh" — render from the folded `kernel://state`. Every mutating `invoke` requires a **`reason`** (the kernel rejects empty); the `command_id` and token are the core's job, not yours.
- The webview holds no kernel state the core didn't give it. A **reload re-hydrates** via `op_get_state` from the still-connected core (drafts/in-flight/pending approvals survive — they live in the core).

## UX principles (from the PRD)

1. **One mission-control visual language** across chat + console. No second style.
2. **The plan is the centre of gravity** — when a plan runs, the plan view is always visible.
3. **Realtime is the default; mutations are loud, reads are quiet.** A destructive action needs a confirmation that names the consequence.
4. **Show the truth, including the ugly** — crashed agents, failed plans, verification disagreements, a disconnected kernel are first-class states, not hidden errors.
5. **The runtime's vocabulary is the UI's vocabulary** — Substrate, ExecutionPlan, Gatekeeper, TrustScore, HITL, Inject, Plans in Flight, … (root `../CONTEXT.md §7`). No synonyms.
6. **Accessible by construction** — keyboard nav, focus order, contrast (WCAG AA in dark mode min), screen-reader semantics. Not a follow-on (PRD story 46).

## Role & capability reflection

The Rust core tells the webview the `role` (`operator`/`viewer`) and the `capabilities`/version from the handshake. The webview:
- **Hides/disables mutating controls for a Viewer** (the kernel enforces it server-side; the UI only reflects it).
- **Hides surfaces the kernel doesn't advertise** (e.g. Watch/daemon screens when absent) and **shows a version-skew banner** when the kernel's `contract_version` differs from the pinned `0047`.

## Out of scope (PRD)

No marketing site, no end-user chat product, no agent IDE, no marketplace, no full observability/Grafana clone, no mobile-native, no i18n at V1 (externalize strings), light mode is a follow-on (dark-mode-first).
