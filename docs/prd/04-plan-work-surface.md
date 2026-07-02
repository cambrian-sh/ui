# PRD-04 — Plan Work Surface

**Status:** Frozen v1.0 — locked 2026-06-22.
**Parent PRD:** `web-ui-ux-prd.md` v0.1 · [PRD-01](01-foundation.md) Foundation · [PRD-02](02-shell-and-layout.md) Shell & Layout · [PRD-03](03-chat-surface.md) Chat Surface.
**Sibling PRDs:** [PRD-05](05-memory-explorer.md) Memory Explorer · [PRD-06](06-operator-console.md) Operator Console · [PRD-07](07-configuration-and-audit.md) Configuration & Audit.
**Source requirements:** `../requirements/web-ui-requirements.md` §2.1 (plan view in chat), §2.2.1 (sessions + live plan), §5.1 (UC-1…UC-5), §5.2 (UC-6…UC-14).
**Source PRD:** `web-ui-prd.md` ID-4 (plan is centre of gravity), ID-5 (realtime default), ID-7 (two roles), ID-9 (data plane = kernel's data plane).
**Story coverage:** Story 5 (plan alongside chat), Story 6 (bids), Story 7 (streamed step output), Story 11 (pause/resume from any checkpoint), Story 14 (Plans in Flight global view — owns the entry point; this PRD owns the work surface), Story 15 (sessions list, drill-in), Story 16 (session view: live plan + event log + checkpoints), Story 17 (agents list — this PRD doesn't own it; cross-references PRD-06).
**Companion ADRs (all Frozen):** [UI-011](../adr/UI-011-plan-graph-layout.md) Plan Graph Layout (React Flow + elkjs).

---

## 1. Scope

**In scope.** The **right inspector's plan context** — the work surface that opens when the operator focuses a plan from the chat PlanCard, from the plan stack, or from the global "Plans in Flight" view. The two plan-view modes (DAG-as-graph and step-list, per LD-4); the per-mode rendering pipeline; the active step detail; the BidCard and BidOverlay (transient + persistent); the AgentOutputStream work surface (the inspector-side, distinct from PRD-03's chat-side); the ConfidenceBar and TrustScorePill; the plan-tagged mutating actions (pause, resume, inject, abort); the plan mode toggle (per operator + per session); the multi-plan coordination (LD-10 — the plan stack is the truth).

**Out of scope.** The chat-side PlanCard (PRD-03 §5). The chat-side AgentOutputStream block (PRD-03 §4 type 5). The chat-side BidPanel block (PRD-03 §4 type 4). The plan view's first entry from the chat (PRD-03 §5.3). The plans-in-flight global view (PRD-06 §7.2). The graph visualisation algorithm choice (UI-011 — the open question in this PRD's §14). The cost + energy screen (PRD-06 §7.11). The audit log (PRD-07).

---

## 2. Inherited decisions (cited by number)

**From the UX PRD `web-ui-ux-prd.md` §2:**
- **LD-4 — Plan view.** Two modes, togglable per operator and per session: **DAG-as-graph** (default) and **step-list**. Stable layout, virtualised list. Bids are transient overlay on the active step during the auction moment + persistent card inside the step's details.
- **LD-6 — Chat surface composition.** The right inspector is "context-shaped"; the plan context is one of the shapes (PRD-02 §4.4). The chat card (§5.3 of PRD-03) and the plan tab are linked: clicking the chat card focuses the tab; acting in the tab updates the chat card.
- **LD-10 — Multiple active plans per session.** The chat view treats the plan stack as the truth. The right inspector's "plan context" shape carries a mini graph, step status, bids, agent output stream, and TrustScore (sub-decision from the session index).

**From PRD-01 (Foundation):**
- §4 (visual tokens; the work surface consumes them).
- §6 (component inventory; this PRD composes from `PlanGraph`, `PlanGraphNode`, `PlanGraphEdge`, `PlanStepList`, `PlanStepRow`, `StepDetail`, `BidCard`, `BidOverlay`, `AgentOutputStream`, `AgentOutputLine`, `ConfidenceBar`, `TrustScorePill`).
- §7 (realtime grammar; pulse on step transitions, trail on new bids, status pill on durable step state).
- §9 (keyboard; `a`/`r`/`e` for HITL inline, `j`/`k` for list nav, `Enter` to open, `Esc` to close).
- §10 (state vocabulary; the work surface has empty / loading / error / success / audit states per the per-step data).
- §11 (forbids; no bespoke per-step styles).

