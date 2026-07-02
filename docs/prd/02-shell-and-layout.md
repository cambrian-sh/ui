# PRD-02 — Shell & Layout

**Status:** Frozen v1.0 — locked 2026-06-22.
**Parent PRD:** `web-ui-ux-prd.md` v0.1 · [PRD-01](01-foundation.md) Foundation.
**Sibling PRDs:** [PRD-03](03-chat-surface.md) Chat Surface · [PRD-04](04-plan-work-surface.md) Plan Work Surface · [PRD-05](05-memory-explorer.md) Memory Explorer · [PRD-06](06-operator-console.md) Operator Console · [PRD-07](07-configuration-and-audit.md) Configuration & Audit.
**Source requirements:** `../requirements/web-ui-requirements.md` §2.1 (chat surface context), §2.2 (operator console org), §2.4 (health/legibility), §2.5 (realtime), §2.6 (auth → role gating), §2.8 (deployment).
**Source PRD:** `web-ui-prd.md` ID-1 (one app two surfaces), ID-3 (controller over the boundary), ID-4 (plan is centre of gravity), ID-5 (realtime default), ID-7 (two roles, one app), ID-10 (remote reach).
**Story coverage:** Story 14 (Plans in Flight list — consumes the nav entry), Story 39 (status panel), Story 40 (Health screen), Story 41 (Audit entry discoverability), Story 42 (export — PRD-07), Story 43 (realtime promise), Story 46 (keyboard alone), Story 47 (dark-mode-first), Story 48 (no generic toasts), Story 49 (Viewer read-only), Story 50 (Viewer follow), Story 51 (audit deep-link), Story 52 (remote connection), Story 53 (draft recovery — PRD-03).
**Companion ADRs (all Frozen):** [UI-003](../adr/UI-003-router.md) Router (TanStack) · [UI-004](../adr/UI-004-state-management.md) State (Zustand + TanStack Query) · [UI-005](../adr/UI-005-realtime-sync.md) Realtime Sync (replace-on-event) · [UI-006](../adr/UI-006-motion-library.md) Motion (CSS-only) · [UI-007](../adr/UI-007-keyboard-library.md) Keyboard (react-hotkeys-hook) · [UI-008](../adr/UI-008-test-stack.md) Test Stack (Vitest + Playwright + axe).

---

## 1. Scope

**In scope.** The three-column shell (nav rail, centre, contextual inspector); the navigation rail (sections, footer, theme + density toggles); the status strip; the role-gating contract; the density-and-theme integration on the shell chrome; the panel collapse/expand mechanics; the command palette entry point; the `g s` / `g p` / `g a` / `g t` / `g m` / `g y` / `g o` / `g w` / `g l` / `g v` / `g c` / `g u` / `g x` / `t` / `[` / `]` / `{` / `}` / `?` keyboard entries from the map in PRD-01 §9; the first-render hydration contract (webview ← Tauri `op_get_state` ← kernel snapshot).

**Out of scope.** The centre column's chat surface contents (PRD-03). The right inspector's per-context shapes (PRD-04 / 05 / 06). The settings surface (PRD-07). The technical decisions (transport, framework, deployment, auth provider) — these are EC-1…EC-5 in PRD-01 §2.5, not open here. The package manager, gRPC seam, vendored proto (EC-3, EC-4, EC-5) — all inherited, not re-decided.

---

## 2. Inherited decisions (cited by number)

This PRD inherits the following normative decisions from the parent PRDs. They are cited by number here, not re-stated, per the locked-decision rule (PRD-01 §2.4 + §2.5).

