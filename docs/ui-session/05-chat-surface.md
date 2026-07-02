# 05 — Chat Surface

**Bound by decision log 6 (chat surface composition) and decision log 10 (multiple active plans per session).**

The chat surface is the **centre column** of the shell. It is not a regular
chat — it is a conversation in which the runtime produces **embedded
interactive artifacts** alongside text. The operator's text and the
runtime's artifacts are interleaved in a single chronological flow; the
artifacts are first-class blocks, not text.

## The flow (UX PRD §5.1)

The chat surface is a vertical, virtualised, **reverse-chronological** list of blocks. The newest block is at the **bottom** (Linear / iMessage convention), not the top.

**Why bottom (Linear convention):**

- The operator's natural action is "type at the bottom" (chat muscle memory).
- The plan / step / output blocks grow downward as they stream.
- The status pill of the running plan is always at the bottom near the inject input.

The reverse — newest at top — would force the operator to look up to read
a streaming agent output. The convention where the eye and the action are
at the same end wins.

## Embedded interactive artifacts (first-class blocks)

These are not text. They are components that render inside the chat flow:

- **EmbeddedPlanCard.** The plan forming or in flight. Shows the DAG (mini) and step status. Operator can expand to see the full plan in the inspector.
- **EmbeddedBidPanel.** The auction moment. Renders the bid details for the active step. The transient overlay (during the auction) and the persistent card (in the step's details) share the same visual vocabulary.
- **AgentOutputStream.** The winner's output as it streams. The active agent's name is shown.
- **EmbeddedHITLInline.** A HITL intervention inline in the chat. Plan-tagged — the operator knows which plan the intervention belongs to.
- **ChatDraftRecovery.** If the connection drops or the operator refreshes, the draft survives.

Each block has a stable identifier so that scrolling back, deep-linking,
and the audit log can refer to it.

## The inject input (separate from the chat input)

The inject input is **above the right inspector column**, not inside the chat input. The chat input and the inject input are physically separated to make the semantics clear:

- **Chat input** continues the conversation. It produces a new user message; the runtime interprets it and may form a new plan.
- **Inject input** interrupts a running plan. The label is "Inject into running plan" and it has a **plan selector** because multiple plans can be running in one session.

The plan selector's default target is the **foreground plan**. If there
is no foreground plan, the inject input is disabled.

## HITL — Human-in-the-Loop

HITL interventions are **plan-tagged**. There are two render locations:

- **Foreground-plan interventions** are inline in the chat (as an `EmbeddedHITLInline` block) and also pinned to the inspector.
- **Background-plan interventions** are pinned to the inspector and shown in the chat as a subtle badge with a click-through.

A HITL block carries:

- The intervention's intent (what the runtime is asking the operator to decide).
- A **confirm-with-consequence bar**: "Approving will execute the action above. The plan will resume."
- For destructive actions (rm, drop, delete, truncate), the bar is amber and pauses the DAG until the operator responds.
- A reason field (mandatory for destructive actions, optional otherwise).

## Plan stack (chat-context inspector)

When the chat surface is the active context, the right inspector shows
the **plan stack** for the current session:

- A list of every plan currently in flight, in execution order.
- The foreground plan is highlighted with the accent.
- Selecting a plan switches the inspector to its detail (step status, active agent, etc.) and updates the chat to show that plan's artifacts in the focused context.

## Draft recovery (UX PRD §8.4)

If the connection drops or the operator refreshes, the draft survives. The
mechanism is local (operator's browser) and session-scoped — drafts are
not persisted server-side unless the operator explicitly submits them.

## Block types the chat surface renders

In order of frequency:

1. **User message** — text from the operator. Plain.
2. **Assistant thought** — JIT reasoning from the Planner. Renders as a quieter block than a user message.
3. **EmbeddedPlanCard** — plan forming or in flight.
4. **EmbeddedBidPanel** — auction moment, transient overlay.
5. **AgentOutputStream** — winner's output as it streams.
6. **EmbeddedHITLInline** — plan-tagged intervention.
7. **Status / system** — kernel events, errors, recovery notices.
8. **Audit entry** (for destructive mutations, the success state is the audit-log entry appearing in real time — see `08-keyboard-and-states.md` §States).

## What the chat surface is NOT

- **Not a regular chat.** There is no "send" → "wait for reply" loop. The runtime is a continuous actor.
- **Not a terminal.** The operator does not type commands into the chat input. Commands go through the command palette (`Cmd/Ctrl-K`), the keyboard map, or the console screens.
- **Not a logs view.** Execution logs live in the right inspector when focused on a plan, not in the chat.