**From PRD-02 (Shell & Layout):**
- §4.1 (nav rail; the "Plans in Flight" entry is the global entry point).
- §6 (status strip; the in-flight plans count + queue depth fields are the at-a-glance read).
- §3.1 (panel collapse/expand; the right inspector collapses at < 1280 px viewport).

**From PRD-03 (Chat Surface):**
- §5 (the PlanCard in the chat; the work surface is the destination when the operator clicks the card).
- §6 (the plan stack in the inspector; this PRD owns the work surface behind each stack entry).

**From the in-repo `ui/CONTEXT.md` (PRD-01 §2.5):**
- **EC-1** (Tauri 2), **EC-2** (React 19 + TS + Vite), **EC-3** (Bun), **EC-4** (gRPC in Rust core; the work surface reads from the projection store, which is folded from `kernel://state`), **EC-5** (vendored proto at 0047).

---

## 3. The work surface

The plan context is the right inspector's shape when the operator is focused on a plan. The entry points are:

1. **From the chat PlanCard** — clicking the card focuses the plan's tab in the right inspector (PRD-03 §5.3).
2. **From the plan stack** — clicking a stack entry focuses the corresponding tab.
3. **From the global "Plans in Flight" view** — clicking a row in PRD-06 §7.2 focuses the plan's tab in the right inspector. The centre column switches to the plan context (the work surface is rendered full-width in the centre).