**From the UX PRD `web-ui-ux-prd.md` §2:**
- **LD-1 — Shell shape.** Three columns: nav (left), chat surface (centre, widest), contextual inspector (right). Status strip at the very bottom, visible on every screen. Shell is role-aware and density-aware.
- **LD-8 — States.** Empty / loading / error / success / audit as a five-state contract. PRD-01 §10 owns the contract; this PRD applies it to the shell chrome.
- **LD-11 — In-app configuration.** UI is the sole end-to-end interface. Connection, runtime, UI control-plane, instance profiles, audit — all in the UI. This PRD consumes the audit entry discoverability requirement (Story 41 / 51) and the status-strip health panel (Story 39).

**From the in-repo `ui/CONTEXT.md` (PRD-01 §2.5):**
- **EC-1 — Tauri 2 desktop shell.**
- **EC-2 — React 19 + TypeScript + Vite.**
- **EC-3 — Bun for JS package management and dev/build.**
- **EC-4 — gRPC in Rust core only.** The webview touches only Tauri IPC. All state lives in the Rust core's `StateOfRecord`; the webview is a projection. **PRD-02's hydration contract is "on mount, call `op_get_state`; thereafter, fold every `kernel://state` event."**
- **EC-5 — Vendored `ui/proto/operator.proto`, pinned to contract 0047.** Do not edit by hand; re-vendor at every kernel contract bump.

**Inherited sub-decisions from `../ui-session/02-decisions-summary.md`:**
- Nav-rail footer carries: current instance, current operator, theme toggle, density toggle.
- Plan view lives in two places (chat PlanCard + right inspector). The right inspector's "plan context" shape is owned by PRD-04; the centre column's chat content is owned by PRD-03.
- Status strip is the first thing an operator reads when something is wrong. Carries kernel up, LTM up, current instance, in-flight plans, queue depth, circuit-breaker state, current spend rate, event backlog. Always visible; persists across navigation.

---

## 3. The three-column shell

The shell is the outermost layout container. It is **role-aware** (LD-1), **density-aware** (LD-3), **theme-aware** (LD-3), and **realtime-aware** (LD-2). It does not own any business logic; it is a chrome that hosts the other PRDs' surfaces.

### 3.1 Layout grid

