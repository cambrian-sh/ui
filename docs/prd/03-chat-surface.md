# PRD-03 — Chat Surface

**Status:** Frozen v1.0 — locked 2026-06-22.
**Parent PRD:** `web-ui-ux-prd.md` v0.1 · [PRD-01](01-foundation.md) Foundation · [PRD-02](02-shell-and-layout.md) Shell & Layout.
**Sibling PRDs:** [PRD-04](04-plan-work-surface.md) Plan Work Surface · [PRD-05](05-memory-explorer.md) Memory Explorer · [PRD-06](06-operator-console.md) Operator Console · [PRD-07](07-configuration-and-audit.md) Configuration & Audit.
**Source requirements:** `../requirements/web-ui-requirements.md` §2.1 (chat surface MUSTs), §5.1 (UC-1…UC-5), §6 (UX principles 3, 5, 7, 8, 9).
**Source PRD:** `web-ui-prd.md` ID-1, ID-4, ID-5, ID-6, ID-7, ID-9.
**Story coverage:** Story 1 (auth → first session), Story 3 (new session), Story 4 (stream response), Story 5 (plan alongside chat), Story 6 (bids alongside), Story 7 (streamed step output), Story 8 (mid-plan inject), Story 9 (HITL inline), Story 10 (HITL approve/reject/edit inline), Story 12 (session state strip), Story 13 (degraded connection), Story 53 (draft recovery).
**Companion ADRs (all Frozen):** [UI-009](../adr/UI-009-chat-draft-persistence.md) Chat Draft Persistence (localStorage) · [UI-010](../adr/UI-010-embedded-artifact-contract.md) Embedded Artifact Contract (TS union + Zod).

---

## 1. Scope

**In scope.** The chat surface block taxonomy (12 block types); the Linear-convention reverse-chronological flow; the embedded interactive artifacts (PlanCard, BidPanel, AgentOutputStream, HITLInline, ToolCall, MemoryReference, ArtifactCard, SystemNote, ErrorBlock, SkillPanel, EpisodicMemoryCard, ProceduralTemplateCard); the PlanCard as a persistent, growing block in the chat; the inject input as a separate bar above the right inspector; the chat input as a multi-line composer at the bottom of the centre column; draft recovery for both inputs (Story 53); the session state strip below the chat input; the realtime behaviour within the chat (PRD-01 §7 visual grammar applied to chat blocks); the per-block empty/loading/error/success states (PRD-01 §10); the per-block a11y semantics.

**Out of scope.** The right inspector's "plan context" shape (PRD-04). The right inspector's "memory context" shape (PRD-05). The right inspector's "resource / mutation / audit context" shapes (PRD-06, PRD-07). The plans-in-flight global view (PRD-06 §7.2). The graph layout algorithm for the embedded PlanCard's mini-graph (PRD-04 / UI-011). The chat send command's wire format (`op_send_message`, EC-4) — that's a Tauri command; the chat surface consumes it via the projection store (UI-004 / UI-005) and the inject command (`op_inject_correction`, EC-4). The chat input's slash-prefix universal router (ADR-0031 in the kernel; the UI consumes it as a UX pattern but the routing is server-side).

---

## 2. Inherited decisions (cited by number)

**From the UX PRD `web-ui-ux-prd.md` §2:**
- **LD-6 — Chat surface composition.** Three-column shell; centre = chat + embedded interactive artifacts; inject input is its own bar **above the right inspector column** (not inside the chat input); HITL interventions are **plan-tagged**; foreground-plan HITL is inline in the chat, background-plan HITL is pinned to the inspector with a subtle chat badge.
- **LD-10 — Multiple active plans per session.** The chat view treats the **plan stack** as the truth. The inject input has a plan selector (default = foreground plan). HITL is plan-tagged. "Plans in Flight" global screen mirrors the per-session stack.

**From the UX PRD §5.1 (sub-decision from the session index):**
- **Chat follows Linear convention.** Newest at the bottom. The operator's natural action ("type at the bottom") and the plan / step / output blocks (which grow downward as they stream) share the same end. The status pill of the running plan is always at the bottom near the inject input.

**From the in-repo `ui/CONTEXT.md` (PRD-01 §2.5):**
- **EC-1** (Tauri 2), **EC-2** (React 19 + TS + Vite), **EC-3** (Bun), **EC-4** (gRPC in Rust core; chat calls `op_send_message` and `op_inject_correction` via Tauri IPC), **EC-5** (vendored proto at 0047).

