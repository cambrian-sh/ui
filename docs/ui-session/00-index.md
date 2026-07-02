# UI Session — Index

This folder breaks down the OpenCode session captured in `../../session-ui.md` into
themed documents. The session was an extended (8-day) collaboration between you and
the Sisyphus agent (model `minimax-m3`) to land the UX PRD for the Cambrian Web UI
and to prepare the runtime codebase for the next phase: implementation.

## What this session was

- **One user prompt at the start** (`[search-mode]` + "continue from where you left off, complete your paperwork… make us ready to start developing the UI"). You had been working on the UX PRD before an electricity interruption, and you asked the agent to finish the paperwork and lock decisions.
- **One long autonomous agent run.** The agent spent most of the session reading the existing `docs/prd/web-ui-ux-prd.md` in chunks and applying targeted edits to it. There was very little back-and-forth.
- **Three electricity-driven resumptions.** You re-issued the "continue from where you left off" prompt after each outage. The transcript contains identical UX PRD sections 5+ times because the agent kept re-reading the same file from disk on every resumption.
- **Three `/stop-continuation` slash commands** (lines 13399, 14239, 14419) and one final resumption message (line 14605). The session was cut off mid-tool-call at line 14,730 — the agent was about to read the UX PRD once more before resuming the edit pass.
- **8 final todos never executed.** The session ended before the agent could complete the lock-in pass on the UX PRD, the product PRD, the requirements doc, `CONTEXT.md` / `CURRENT_CODEBASE_STATE.md`, the index files, the lock-in summary, or the "ready to develop" checklist. See `10-final-todos.md`.

## The 11+ locked decisions

The session's substance is the **decision log** at the top of the UX PRD: 11
normative decisions that compound across every screen, plus several sub-decisions
that emerged in the final phase (light mode in V1, theme as a token-level switch,
plan view in both chat and inspector, settings V1 scope cut).

See `02-decisions-summary.md` for the one-pager table.

## How to read this folder

Read in this order if you are picking up the work:

1. `02-decisions-summary.md` — the locked decisions table (5-minute read).
2. `03-design-system.md` — the foundation everything else builds on.
3. `04-shell-and-layout.md` through `09-configuration-and-profiles.md` — the screens and components.
4. `10-final-todos.md` — the open work that was never completed.

If you want to understand *how the session went* (and why the paperwork is
incomplete), read `01-session-arc.md`. If you need to audit the agent's exact
reasoning or see the raw tool calls, see `11-original-transcript.md` for the
link and read guide.

## File map

| File | Purpose |
|:---|:---|
| `00-index.md` | This file. |
| `01-session-arc.md` | Timeline of the session, recovery strategies the agent developed, interruption pattern. |
| `02-decisions-summary.md` | One-pager table of the 11 decision logs plus sub-decisions. |
| `03-design-system.md` | Token taxonomy, colour, type, spacing, motion, iconography, what the system forbids. |
| `04-shell-and-layout.md` | Three-column shell, navigation rail, density, role gating, status strip. |
| `05-chat-surface.md` | Chat composition, embedded artifacts, HITL, inject input, draft recovery. |
| `06-plan-view-and-multi-plan.md` | DAG-as-graph + step-list, in-flight plans per session, plan stack, bids. |
| `07-memory-explorer.md` | Memory list, filter bar, graph view, selection details, blast radius. |
| `08-keyboard-and-states.md` | 17 V1 shortcuts, command palette, empty/loading/error/success states. |
| `09-configuration-and-profiles.md` | Settings surface, instance profiles, runtime config, UI control plane, audit. |
| `10-final-todos.md` | The 8 todos that the session ended without executing. |
| `11-original-transcript.md` | Pointer to the raw `session-ui.md` (sha256, line map, read guide). |

## Source artefacts referenced in the session

The agent was editing these files (and these are the files the implementation
phase will start from):

- `docs/requirements/web-ui-requirements.md` (282 lines at last check)
- `docs/prd/web-ui-prd.md` (299 lines at last check) — product PRD
- `docs/prd/web-ui-ux-prd.md` (724 lines at last check) — UX PRD, the main artefact
- `CONTEXT.md` (255 lines) — project context, must be kept in sync per AGENTS.md
- `CURRENT_CODEBASE_STATE.md` (414 lines) — codebase state, must be kept in sync per AGENTS.md

## Caveats

- This breakdown is a **synthesis**, not a verbatim copy. Tool calls, repeated
  file reads, and acknowledgment chatter have been dropped. Use
  `11-original-transcript.md` to deep-link into the raw.
- The session ended mid-tool-call. Anything past line 14,674 is "agent's last
  thinking block" and the start of a `read` of the UX PRD that was about to be
  interrupted again.
- The decisions captured here are the **state of the UX PRD as the agent last
  saw it on disk** during this session. Some of them may have drifted if the
  PRD was edited outside this session.