```
┌──────────┬─────────────────────────────────────────────┬──────────────────┐
│          │                                              │                  │
│  NAV     │              CENTRE                          │   INSPECTOR      │
│  (left)  │   (widest column; chat surface per PRD-03,   │   (right)        │
│          │    plan work surface per PRD-04, etc.)       │                  │
│          │                                              │                  │
└──────────┴─────────────────────────────────────────────┴──────────────────┘
│                          STATUS STRIP  (32 px)                            │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Left rail** — 240 px default; 56 px collapsed (icon-only). Toggle via `[` (collapse) / `]` (expand). Per-operator preference persisted.
- **Centre** — Fills remaining width; minimum 480 px; can grow to ~60 % of viewport.
- **Right inspector** — 360 px default; 280 px compact; 0 (collapsed, off) at viewport < 1280 px. Toggle via `{` (collapse) / `}` (expand). Per-operator preference persisted. The collapse-at-1280 default is a one-time rendering decision on first launch; the operator can override.
- **Status strip** — 32 px. Always visible. See §6.

### 3.2 Density and theme

The shell consumes the density and theme tokens (PRD-01 §3 + §4). The shell chrome (nav rail, status strip, inspector header, panel separators) re-spaces on density change; the centre column re-flows on density change via the same tokens. No per-component fork. **Hard rule: shell chrome does not branch on `density === 'compact'`** (LD-3 forbids).

### 3.3 Collapse persistence

Panel widths and collapsed states are persisted per operator (per device) via the operator's local profile. The persistence is a UI concern (PRD-07 owns the instance-profile format); the shell reads + writes through the projection store (UI-004).

---

## 4. Navigation rail (left)

The navigation rail is a vertical list of sections, grouped. Each section is a collapsible group. The current selection is highlighted with the accent border and a 2 px left bar (LD-2 anti-slop: no glow, no scale, no neon).

### 4.1 Sections

The rail contains the following entries (each maps to one user story in the product PRD; each consumed by a downstream PRD):

- **Sessions** — list of all sessions, filterable. The active session is pinned at the top with a "running" pill. (PRD-06 §7.1.)
- **Plans in Flight** — flat list of every running plan across all sessions. Hotkey `1`…`9` jumps to the nth plan when the Plans in Flight view is focused. (PRD-06 §7.2.)
- **Console — Agents.** (PRD-06 §7.3.)
- **Console — Tools & Skills.** (PRD-06 §7.4.)
- **Console — MCP.** (PRD-06 §7.5.)
- **Console — Memory.** (PRD-05.)
- **Console — Scope.** (PRD-06 §7.7.)
- **Console — Watch & Reactive.** (PRD-06 §7.8.)
- **Console — Lifecycle.** (PRD-06 §7.9.)
- **Console — Verifier Pool.** (PRD-06 §7.10.)
- **Console — Cost & Energy.** (PRD-06 §7.11.)
- **Audit.** (PRD-07 §7.13.)
- **Settings.** (PRD-07 §11.)

### 4.2 Footer (theme + density + identity)

The nav-rail footer carries (in order, top to bottom):
1. **Current instance** — colour tag + label. Click opens the instance switcher (PRD-07).
2. **Current operator** — name + role pill (Operator / Viewer). Click opens account / log out.
3. **Theme toggle** — dark / light. Bound to `t` (PRD-01 §9). Both modes ship in V1.
4. **Density toggle** — compact / default / spacious. Persisted per operator per device. Bound to `Shift-t` (in the keyboard map) or via the click target; the primary keyboard control is the dedicated density shortcut.

The footer's visual treatment is the same as the rail body: token-driven, density-aware, role-aware. Viewer sees the same footer (role pill says "Viewer"); settings and instance switcher click targets are read-only for Viewer (per LD-11 + ID-7 + §7 below).

---

## 5. Centre column (placeholder shell)

The centre column hosts the chat surface (PRD-03) by default. The right inspector (PRD-04 / 05 / 06 / 07) populates based on the operator's current focus. **The shell does not own the centre content; it is a flexbox container that lets the active PRD take its full width.** The shell's job is to provide the three-column layout, the density + theme plumbing, the panel collapse/expand, and the route/focus state. The centre column's content is the chat surface when a session is open; the operator console is rendered into the centre column when a console entry is selected (per PRD-06).

### 5.1 Loading the centre

The first paint is a skeleton (PRD-01 §10.2). Hydration is `op_get_state` (Tauri IPC) called once on shell mount; thereafter, every `kernel://state` event is folded into the projection store (UI-005). The first render shows the skeleton; the first folded snapshot replaces it. The skeleton max time is 5 s (PRD-01 §10.2); after 5 s, the empty state takes over with a "we couldn't load this; retry" affordance.

### 5.2 No manual refresh

The product PRD ID-5 promises no "click to refresh" anywhere. The shell has no refresh button. Recovery from a stale state is automatic: if the `kernel://state` stream drops (Rust core reconnects), the next `op_get_state` re-hydrates; the kernel's `RESYNC_REQUIRED` is honoured (UI-005).

---

## 6. Status strip (bottom, 32 px, always visible)

The status strip is the operator's first read when something is wrong (Story 39). It persists across navigation. It does not collapse, hide, or be overridden by any surface.

### 6.1 Fields (left → right)

1. **Current instance** — colour tag + label. Click opens the instance switcher (PRD-07).
2. **Kernel up** — green / amber / red pill. State derived from the latest `kernel://state` event's connection status (UI-005).
3. **LTM up** — green / amber / red pill. Same source.
4. **In-flight plans** — count + click-to-filter. Opens Plans in Flight (PRD-06).
5. **Queue depth** — count of pending events in the Tauri event queue. Click opens the event backlog panel.
6. **Circuit-breaker state** — per-LLM-provider. Click drills into Cost & Energy (PRD-06 §7.11).
7. **Current spend rate** — $ / hour, last 5 min. Same drill.
8. **Event backlog** — count of `kernel://state` events received but not yet rendered. Tells the operator if the UI's pipeline is behind the kernel. Amber when above threshold (per-operator preference, default 100).