**From PRD-01 (Foundation):**
- §4 (visual tokens; the chat surface consumes them — no per-component forks).
- §6 (component inventory; the chat surface composes from `ChatMessage`, `ChatMessageList`, `ChatInput`, `ChatComposer`, `EmbeddedArtifact`, `EmbeddedPlanCard`, `EmbeddedBidPanel`, `EmbeddedHITLInline`, `ChatDraftRecovery`).
- §7 (realtime visual grammar; pulse / trail / status pill applied to chat blocks).
- §8 (a11y contract; the chat is a single live region for the conversation; the inject input is a separate live region for plan interventions).
- §9 (keyboard foundation; `c` focuses the chat input, `i` focuses the inject input, `a/r/e` approve/reject/edit the highlighted HITL).
- §10 (state vocabulary; every chat block has one of the 5 states).
- §11 (forbids; no bespoke styles per block).

---

## 3. The flow (Linear convention)

The chat surface is a vertical, **virtualised**, reverse-chronological list of blocks. Newest at the bottom. The list is virtualised because a long session (a long-running plan, a 200-step memory explorer sweep) can produce hundreds of blocks; the chat must scroll smoothly.

### 3.1 Visual contract

- **New block slides in from below** (≤250 ms in, per PRD-01 §4.4 motion budget).
- **Streaming block grows as it receives tokens.** A growing block does not shift existing blocks; it expands inline at the bottom of the list.
- **The chat does not auto-scroll if the operator has scrolled up to read history.** A small "new activity" affordance appears at the bottom edge; clicking it scrolls to the new block. (The affordance is a `Toast` — PRD-01 §6 Feedback — but it is the only read-side toast in the app, justified because the alternative is missed events.)

### 3.2 Live regions

The chat surface is **a single ARIA live region** with `aria-live="polite"`. The inject input is a separate live region. The session state strip (PRD-03 §10) is a third. This separation lets a screen reader announce new chat content, new inject activity, and state changes independently.

---

## 4. Block taxonomy (12 types)

Every block in the chat flow is one of 12 types. The list is normative; new types go through PRD-01 §6 (add a component to the inventory) + UI-010 (add a new variant to the embedded-artifact contract). Block types:

| # | Type | Shape | Source |
|:--|:-----|:------|:-------|
| 1 | **OperatorMessage** | Text the operator typed. Mono font for code, proportional for prose. Sent timestamp. | Operator input (chat input). |
| 2 | **RuntimeText** | Text the runtime produced (Planner prose, agent prose, system notes). Marked as runtime; never looks like an operator message. | Runtime event stream (PRD-01 §7). |
| 3 | **PlanCard** | A plan forming or in flight. Header (subject, step count, status pill, elapsed time, cost so far, plan id), body (DAG-as-graph or step-list, per operator preference), footer (the inject input). Persistent, growing. | Planner emission + DAG execution events. (PRD-04 owns the work surface; this is the chat-side view.) |
| 4 | **BidPanel** | An auction moment. Transient by default (auto-collapses after the auction resolves); persistent inside the step's card. Shows every qualified candidate with confidence / trust / latency, winner highlighted. | Auctioneer events. |
| 5 | **AgentOutputStream** | Streamed output of the active step. Token-by-token for LLM output, line-by-line for tool output, structured for tool calls. | Active agent's streamed output (PRD-04). |
| 6 | **HITLInline** | Destructive-command / approval intervention. Approve / reject / edit + mandatory reason + confirm-with-consequence bar. Pinned to top until decided. | Kernel `PauseController` (the only source; the UI does not re-detect). |
| 7 | **ArtifactCard** | A non-ephemeral product in the CAS vault. Link + preview. | Artifact write events. |
| 8 | **MemoryReference** | An inline reference to a memory document. Clickable to the memory explorer, scoped to that document (PRD-05). | `memory_query` results. |
| 9 | **ToolCall** | A tool invocation with args + result. Args summarised (Tier-1); result collapsible. Tier-2 disclosure on demand. | Tool execution events. |
| 10 | **SystemNote** | Informational. Kernel connected, instance switched, session paused, lifecycle event. Low visual weight. | System / lifecycle events. |
| 11 | **ErrorBlock** | A runtime error rendered with the kernel's reason verbatim (PRD-01 §10.3). One-line "what to do." Deep link to the relevant console screen. | Error events. |
| 12 | **SkillPanel** / **EpisodicMemoryCard** / **ProceduralTemplateCard** | The first set of "embedded interactive artifacts" beyond the canonical 9. Skill = SKILL.md + bundled grants + scope tags. Episodic = session narrative the Consolidator produced. Procedural = Hippocampus template the Planner chose. | Skill load, episodic write, procedural match. |