The work surface itself is the same shape regardless of entry point: the plan view (DAG or step-list, per the operator's per-session preference) + the active step detail + the bid panel + the agent output stream + the plan-tagged actions. The visual grammar is PRD-01 §7 applied to steps (status pill = durable state, pulse = step transition, trail = new bid).

### 3.1 Plan view mode toggle

The toggle (DAG-as-graph ↔ step-list) is per operator + per session (LD-4). The default is DAG-as-graph. The toggle is a button in the plan view's toolbar; `Cmd/Ctrl-G` switches the mode (added to the keyboard map in PRD-01 §9 in a future revision; the V1 commit is the click target).

### 3.2 Plan mode preference persistence

The DAG / step-list preference is persisted per operator + per session in the operator's local profile (PRD-07). The shell owns the read/write; the plan view consumes.

---

## 4. DAG-as-graph mode (default)

The DAG-as-graph mode renders the plan as a node-and-edge graph. The layout is **deterministic and stable** (LD-4: "steps do not 'jump' on update"). The graph is **virtualised** for plans with many steps (200+ steps in a long-running plan are possible).

### 4.1 Nodes (`PlanGraphNode`)

Each step is a node. A node carries:
- **Step id** (short, mono).
- **Step query** (truncated; full text on hover or focus).
- **Status pill** (per PRD-01 §6: ok / warn / err / info / pulse / muted).
- **Active step indicator** (pulse per PRD-01 §7; the active step is the one currently executing).
- **Bids badge** (count of bidders during the auction; the transient BidOverlay opens on click).
- **Output stream peek** (the last 1–2 lines of the agent output stream, mono, muted).
- **TrustScore pill** (the winning agent's TrustScore; PRD-01 §6).

### 4.2 Edges (`PlanGraphEdge`)

Each dependency is a directed edge. The active step's outgoing edges are highlighted (the "ignition" — the moments the step's output propagates to the dependents, per GWT). Edge highlighting follows PRD-01 §7 realtime grammar: pulse on the edge that just ignited, trail on the next.

### 4.3 Layout

The layout algorithm is the open question in UI-011. The constraints:
- **Deterministic** (LD-4) — the same plan always lays out the same.
- **Stable** (LD-4) — re-renders do not "jump" steps.
- **Top-down or left-right** (operator preference; default top-down).
- **Virtualised** — only the visible viewport renders; off-screen nodes are not in the DOM.
- **Performance** — a 200-step plan renders in < 100 ms; subsequent updates in < 16 ms (per PRD-01 §4.4 motion budget).

### 4.4 Interaction

- **Click a node** → focuses the step (opens the step detail).
- **Hover a node** → shows the full step query in a tooltip.
- **Click an edge** → shows the dependency relationship (from-step / to-step / data passed).
- **Pan + zoom** — the graph is pannable and zoomable. `+` / `-` keyboard shortcuts zoom; `0` resets.

---

## 5. Step-list mode

A vertical list of steps with status, the selected step expanded to show bids, agent output, and confidence. The list is **virtualised** (LD-4). The list is the canonical accessible representation of the plan (per PRD-01 §8 a11y contract; the graph is decorative).

### 5.1 Rows (`PlanStepRow`)

Each row carries:
- **Step index** (mono, left-aligned).
- **Step query** (truncated; full text on hover or focus).
- **Status pill**.
- **Active step indicator** (pulse).
- **Bids badge** (count + click to expand).
- **Output stream peek** (muted).

### 5.2 Selection

`j` / `k` move the selection (PRD-01 §9). `Enter` opens the focused step's detail. The detail expands inline; the graph / list remains visible above. `Esc` collapses the detail.

### 5.3 Step detail (`StepDetail`)

The expanded step carries:
- The full step query.
- The bids (the persistent card, not the transient overlay).
- The agent output stream (full, scrollable).
- The ConfidenceBar (the agent's bid confidence; PRD-01 §6).
- The TrustScorePill.
- The mutating actions on the step (e.g. abort, retry, edit the query — operator-only; PRD-06 §7.3 patterns).

---

## 6. BidCard and BidOverlay

Bids are **transient overlay + persistent card** (LD-4). The BidOverlay is the transient surface during the auction moment (≤ 5 s, auto-collapses when the auction resolves). The BidCard is the persistent record inside the step's detail.

### 6.1 BidOverlay

A floating panel over the active step's node (in DAG mode) or row (in step-list mode). Shows every qualified candidate with:
- Agent id (mono, short).
- Confidence (numeric + bar).
- TrustScore pill.
- Normalised latency.
- The winner highlighted with the accent border.

The BidOverlay pulses (PRD-01 §7) on each new bid; collapses to a "winner: <agent id>" pill after the auction resolves. Click on the overlay opens the step detail.

### 6.2 BidCard

Inside the step detail, the BidCard is the persistent record: every qualified candidate, the winner, the resolved confidence, the resolved latency. The card is the audit surface for "who bid on this step" — it is the operator's view of the auction's outcome.

---

## 7. AgentOutputStream (work surface)

The work-surface AgentOutputStream is the **full, scrollable** view of the active step's output. It is the same data as the chat-side stream (PRD-03 §4 type 5) but rendered into a dedicated panel: a vertical list of `AgentOutputLine` rows, with the line type pill (token / tool-call / tool-result / agent-message / error), the line content, and the timestamp.

### 7.1 Token stream

For LLM output, the stream is token-by-token. The line is the current token, mono. A "copy" affordance per line; a "copy all" affordance in the panel header.

### 7.2 Tool call / tool result

For tool output, the stream is structured. The line carries the tool id, the args (Tier-1 summary; Tier-2 on demand), the result (collapsible), the latency, the cost. A "view in console" affordance opens the tool's detail in the operator console (PRD-06 §7.4).

### 7.3 Live-only

Per EC-4 + the in-repo `ui/src-tauri/CONTEXT.md`, the `kernel://token` lane is live-only — never replayed. The work-surface AgentOutputStream reflects this: on `RESYNC_REQUIRED`, the stream shows the live events from the next fold onward; past tokens are not re-rendered. The plan-step detail carries the persisted record (the `metadata` for the step); the stream is the live view.

---

## 8. ConfidenceBar and TrustScorePill

- **ConfidenceBar** — a horizontal bar with the agent's bid confidence (0.0–1.0). The bar's fill is the brand accent; the background is the surface token. Mono numeric label. The bar animates on value change (PRD-01 §4.4 motion budget).
- **TrustScorePill** — a pill with the agent's TrustScore (EWMA over verifier_score / bid_confidence, per kernel ADR-0001). The pill's colour reflects the score: ok / warn / err (per PRD-01 §6 status colours).

Both are PRD-01 components; consumed by the work surface, the plan stack, the agents list (PRD-06), and the verifier pool (PRD-06 §7.10).

---

## 9. Plan-tagged mutating actions (operator-only)

The work surface exposes mutating actions on the focused plan. The actions are plan-tagged (LD-10): they target the specific plan the operator is focused on, not the session as a whole.

- **Pause plan** — `op_pause_session(session_id, reason)` (EC-4). Reason is mandatory (product PRD ID-6).
- **Resume plan** — `op_resume_session(session_id, reason)`. Reason is mandatory.
- **Inject correction** — the same action as the inject input (PRD-03 §7). The work surface exposes the inject as a button (in addition to the inject input's bar).
- **Abort plan** — the operator can abort a plan in flight. Reason is mandatory; the confirm-with-consequence bar names the consequence ("Aborting this plan will discard 3 step results and free the agents. The plan cannot be resumed from this point."). Audited.
- **Retry step** — retry a failed step (operator-only). Reason is mandatory. The plan re-runs the step; downstream steps re-evaluate.

All actions are server-side enforced (product PRD ID-7); the UI hides them for Viewer (not just disabled, per PRD-02 §7.2). All actions are audited (PRD-07).

---

## 10. Multi-plan coordination (LD-10)

The work surface must handle multiple plans running in one session. The plan stack (PRD-03 §6) is the entry; the work surface is one tab per stack entry. Switching between tabs is fast; the data is loaded from the projection store (no fetch, no spinner).

### 10.1 Foreground plan

The foreground plan is the one rendered in the chat's main PlanCard (PRD-03 §5). The right inspector's plan context is the foreground plan by default; the operator can promote a background plan to foreground (PRD-03 §5.2 — a UI affordance, no semantic change to the chat in V1).

### 10.2 Background plan intervention

When a background plan raises a HITL intervention, the intervention is pinned to the inspector (LD-6) and a subtle badge appears in the chat. Clicking the badge focuses the inspector's tab for that plan; the work surface opens to the intervention block. The work surface for a background plan is otherwise identical to the foreground plan's work surface.

---

## 11. Empty / loading / error / success states (PRD-01 §10)

- **Empty** — the plan view's empty state is rare (a plan with no steps). The empty illustration + "No steps in this plan" + a deep link to the Planner's prompt (Story 5).
- **Loading** — skeleton (PRD-01 §10.2). The skeleton uses `bg/skeleton` + the 1.5 s shimmer. Max skeleton time 5 s; then the empty state takes over with a "we couldn't load this; retry" affordance.
- **Error** — the kernel's reason verbatim (PRD-01 §10.3). One-line "what to do" + deep link to the plans-in-flight global view (PRD-06 §7.2).
- **Success** — a mutating action's success state is the audit-log entry appearing in real time (PRD-07). A non-destructive mutation (e.g. promote a background plan) shows a 3 s confirmation toast.
- **Audit** — every action on the work surface is audited (PRD-07).

---

## 12. Keyboard

The work surface consumes the keyboard map from PRD-01 §9:

- `j` / `k` — next / previous step in the step-list mode.
- `Enter` — open the focused step's detail.
- `Esc` — close the step detail.
- `a` / `r` / `e` — approve / reject / edit the highlighted HITL (PRD-03 §8).
- `1`…`9` — jump to the nth plan in the Plans in Flight view (only when that view is focused, not the work surface).
- `+` / `-` — zoom in / out on the graph.
- `0` — reset the graph zoom.
- `Cmd/Ctrl-G` — toggle plan view mode (DAG ↔ step-list).

The work surface is the destination for `Enter` from the plan stack or the Plans in Flight view; it is the source of `j` / `k` / `Enter` for the step-list.

---

## 13. Realtime within the work surface

The work surface is **realtime** (product PRD ID-5). The fold (UI-005) updates the projection store; the work surface's Zustand selectors (UI-004) re-render the changed rows / nodes only. The realtime grammar (PRD-01 §7) is applied to:

- A step transitioning (pulse on the node / row, trail on the next dependent edge).
- A bid arriving (transient BidOverlay opens; pulses on each bid).
- An agent output token arriving (the AgentOutputStream row pulses).
- A HITL intervention being raised (the intervention block pins itself; PRD-03 §8).

---

## 14. Open questions (gaps for ADRs)

| # | Question | ADR | Status |
|:--|:---------|:----|:-------|
| 1 | Which graph layout library do we use for the DAG-as-graph mode? (dagre / elkjs / cytoscape / React Flow / custom) | [UI-011](../adr/UI-011-plan-graph-layout.md) | **Draft** |

**Not in this PRD's open-questions block:**
- The memory graph visualisation (PRD-05 → UI-012).
- The blast-radius computation seam (PRD-05 → UI-013).
- The cost-panel vs metrics-explorer decision (PRD-06 → UI-014).
- The config schema contract (PRD-07 → UI-015).
- The audit export format (PRD-07 → UI-016).
- The auth provider (PRD-07 → UI-017).

---

## 15. Cross-references

- **Parent PRD** — `web-ui-ux-prd.md` §6 (The right inspector), §2.4 (LD-4), §2.6 (LD-6), §2.10 (LD-10).
- **Sibling PRDs** — PRD-03 (chat PlanCard + chat AgentOutputStream + chat BidPanel), PRD-05 (MemoryReference → memory explorer), PRD-06 (Plans in Flight global view, agents, tools, cost), PRD-07 (audit + reason field + role gating + config).
- **Foundation PRD** — PRD-01 §4.4 (motion), §6 (components), §7 (realtime), §8 (a11y), §9 (keyboard), §10 (states), §11 (forbids).
- **In-repo `ui/CONTEXT.md`** — EC-1…EC-5 (Tauri 2, React 19, Bun, gRPC in Rust, vendored proto at 0047).
- **In-repo `ui/src-tauri/CONTEXT.md`** — full transport contract; the work surface reads from the projection store (UI-005).
- **Kernel ADRs** — ADR-0001 (Gatekeeper + Merit, source of TrustScore), ADR-0005 (SelfHealing — the retry step action), ADR-0010 (ReplanHandler — the abort plan action), ADR-0013 (Mid-execution semantic checkpoint — the H1 gate that triggers replan), ADR-0018 (SubstrateLLMGateway — the streaming path that feeds the AgentOutputStream), ADR-0037 (Central-Executive Planner — the proposed alternative to the auction; UI is forward-compatible), ADR-0047 (Operator Transport Plane).
- **Companion ADRs** — UI-011 (in this PRD's §14).

---

## 16. Glossary

Definitions of new vocabulary this PRD introduces. For shared terms (Substrate, Handoff, ExecutionPlan, etc.) see `CONTEXT.md` §7. For design-system terms (Pulse, Trail, Status pill, etc.) see PRD-01 §14. For shell terms (Status strip, Projection store, etc.) see PRD-02 §11. For chat terms (PlanCard, Plan stack, Inject input, HITL inline, etc.) see PRD-03 §16.

- **Work surface** — The right inspector's plan context shape. The destination when the operator focuses a plan. The detailed view that the chat's PlanCard points at.
- **DAG-as-graph mode** — One of two plan view modes. A node-and-edge graph with stable layout, virtualised, pannable + zoomable. Default.
- **Step-list mode** — The other plan view mode. A vertical virtualised list of steps. The canonical accessible representation.
- **BidOverlay** — The transient floating panel over the active step during the auction moment. Auto-collapses when the auction resolves.
- **BidCard** — The persistent card inside the step detail. The audit surface for "who bid on this step."
- **AgentOutputStream (work surface)** — The full, scrollable view of the active step's output. Distinct from the chat-side stream (which is a block in the chat flow).
- **ConfidenceBar** — A horizontal bar with the agent's bid confidence (0.0–1.0). PRD-01 component.
- **TrustScorePill** — A pill with the agent's TrustScore. Colour reflects the score.
- **Plan-tagged action** — A mutating action that targets a specific plan. Pause / resume / inject / abort / retry. Operator-only. Audited.