### 6.2 States

The status strip's fields are themselves the `Status / realtime` components from PRD-01 §6: `StatusPill`, `PulseHighlight`, `TrailMark`, `ConnectionBadge`. The strip never goes to the empty state; on first render before hydration it shows all-amber pills with "Connecting…" text. After hydration, the pills reflect the folded snapshot.

### 6.3 Role gating

Viewer sees the same strip; the click targets that lead to mutating actions (instance switcher, when the operator role changes would be required) are read-only for Viewer. The strip itself is not gated.

---

## 7. Role gating (LD-1 + LD-11 + ID-7)

The shell enforces **two roles, one application** (product PRD ID-7). The role is set server-side by the kernel and reflected by the webview. The webview's enforcement is presentation; the kernel's enforcement is authoritative.

### 7.1 Server-side authoritative

`op_get_state` returns `role: "operator" | "viewer"`. The webview renders the role pill in the nav-rail footer. Every mutating action in the shell chrome (instance switcher click leading to "add an instance," account click leading to "log out" + replace with a read-only "user info" surface for Viewer) is gated by the role.

### 7.2 UI-side enforcement

For the shell chrome specifically:
- **Operator** — all nav-rail entries are clickable, all footer items are interactive, the role pill says "Operator."
- **Viewer** — all nav-rail entries are clickable (read-only), the footer items that lead to mutation (instance switcher when the underlying action would be mutating) show a "this action requires Operator" disabled state. The role pill says "Viewer."