### 4.1 Block identity and stability

Each block has a stable id (the kernel-side event id or a derived id). The webview uses the id as the React key; the same id renders the same block. This is what makes the chat resilient to fold replays (UI-005) and event-replay on `RESYNC_REQUIRED`.

### 4.2 Block lifecycle

- **Born** when the first event for the block's id arrives.
- **Growing** while events stream (AgentOutputStream, PlanCard, BidPanel transient).
- **Settled** when the block is complete (HITL decided, ToolCall returned, PlanCard terminal).
- **Pinned** if it is a HITL intervention (LD-6) — pinned to the top of the chat until decided; not subject to the auto-scroll rule.
- **Pruned** only when the session is completed (Story 2: complete a session) or explicitly truncated by the operator (Story 11: resume from a historical checkpoint). The chat is a faithful record of the session; we do not silently drop blocks.

---

## 5. The PlanCard (in the chat)

The PlanCard is the single most important block in the chat flow. It is a **persistent, growing** block that lives in the chat from the moment the Planner emits the plan to the moment the plan completes (or is aborted).

### 5.1 Visual contract

- **Header** — subject, step count, status pill, elapsed time, cost so far, plan id.
- **Body** — toggles between **DAG-as-graph** (default) and **step-list** (per the operator's per-session preference, set in PRD-04 / PRD-06). Read-only; the chat card exists to give the operator the plan in context of the conversation.
- **Footer** — the **inject input** (see §7). The PlanCard and the inject input are visually attached; the PlanCard grows, the inject input stays at the bottom of the PlanCard body.

### 5.2 Plan-tagged

The PlanCard is **plan-tagged** (LD-10). When multiple plans are running, each plan gets its own PlanCard in the chat (and its own entry in the plan stack in the inspector). The chat shows all PlanCards by default in V1; promotion of a background plan to foreground is a separate concern (handled in PRD-04).

### 5.3 Click-to-focus

The chat card is a *view*; the right-inspector plan tab is the *work surface* (PRD-04). Clicking a PlanCard in the chat focuses the plan's tab in the right inspector — the work surface where the operator acts on the plan in detail. The chat card does not duplicate the work surface; it just provides the entry.

---

## 6. The plan stack (in the inspector)

The right inspector's default shape during chat is the **plan stack**: a vertical list of currently executing plans in this session, with the foreground plan expanded and background plans collapsed to a one-line status row each. The foreground plan is highlighted with the accent border.

The plan stack is the entry to the work surface (PRD-04). Each entry is a tab in the inspector. The selected plan's tab renders the full plan work surface: the plan graph or step-list (per the operator's preference), the active step detail, the bids, the agent output stream, the TrustScore, and the mutating actions on the plan. The chat card (§5) and the plan tab are linked: clicking the chat card focuses the tab; acting in the tab updates the chat card.

This PRD owns the *chat-side* and *inspector-side* shells of the plan stack. The detailed plan work surface is PRD-04.

---

## 7. The inject input

A separate input bar, labelled **"Inject into running plan"** (LD-6), with:

- A **plan selector** (default = foreground plan). The selector shows: plan subject, plan id (short), step count, status pill, elapsed time, cost so far. If only one plan is running, the selector is a single badge.
- A text input.
- A "send" affordance and `Cmd/Ctrl-Enter` to submit.
- A small "what this does" tooltip: "Sends a correction into the running plan. The plan may re-plan."

### 7.1 Physical separation

The inject input is **above the right inspector column**, not inside the chat input (LD-6). The chat input and the inject input are physically separated to make the semantics clear: **chat continues the conversation, inject interrupts the plan.**

### 7.2 Behaviour

The inject input calls `op_inject_correction(session_id, instruction, reason)` (EC-4). The `reason` is **mandatory** for a mutating action (product PRD ID-6) — a 16-character minimum is recommended (final minimum lives in PRD-07 audit policy; this PRD enforces a non-empty reason). On submit, the inject input clears and the corresponding PlanCard in the chat pulses (PRD-01 §7) to signal the correction landed.

### 7.3 Plan-tagged scope

When multiple plans are running, the selector lets the operator target a specific plan. The default is the foreground plan. The chat shows a subtle badge in the affected PlanCard's footer when an inject lands in a background plan.

---

## 8. HITL interventions

HITL interventions are rendered **inline in the chat** when they belong to the foreground plan, and **pinned to the inspector** with a subtle chat badge when they belong to a background plan (LD-6). The intervention block contains:

- The intervention's nature (destructive command, approval request, dangerous tool). **Detected by the kernel's `PauseController`; the UI does not re-detect.**
- The surrounding context (the step, the agent, the plan, the proposed action).
- A diff between the proposed action and the action the agent intends (if any).
- Three actions: **approve**, **reject**, **edit**. Approve and reject are single clicks; edit opens a form. Every action requires a **mandatory reason field** (free text, min length 16 chars by default).
- A confirm-with-consequence bar: "Approving will execute the action above. The plan will resume."

The intervention block is **pinned to the top of the chat** (or to the top of the inspector) until the operator decides. It is the only block that breaks the chronological flow (PRD-01 §4.4). Keyboard: `a` approve, `r` reject, `e` edit (PRD-01 §9).

### 8.1 Plan-tagged

HITL interventions are plan-tagged (LD-6 + LD-10). Foreground-plan interventions are inline in the chat AND pinned to the inspector. Background-plan interventions are pinned to the inspector with a subtle chat badge; clicking the badge focuses the inspector's plan tab.

### 8.2 Audit

The approve / reject / edit decisions are audited (PRD-07 §7.13). The reason field is recorded as the audit entry's `reason` (product PRD ID-6).

---

## 9. The chat input

The chat input is a multi-line composer at the bottom of the centre column. It is the **conversation** input, not the inject input. It is physically separate from the inject input (which lives above the inspector) (LD-6).

The chat input supports:

- **Multi-line text.**
- **Code blocks** (mono).
- **Slash-prefixes** (e.g. `/help`, `/sessions`, `/plan`, `/audit`, `/settings`) — the universal input router (kernel ADR-0031; the UI consumes it as a UX pattern, the routing is server-side).
- A "send" affordance and `Enter` to submit (`Shift-Enter` for newline).
- **Draft recovery** (Story 53, PRD-03 §11). If the connection drops or the operator refreshes, the draft survives.

### 9.1 Behaviour

The chat input calls `op_send_message(session_id, text, reason)` (EC-4). The `reason` is optional for a chat message; the operator is not auditing their own conversation, and the chat history is the record. (This is the product PRD ID-6 carve-out: "Reads do not celebrate, mutations are loud." A chat message is a mutation in the technical sense, but the operator's draft + the session event log is its own record; the chat input's `reason` is reserved for a future "annotate this message" follow-on.)

---

## 10. Session state strip (bottom of centre column)

A small strip below the chat input showing: current plan id, current step, active agent, confidence, TrustScore, cost so far, elapsed time. Persists across the session. The same data also appears in the PlanCard footer and in the inspector (PRD-04). The strip is a third live region (alongside the chat live region and the inject live region); the live region updates throttled to once per 250 ms (PRD-01 §4.4 motion budget) so screen readers are not spammed.

---

## 11. Draft recovery (Story 53)

The chat input and the inject input both survive a refresh. The operator's drafts persist across reconnections, restarts, and `RESYNC_REQUIRED`. The persistence is local to the operator's device (UI-009) — it is not audited, not synced, not a kernel-side concern.

### 11.1 What's persisted

- The chat input's current text per session.
- The inject input's current text per plan.
- The last selected plan in the inject input's selector.

### 11.2 What's not persisted

- Slash-prefix command history.
- HITL intervention drafts (these are short-lived; if the operator closes the app mid-decision, the intervention re-appears on next load — the kernel is the source of truth).
- Memory tag editor drafts (PRD-05).

### 11.3 Implementation

Per UI-009 v1.0, drafts persist via **`localStorage`** (standard browser API; cross-frontend portable; zero new dependencies). Keys: `draft:$instanceId:chat:$sessionId` and `draft:$instanceId:inject:$planId`. Data shape: `{ value, updatedAt }`. Writes are debounced (200 ms) and flushed on `blur` and `beforeunload`. The wrapper handles TTL / eviction.

---

## 12. Embedded interactive artifacts

The chat surface accepts **embedded interactive artifacts** — first-class blocks that the runtime can render into the flow. The first set (PRD-01 §6 + this PRD §4):

- **PlanCard** (§5)
- **BidPanel** (§4 type 4)
- **AgentOutputStream** (§4 type 5)
- **HITLInline** (§8)
- **ToolCall** (§4 type 9)
- **MemoryReference** (§4 type 8)
- **ArtifactCard** (§4 type 7)
- **SkillPanel**, **EpisodicMemoryCard**, **ProceduralTemplateCard** (§4 type 12)

