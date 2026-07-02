# 04 — Shell and Layout

**Bound by decision log 1 (shell shape) and decision log 3 (density and theme).**

The shell is the **outer frame** of the operator console. It is role-aware
(Operator vs Viewer) and density-aware (compact / default / spacious). It
is the same shell on every screen; only the centre column swaps content.

## Layout grid

```
┌──────────┬─────────────────────────────────────────────┬──────────────────┐
│          │                                              │                  │
│  NAV     │              CENTRE — chat surface           │   INSPECTOR      │
│  (left)  │   (widest column; conversation, embedded     │   (right)        │
│          │    interactive artifacts, custom blocks)     │                  │
│          │                                              │                  │
│          │                                              │                  │
│          │                                              │                  │
└──────────┴─────────────────────────────────────────────┴──────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│                            STATUS STRIP (32 px)                          │
└──────────────────────────────────────────────────────────────────────────┘
```

| Region | Width | Toggle | Behaviour |
|:-------|:------|:-------|:----------|
| **Left rail (NAV)** | 240 px (default) / 56 px (collapsed, icon-only) | Global hotkey + per-operator preference | Vertical list of sections, grouped. Current selection has accent border + 2 px left bar. |
| **Centre (chat surface)** | Fills remaining width; minimum 480 px; can grow to ~60% of viewport. | — | Widest column. Where the operator's real action happens. |
| **Right inspector** | 360 px (default) / 280 px (compact) / 0 (collapsed) | Global hotkey + per-operator preference. At viewport < 1280 px it collapses by default. | Context-shaped; changes based on what the operator is focused on. |
| **Status strip (bottom)** | 32 px, full width | — | Always visible. Persists across navigation. |

## Navigation rail (left)

Vertical list of sections, grouped. Each section is a collapsible group. The current selection is highlighted with the accent border and a 2 px left bar.

**Top-level entries** (in order):

- **Sessions.** All sessions (Active / Paused / Dormant / Completed), filterable. The active session is pinned at the top with a "running" pill.
- **Plans in Flight.** A flat list of every running plan across all sessions. The `n` hotkey jumps to the nth plan.
- **Console — Agents.**
- **Console — Tools & Skills.**
- **Console — MCP.**
- **Console — Memory.**
- **Console — Scope.**
- **Console — Watch & Reactive.**
- **Console — Lifecycle.**
- **Console — Verifier Pool.**
- **Console — Cost & Energy.**
- **Audit.**
- **Settings.** (Config + UI control plane + instance profiles + telemetry opt-in. See `09-configuration-and-profiles.md`.)

Each Console entry maps to one user story in the product PRD. Audit is its
own entry because it is used across the app, not just for config changes.
Settings is its own entry because it is the operator's primary workspace
for setup and configuration.

**Nav-rail footer** holds:
- **Current instance** (click to switch)
- **Current operator** (click for account / log out)
- **Theme toggle** (dark / light; both ship in V1, dark is the default)
- **Density toggle** (compact / default / spacious)

## Centre column (the chat surface)

The chat surface. Not a regular chat — it is a conversation in which the
runtime produces **embedded interactive artifacts** alongside text: a plan
forming, a bid panel, an agent output stream, a HITL intervention. The
operator's text and the runtime's artifacts are interleaved in a single
chronological flow; the artifacts are first-class blocks, not text. See
`05-chat-surface.md`.

## Right inspector (the contextual inspector)

The inspector is **context-shaped** — it changes based on what the operator is currently focused on. The shapes:

| Context | Inspector contents |
|:--------|:-------------------|
| **Chat context** | Plan stack, active step detail, active agent, current session state strip. |
| **Plan context** (when focused on a plan in Plans in Flight) | Plan graph (mini), step status, bids for the focused step, agent output stream, TrustScore. |
| **Resource context** (when focused on an agent / tool / skill / MCP / memory document) | Resource header (id, trait / type, status pill), key fields, recent activity, related plans, mutating actions. |
| **Mutation context** (when a mutating form is open) | The form, the diff (before / after), the reason field, the confirm-with-consequence bar. |
| **Audit context** (when focused on an audit entry) | The entry, the diff, a deep link to the target. |

When no context is active, the inspector is empty (a single status pill
and a one-line "no context").

## Status strip (bottom)

**Always visible.** Surfaces, in this order:

- Kernel up
- LTM up
- Current instance
- In-flight plans
- Queue depth
- Circuit-breaker state
- Current spend rate
- Event backlog

Click on any field to drill in. **The status strip is the first thing an
operator reads when something is wrong.**

## Density (decision log 3)

- Global toggle (compact / default / spacious). Persists per operator and per device.
- Default: **compact for the console, default for the chat.**
- Density is a **token-level switch** (see `03-design-system.md`). Components consume density tokens, they do not branch on a prop.

The implementation rule is non-negotiable: a component does not get a
`density="compact"` prop. It consumes `density/row/h`, which the density
toggle flips. If a component needs different behaviour at different
densities, that's a token-level decision, not a code branch.

## Theme (sub-decision)

- **Dark is the default; light is a toggle.** Both ship in V1 (was originally a follow-on).
- **Theme is a token-level switch.** Components consume `theme/*` tokens; only the token values differ between modes. Components do not branch on theme.
- The theme toggle lives in the nav-rail footer.

## Role gating (UX PRD §4.6)

| Role | Surface |
|:-----|:--------|
| **Operator** | Full surface, including every mutating action. |
| **Viewer** | Same surface; mutating actions are **not rendered** (not just disabled). The inject input, the mutation forms, the confirmation dialogs, the destructive actions — all absent. The audit log is present and read-only. The Settings surface is read-only. |

**Server-side enforcement is authoritative.** The UI reflects it. The role
is shown in the navigation rail footer (operator vs viewer).

## Keyboard

- All global shortcuts in `08-keyboard-and-states.md` work in every panel.
- `Cmd/Ctrl-K` opens the command palette; the palette is the discoverability layer for everything not on the keyboard map.
