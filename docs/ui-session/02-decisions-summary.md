# 02 — Locked Decisions Summary

The 11 decision logs at the top of the UX PRD, in one place. These are the
**normative** decisions — they compound across every screen and every
component. Nothing in the rest of the UX PRD can contradict them without
explicit amendment.

The decisions were settled in earlier planning conversations and were
re-confirmed in this session as the agent worked through the UX PRD
edits. The session also surfaced a small set of **sub-decisions** that
emerged during the lock-in pass (light mode in V1, plan view in both chat
and inspector, settings V1 scope cut). Both are captured below.

## The 11 decision logs (UX PRD §2)

| # | Title | One-line summary |
|:--|:------|:-----------------|
| 1 | **Shell shape** | Three columns: nav (left), chat surface (centre, widest), contextual inspector (right). Status strip at the very bottom, visible on every screen. |
| 2 | **Realtime visual grammar** | Pulse-and-trail for the moment of change, live status pills for the durable state. No AI-slop: no neon, no glow, no default-shadcn. Subtle 250 ms in / 600 ms out. |
| 3 | **Density and theme** | Three densities (compact / default / spacious) and two themes (dark / light) ship in V1. Both are token-level switches; components consume tokens, not values. |
| 4 | **Plan view** | Two modes, togglable per operator and per session: **DAG-as-graph** (default) and **step-list**. Stable layout, virtualised list. |
| 5 | **Memory explorer** | Filter bar at top (compact; "more filters" popover for the long tail). Selection details in the right inspector. Graph view inline next to the open document, smaller pane, collapsible. |
| 6 | **Chat surface composition** | Centre column = chat + embedded interactive artifacts (plan cards, bid panels, agent output, HITL). Inject input is **above the right inspector**, not inside the chat input — physically separated so the semantics are clear. HITL interventions are plan-tagged. |
| 7 | **Design system** | Located at `./ui/design-system/`. Tailwind CSS + shadcn/ui as the foundation. TypeScript code-as-stylesheet for tokens. The design system **is** the customised shadcn/ui. Accessibility built in, not a follow-on. |
| 8 | **States** | Empty (small dark illustration, one sentence, one primary action). Loading (skeleton, never a spinner; max 5 s then empty takes over). Error (kernel's reason verbatim, one-line "what to do", deep link). Success for destructive mutations is the audit-log entry appearing in real time. |
| 9 | **Keyboard** | 17 V1 shortcuts (refined after first real use). `Cmd/Ctrl-K` command palette is the discoverability layer. |
| 10 | **Multiple active plans per session** ("your no 2") | The chat view treats the plan stack as the truth. Inject input has a plan selector (default: foreground plan). HITL is plan-tagged. "Plans in Flight" global screen mirrors per-session plan stack. |
| 11 | **In-app configuration** ("your no 1") | UI is the **sole** end-to-end interface. No "edit the file on disk." Connection settings, runtime settings (form over published schema), UI control-plane, instance profiles — all in the UI. Every config change is audited. |

## Sub-decisions that emerged in this session

These were not in the original 11 decision logs but emerged during the
final-phase edits the agent was making in this session. They are
**equally locked** once the agent's edits land:

- **Light mode ships in V1.** Was originally "follow-on." The agent was promoting it to "both ship in V1" in the lock-in pass; this rename was applied to the `Density and theme` decision log (was `Density`).
- **Theme is a token-level switch.** §4.7 was being updated so the density block also covers theme (dark is default, light is the toggle, components consume `theme/*` tokens).
- **Nav-rail footer exposes theme + density toggles.** The user (or the earlier design) decided that the navigation rail footer holds: current instance, current operator, theme toggle, density toggle.
- **Plan view lives in two places.** Plan view is a work surface in the right inspector *as well as* the embedded PlanCard in the chat. The right inspector's plan-context shape carries a mini graph, step status, bids, agent output stream, and TrustScore.
- **Settings V1 scope cut.** Free-form JSON editor is **out** of V1. The kernel publishes a schema of editable keys; the UI is a form over that schema, with description, default, current value, reset-to-default, and "what this does" tooltip. Destructive changes require a confirm-with-consequence bar + mandatory reason. The V1 product decision is "no free-form editor."
- **Light mode in the P6 acceptance gate.** P6 was being updated to remove the "(if V1)" qualifier on light mode.

## Decision logic that's NOT in the decision logs

These constraints are spread across the body of the UX PRD. Worth knowing
because they read as if they were open but they are settled:

- **The chat surface follows Linear convention** (newest at the bottom). Eye and action at the same end; plan / step / output blocks grow downward.
- **Role gating is server-side authoritative.** Operator vs Viewer is enforced by the server; the UI reflects it (Viewer has no mutating actions rendered at all — not just disabled).
- **The status strip is the first thing an operator reads when something is wrong.** It carries kernel up, LTM up, current instance, in-flight plans, queue depth, circuit-breaker state, current spend rate, event backlog. Always visible. Persists across navigation.
- **A11y is built in, not a follow-on.** Keyboard, contrast (WCAG AA min, AAA preferred), screen reader, focus order. Contrast per-mode; status colours tuned per-mode.
- **No `#hex` literals in component code.** Token rule is hard. New screens use existing components or propose a new one to the inventory.

## What "locked" means

These are normative for the UX PRD. They bind the technical document
(transport, framework, deployment, auth provider — none of which the UX
PRD picks). A later session that wants to change one of these must:

1. Amend the decision log explicitly (with a "supersedes v0.1" note).
2. Cascade the change through every screen and component that depends on it.
3. Re-derive the acceptance gate in §13.

The agent's final 8 todos (see `10-final-todos.md`) include writing a
one-pager decisions log to make the lock-in explicit and signable.