These are the V1 artifact types. The contract for the runtime to emit a new artifact type lives in UI-010. The visual vocabulary for an artifact block is the PRD-01 design system (no per-block bespoke styles; PRD-01 §11 forbids).

---

## 13. Realtime within the chat (PRD-01 §7 applied)

- The chat flow is **realtime by default**. A new block slides in from below (≤250 ms in).
- A streaming block grows as it receives tokens. The pulse-and-trail grammar is applied to: a new block arriving, a step transitioning, a bid arriving, an intervention being raised.
- The chat does not auto-scroll if the operator has scrolled up to read history. A small "new activity" affordance appears at the bottom edge; clicking it scrolls to the new block (§3.1).
- The status pill of the running plan is always at the bottom near the inject input (Linear convention).
- The chat input is disabled (with a "kernel is reconnecting…" tooltip) when the connection is in the `Reconnecting` state (PRD-01 §10.3). The inject input is disabled in the same state with a "plan is paused until the kernel reconnects" tooltip.

---

## 14. Open questions (gaps for ADRs)

| # | Question | ADR | Status |
|:--|:---------|:----|:-------|
| 1 | Where do chat drafts and inject drafts persist across refreshes / restarts? (localStorage / IndexedDB / Tauri store plugin / Rust-side state) | [UI-009](../adr/UI-009-chat-draft-persistence.md) | **Draft** |
| 2 | What is the contract for the runtime to emit a new embedded artifact type? (TypeScript discriminated union / JSON Schema / protobuf) | [UI-010](../adr/UI-010-embedded-artifact-contract.md) | **Draft** |

**Not in this PRD's open-questions block:**
- The plan graph layout algorithm (PRD-04 → UI-011).
- The memory graph visualisation (PRD-05 → UI-012).
- The blast-radius computation seam (PRD-05 → UI-013).

---

## 15. Cross-references

- **Parent PRD** — `web-ui-ux-prd.md` §5 (The chat surface), §2.6 (LD-6), §2.10 (LD-10), §2.3 (LD-3 — Linear convention is a sub-decision from LD-3's density+theme, applied to the chat's reverse-chronology).
- **Sibling PRDs** — PRD-02 (centre column + right inspector shell), PRD-04 (right inspector plan context; the work surface behind the PlanCard), PRD-05 (MemoryReference → memory explorer), PRD-06 (the operator console that the slash-prefixes navigate to).
- **Foundation PRD** — PRD-01 §4.4 (motion), §6 (components), §7 (realtime grammar), §8 (a11y), §9 (keyboard), §10 (states), §11 (forbids).
- **In-repo `ui/CONTEXT.md`** — EC-1…EC-5 (Tauri 2, React 19, Bun, gRPC in Rust, vendored proto at 0047).
- **Kernel ADRs** — ADR-0031 (Universal Input Router — the slash-prefixes), ADR-0018 (SubstrateLLMGateway — the streaming path that feeds the AgentOutputStream), ADR-0047 (Operator Transport Plane — the gRPC seam).
- **Companion ADRs** — UI-009, UI-010 (both in this PRD's §14).

---

## 16. Glossary

Definitions of new vocabulary this PRD introduces. For shared terms (Substrate, Handoff, ExecutionPlan, etc.) see `CONTEXT.md` §7. For design-system terms (Pulse, Trail, Status pill, etc.) see PRD-01 §14. For shell terms (Status strip, Hydration contract, Projection store, etc.) see PRD-02 §11.

- **Chat block** — One of the 12 types in §4. The atomic unit of the chat surface.
- **PlanCard** — The persistent, growing block in the chat that represents a plan forming or in flight. The chat-side view; PRD-04 owns the work surface.
- **Plan stack** — The right-inspector's vertical list of currently executing plans in the session. PRD-04 owns the work surface; this PRD owns the shell.
- **Inject input** — The "Inject into running plan" bar above the right inspector. Physically separate from the chat input. Submits via `op_inject_correction`.
- **Chat input** — The multi-line composer at the bottom of the centre column. Submits via `op_send_message`.
- **HITL inline** — A destructive-command / approval intervention rendered inline in the chat (foreground plan) or pinned to the inspector (background plan) with a chat badge.
- **Linear convention** — Newest block at the bottom of the chat. Eye and action at the same end.
- **Draft recovery** — The chat input and the inject input survive a refresh / restart. Per-session, per-plan. UI-009 picks the persistence mechanism.
- **Embedded interactive artifact** — A first-class chat block (the 12 types in §4). The contract for emitting a new type is UI-010.