Per product PRD ID-7: **Viewer mutating actions are not rendered at all — not just disabled** (with the exception of the shell chrome's account / instance switcher, where a disabled state is rendered with a "this action requires Operator" tooltip; the underlying form is not rendered). This is a tighter rule than "disabled" and applies to the body of every screen; the shell chrome is the boundary.

### 7.3 Audit

Every role-relevant action is auditable. Logging in / out, switching instances, changing theme or density (density is not audited, but theme is — see PRD-07 audit policy) — these are recorded in the audit list (PRD-07).

---

## 8. Command palette entry point

`Cmd/Ctrl-K` opens the command palette. The palette is a PRD-01 component (`CommandPalette`); its content is filled by the active PRD. The shell's job is to wire the `Cmd/Ctrl-K` global hotkey (PRD-01 §9) and provide a `?` shortcut that opens the shortcut palette (a search-over-shortcuts modal). Both palettes are rendered as overlays above the shell chrome.

### 8.1 Shortcut palette (`?`)

A search-over-shortcuts modal. The data source is the keyboard map in PRD-01 §9. The search filters by shortcut or by action name. The palette is dense (operators use it heavily); it is a List with virtualisation (PRD-01 §6).

### 8.2 Command palette (`Cmd/Ctrl-K`)

A free-text-over-actions modal. The data source is the union of all actions registered by every PRD + the navigation entries. The palette is the discoverability layer for actions not on the keyboard map.

---

## 9. Open questions (gaps for ADRs)

| # | Question | ADR | Status |
|:--|:---------|:----|:-------|
| 1 | Which router do we use? (React Router v7 / TanStack Router / Wouter / state-based) | [UI-003](../adr/UI-003-router.md) | **Draft** |
| 2 | Which state management library (projection store + per-screen state)? (Zustand / Jotai / Redux Toolkit / TanStack Query / Valtio) | [UI-004](../adr/UI-004-state-management.md) | **Draft** |
| 3 | How does the Tauri `kernel://state` event stream fold into the projection store? (full snapshot / delta / hybrid) | [UI-005](../adr/UI-005-realtime-sync.md) | **Draft** |
| 4 | Which motion library do we use to satisfy LD-2's strict budget? (CSS-only / Framer Motion / Motion One / GSAP) | [UI-006](../adr/UI-006-motion-library.md) | **Draft** |
| 5 | Which keyboard library do we use for the 17 V1 shortcuts + the command palette chord? (react-hotkeys-hook / custom / mousetrap) | [UI-007](../adr/UI-007-keyboard-library.md) | **Draft** |
| 6 | Which test stack do we commit to? (Vitest + Playwright + axe-core + RTL) | [UI-008](../adr/UI-008-test-stack.md) | **Draft** |

**Not in this PRD's open-questions block:**
- The kernel-side config schema contract (PRD-07 → UI-015).
- The audit export format (PRD-07 → UI-016).
- The auth provider (PRD-07 → UI-017).
- The plan graph layout library (PRD-04 → UI-011).
- The memory graph library (PRD-05 → UI-012).
- The blast-radius computation seam (PRD-05 → UI-013).
- The cost-panel vs metrics-explorer decision (PRD-06 → UI-014).
- The chat draft persistence strategy (PRD-03 → UI-009).
- The embedded artifact contract (PRD-03 → UI-010).

---

## 10. Cross-references

- **Parent PRD** — `web-ui-ux-prd.md` §4 (The shell), §2.1 (LD-1), §2.8 (LD-8), §2.11 (LD-11).
- **Sibling PRDs** — PRD-03 (centre column chat surface), PRD-04 (right inspector plan context), PRD-05 (right inspector memory context), PRD-06 (centre column console + nav-rail entries), PRD-07 (footer identity + audit + instance profile + config).
- **Foundation PRD** — PRD-01 §4 (motion grammar), §6 (component inventory — `NavRail`, `StatusStrip`, `CommandPalette`), §9 (keyboard map), §10 (state vocabulary), §11 (forbids).
- **In-repo `ui/CONTEXT.md`** — "Frozen decisions" + "Hard rules" (Tauri 2, React 19+TS+Vite, Bun, gRPC-in-Rust, vendored proto at 0047).
- **In-repo `ui/src-tauri/CONTEXT.md`** — full transport contract; the hydration contract for the shell is `op_get_state` + `kernel://state` fold.
- **Kernel ADRs** — ADR-0019 (OTel Bridge), ADR-0021 (Langfuse), ADR-0022 (push/pull context), ADR-0047 (Operator Transport Plane), ADR-0048 (working-memory context hygiene).
- **Companion ADRs** — UI-003, UI-004, UI-005, UI-006, UI-007, UI-008 (all in this PRD's §9).

---

## 11. Glossary

Definitions of new vocabulary this PRD introduces. For shared terms (Substrate, Handoff, ExecutionPlan, etc.) see `CONTEXT.md` §7. For design-system terms (Pulse, Trail, Status pill, etc.) see PRD-01 §14.

- **Shell chrome** — The non-content layout: nav rail, status strip, panel separators, panel collapse handles. The shell chrome is always visible; the centre content is what changes per route.
- **Status strip** — The 32 px bottom strip carrying kernel health + LTM health + in-flight plans + queue depth + circuit-breaker + spend rate + event backlog. Always visible.
- **Role pill** — A small label in the nav-rail footer that says "Operator" or "Viewer." Reflects the kernel-authoritative role from the latest folded snapshot.
- **Hydration contract** — `op_get_state` on shell mount; thereafter, fold every `kernel://state` event into the projection store. Re-hydrate on `RESYNC_REQUIRED`.
- **Command palette** — `Cmd/Ctrl-K` modal that searches over actions and navigation. PRD-01 component; PRD-02 owns the global hotkey.
- **Shortcut palette** — `?` modal that searches over the keyboard map from PRD-01 §9.
- **Projection store** — The webview-side state that mirrors the Rust core's `StateOfRecord`. Owned by UI-004 (state management library).
