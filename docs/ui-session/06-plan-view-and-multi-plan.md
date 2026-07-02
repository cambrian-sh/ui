# 06 — Plan View and Multi-Plan per Session

**Bound by decision log 4 (plan view) and decision log 10 (multiple active plans per session).**

A single Cambrian session can have **multiple plans running in parallel**:
a foreground plan, background daemon plans, watch-driven reactive plans.
The UI has to make all of this legible without leaking cognitive load to
the operator.

## Two modes for plan view (decision log 4)

Plan view has **two modes, togglable per operator and per session**:

### DAG-as-graph (default)

- Nodes for steps, edges for dependencies.
- Status by colour: WAIT, RUN, DONE, FAIL, PAUSED.
- The **active step pulses** (subtle background tint + 1 px border; see `03-design-system.md` §Motion).
- **Bids** stream in attached cards during the auction moment.
- The graph layout is **deterministic and stable across re-renders** (steps do not "jump" on update).
- Status changes use the realtime visual grammar (pulse + trail), not animation.

### Step-list

- A vertical list of steps with status.
- The selected step is expanded to show bids, agent output, and confidence.
- The list is **virtualised** (operator can have hundreds of steps in a long-running plan).

Both modes read the same data. Switching between them is a UI toggle, not
a data change.

## Where plan view lives

The plan view is a **work surface** that appears in two places:

1. **Embedded in the chat** (as an `EmbeddedPlanCard`; see `05-chat-surface.md`). This is the entry point for the operator in the middle of a conversation.
2. **In the right inspector** when the operator is focused on a plan (either from the chat's plan stack or from the global "Plans in Flight" view). The plan-context inspector shape carries:
   - Plan graph (mini)
   - Step status
   - Bids for the focused step
   - Agent output stream
   - TrustScore

The chat shows the **foreground plan by default**. The "Plans in Flight"
global screen (in the nav rail) shows everything across all sessions.

## Bids (auction visualisation)

Bids have two visualisations:

- **Transient overlay on the active step during the auction moment.** Lives in the DAG or the step-list, whichever the operator has open. Fades out 600 ms after the auction closes.
- **Persistent card inside the step's details.** The operator can scroll back and see who bid on what, who won, and why. The card carries: agent id, confidence, rationale, latency, requirements.

The transient overlay and the persistent card share the same visual
vocabulary — same fields, same colour tokens, same typography. They are
the same component, two render modes.

## In-flight plans per session (decision log 10)

A single session can have:

- **Foreground plan.** The one the operator is currently focused on. Highlighted in the plan stack with the accent.
- **Background plans.** Daemon-driven, watch-driven, reactive. Visible in the plan stack and in the "Plans in Flight" global screen.

The **plan stack** is the source of truth for what is running in this
session. The chat view treats the plan stack as the truth.

## The inject input's plan selector (decision log 10)

Because multiple plans can be running in one session, the inject input
has a **plan selector**. The default target is the foreground plan. If
there is no foreground plan, the inject input is disabled.

## HITL is plan-tagged (decision log 10)

HITL interventions render differently depending on which plan they
belong to:

- **Foreground-plan interventions** are inline in the chat (as an `EmbeddedHITLInline`) and also pinned to the inspector.
- **Background-plan interventions** are pinned to the inspector and shown in the chat as a subtle badge with a click-through.

This is so the operator can act on a foreground intervention without
losing context, while still being aware of background interventions that
need attention.

## "Plans in Flight" global screen (nav rail)

A flat list of every running plan across **all** sessions. The `n` hotkey
jumps to the nth plan. This is the operator's "where is everything"
view.

The per-session plan stack (in the inspector) and the global "Plans in
Flight" screen **share the same data and the same visual vocabulary**.
Switching between them is a navigation, not a context switch.

## Step status colours

Steps have five status states:

| Status | Colour token | Notes |
|:-------|:-------------|:------|
| `WAIT` | muted | Dependencies not yet satisfied. |
| `RUN` | pulse (active accent) | Active step. Pulses during execution. |
| `DONE` | ok | Completed successfully. |
| `FAIL` | err | Failed; routed through SelfHealer (intra-step retry), fallback agent, or ReplanHandler. |
| `PAUSED` | warn | HITL pause (destructive action awaiting confirmation). |

Status changes are instantaneous (no motion for state changes that are
not realtime). The active step's pulse is the only ongoing motion in
the plan view.
