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
- **Audit remediation (Phase 1–4):** the full middleware audit is tracked in `../docs/plan-remediation.md` (5 phases, 17 tickets). Phase 1 (Safety Net: `ErrorBoundary`, hardened `formatRelativeTime`, `useStore` selector), Phase 2 (Mutation Integrity) and Phase 3 (Unwired Actions: grant/revoke, registerMCP, setScope, HITL resolve) are complete. Phase 4 (Test Hardening) — T4.1 is done: `tsc --noEmit` clean and **148 tests pass** (74 net-new across all mutating + read-only screens). A shared `useMutation` hook lives at `lib/useMutation.ts`; Tool/MCP/Scope/ChatSurface/SessionDetail/Lifecycle gate mutations by `role === 'operator'` and surface real kernel errors via `ErrorState`; memory/plan reason fallbacks removed so an empty reason is never faked (buttons disable instead). T4.2 (a11y hardening) is complete: the four P2 screens (Watch, Lifecycle, Verifier Pool, Cost & Energy) now have vitest-axe `toHaveNoViolations` coverage; heading-order violations fixed by adding visually-hidden `<h2>` section bridges (`.cambrian-sr-only`) between the page `<h1>` and the shared `CardTitle` `<h3>`; full suite **152 tests pass**, `tsc --noEmit` clean.
- **T5.1 (Comment cleanup):** removed all line-leading `/* … */` block comments from the 57 in-scope `src/` files; the targeted grep returns zero matches, `tsc --noEmit` is clean, and the full vitest suite passes.
- **T5.2 (Stale focus URL param):** added `replace: true` to all 8 row-click/cross-link `navigate` calls that set/clear `?focus=` in the 6 list consoles, and added a `useEffect` scrubber to each console that clears stale `focus` values when the focused id leaves the membership list; 6 scrubbing tests added, `tsc --noEmit` clean, full vitest suite passes.
- **T5.3 (MEDIUM/LOW audit items):** wired the remaining audit items — `relativeTime` NaN/undefined/future guards; `CircuitBreakerPill`/`MCPConnectionPill` unknown-state → neutral gray `unknown` pill (not green `ok`); `formatUSD`/`formatDuration` non-finite → `—`; Verifier/Cost loading state unified with Lifecycle's `isHydrating` check; Cost array-index keys → content-based (`model_id`); `ConfirmMutationDialog` reason `maxLength={1024}`; `aria-current="true"` on selected list rows; `EmptyState` optional `action` prop wired for clear-filters in the 7 filtered consoles; **158 tests pass**, `tsc --noEmit` clean. Phase 5 (Polish) complete.
- **Gap closed (follow-up to T4.1):** `MemoryDetail` and `PlanWorkSurface` now gate every mutating control by `role === 'operator'` (Viewers see disabled controls + "These actions require the Operator role."), route all mutations through `useMutation`, surface failures via `ErrorState` (role="alert"), and use `ConfirmMutationDialog` for the mandatory reason. `MemoryDetail`'s 4 actions (Tag/Delete/Promote/Supersede) and `PlanWorkSurface`'s Pause/Resume now match the `ScopeDetail`/`SessionDetail` pattern; Promote/Supersede no longer fake a hardcoded reason. **161 tests pass**, `tsc --noEmit` clean. The T4.1 "Viewer sees disabled controls" + "mutation rejects → ErrorState" bullets are now satisfied for these two screens.

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
- **Invoke commands** (`@tauri-apps/api/core` `invoke`): `op_login(endpoint, username, password) → role`, `op_get_state() → StateOfRecord` (hydrate on mount), `op_create_session`, `op_send_message`, `op_inject_correction`, `op_pause_session`, `op_resume_session`, `op_resolve_hitl`, `op_set_tool_grant`, `op_set_scope`, `op_register_mcp`, `op_register_skill`, `op_trigger_consolidation`, `op_list_tools`, `op_list_skills`, `op_list_watches`. All async; errors come back as strings — surface the real message, not a generic toast.
- **Reads are push, writes are intents.** No "click to refresh" — render from the folded `kernel://state`. Every mutating `invoke` requires a **`reason`** (the kernel rejects empty); the `command_id` and token are the core's job, not yours.
- **Contract 0057 degradation (graceful).** 0057 removed the per-entity getter RPCs (`GetTool`/`GetAgent`/`GetSkill`/`GetMCPServer`/`GetScope`/`GetWatchConfig`) and the rich detail fields from `StateOfRecord`. The 6 detail screens (Tool/Skill/Agent/MCP/Scope/Watch) therefore read their entity from the projection summary arrays (`state.tools`/`skills`/`agents`/`mcp_servers`/`scope`/`watch_configs`) and render only the fields the kernel projects today. **Population path (closed gap):** `agents` is folded from `AgentReadyOp` feed events; `watch_configs` is folded from `WatchTriggeredOp` feed events; `tools`/`skills`/`watch_configs` are additionally upserted from `op_list_tools`/`op_list_skills`/`op_list_watches`, which the Tools/Skills and Watch consoles call on mount. **MCP and Scope stay empty** — 0057 has no RPC and no feed event for them (kernel-limited; request in `HANDOFF-afsin-core-projection.md` §0). Rich panels that need fields core doesn't yet project (tool schema, agent manifest/cognitive fingerprint, MCP health history, scope change history, watch rules/fires) are shown as honest "not projected by the current kernel build" notes — never faked. The missing projection fields to close this gap are tracked in `HANDOFF-afsin-core-projection.md` (additive; no new RPCs needed).
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
- **Hides surfaces the kernel doesn't advertise** (e.g. Watch/daemon screens when absent) and **shows a version-skew banner** when the kernel's `contract_version` differs from the pinned `0057`.

## Out of scope (PRD)

No marketing site, no end-user chat product, no agent IDE, no marketplace, no full observability/Grafana clone, no mobile-native, no i18n at V1 (externalize strings), light mode is a follow-on (dark-mode-first).
