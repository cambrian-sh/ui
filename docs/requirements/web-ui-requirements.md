# Cambrian Web UI — Product Requirements

**Status:** Draft v0.1 — requirements only.
**Scope:** This document defines **what** the Web UI must do. It deliberately contains **no technical decisions** (no transport, framework, deployment, or auth choices). Those will be settled in a follow-on document that takes this one as input.
**Audience for this document:** the product owner and the lead engineer, before any code is written.

---

## 1. Purpose

The Cambrian Web UI is a **mission-control** for the Cambrian runtime. It is the primary human surface to the Substrate, the Awareness (Planner), the Metabolism (agents), the Memory engine, and the operator controls. It replaces the deleted TUI's *role* without inheriting the TUI's *form*.

It is **not** a marketing site, a chat client for end users of Cambrian-powered products, or a developer-portal for agent authors. Those are out of scope.

Two product surfaces live inside the same application, separated by mode and by role:

1. **Chat surface** — a human talks to a Cambrian session in natural language. The session may invoke agents, tools, and skills; the human watches the plan form and approve or redirect it.
2. **Operator console** — a developer/operator inspects and steers the system: agents, scopes, tools, skills, MCP connections, procedural templates, memory, sessions in flight, HITL interventions, lifecycle controls, and a lightweight performance read.

Both surfaces share a single mission-control visual language, a single event/transport contract, and a single design system derived from the existing Cambrian brand assets. They differ in default landing view, role, and what the operator is allowed to mutate.

---

## 2. In scope

The UI must cover all of the following. Priority within the list will be fixed in the follow-on technical/UX planning document; here, every item is a **MUST**.

### 2.1 Chat surface

- Create a new session, resume a session by id, list recent sessions.
- Send a natural-language message into a session and stream the agent's response back, token-by-token or step-by-step, however the runtime produces it.
- Display, in real time, the plan the Planner composed: steps, dependencies, status, the active agent, and the streamed output of the active step.
- Allow the operator to **inject an additional prompt mid-execution** ("HIT inject") that is delivered into the running plan, not queued behind it. This is a real-time correction channel, not a chat reply.
- Display, accept, reject, or edit **HITL interventions** (destructive command detection, approval requests) inline in the chat view. Decisions are made on the running plan, not on a separate "approvals" screen.
- Show, alongside the chat, the live state of the session: current step, agent, confidence, TrustScore, cost so far, elapsed time.

### 2.2 Operator console

The operator console is organised into **domains** that mirror the kernel's subsystems. Each domain is a tab/section; each one is a view onto the same data, not a separate app.

1. **Sessions** — list, filter, open, create, pause, resume, complete, and inspect any session. For each session: live plan view, step status, agent output stream, event log, checkpoints, replays.
2. **Plans in flight** — a global view of all currently executing plans across all sessions, with the ability to drill into any of them.
3. **Agents** — registered agents, their genotype (trait, manifest, cognitive fingerprint, scope), live phenotype state (running, crashed, idle), TrustScore and Merit history, recent verification outcomes.
4. **Tools & skills** — browse the kernel-owned tool registry and the system-skill registry. View manifests, schemas, descriptions (Tier-1 and Tier-2 disclosure). For each tool: granted agents, recent invocations, errors, cost.
5. **MCP connections** — list external MCP servers, their connection state, discovered tools, health/reconnect status, and per-server default prices (when priced).
6. **Memory** — explore the LTM store by `DocType` (MnemonicFact, MnemonicScene, EpisodicMemory, AgentProfile, ProceduralTemplate, NegativeEdge, Tool, Skill, …). Filter by scope tag, by session, by time, by activation_strength. Inspect, promote, supersede, or delete memories. View the graph (document_edges) when useful.
7. **Scope manager** — the read/write/promotion rules per agent. View EffectiveScope, DefaultWriteTags, scope history, and k-anonymity promotion logs. Edit scope changes (these are operator actions, audited).
8. **Watch & reactive rules** — list and CRUD WatchConfigs. Inspect the rule, its target streams, last fires, errors.
9. **Lifecycle & consolidation** — trigger consolidation manually, inspect scheduler state, see dormancy/completion events, the Circadian-lifecycle replacement's pending jobs.
10. **Verifier pool** — view verifier composition, recent verification rounds, cross-verification outcomes, surveillance triggers.
11. **Cost & energy** — per-step cost, per-session cost, per-model cost, circuit-breaker states, the LLMProvider health/price ledger. Lightweight, readable, *not* a full observability clone.
12. **Audit & admin** — list of operator-mutating actions (grants, scope changes, approvals, deletions), the source of every mutation, and a path to export.

### 2.3 Memory & resource governance

The UI must let the operator manage the system's knowledge and capability surface:

- **Evaluation tags / scope tags** on memory documents and on system resources (procedural templates, skills, tools). The UI exposes the tag vocabulary in use, lets the operator apply/remove tags, and surfaces the *effect* of a tag change (which agents' EffectiveScope is now widened or narrowed). The underlying scope engine stays in the kernel; the UI is a controller, not the source of truth.
- **New system resources.** The operator can register a new system skill, a new MCP server, and (subject to capability) add a new tool definition through the UI. The kernel still validates and indexes; the UI is a *form* over that.
- **Mutation audit.** Every operator mutation is recorded with actor, target, before/after, and reason. The UI shows this trail and provides a path to export it.

### 2.4 Performance & health (lightweight)

- A simple, readable view of system health: kernel connection state, LTM connection state, in-flight plans, queue depth, circuit breakers, current spend rate. This is **not** a full observability dashboard; it is a status panel that lives in the operator console and links out to the existing telemetry (Langfuse / OTel) for deep dives.
- The status panel must be legible at a glance and **must not become a Grafana clone**.

### 2.5 Realtime

- The chat surface is realtime by definition (streaming response, plan evolution, HITL pop-ups).
- The operator console is also realtime: changes made by the runtime (new documents, agent boot, TrustScore updates, plan state changes) appear in the UI without a manual refresh. The operator does not have to click a "reload" button.
- Realtime updates must be **live**, not polled.

### 2.6 Auth & access

- Authentication is required. The choice of provider/flow is a technical decision and lives in the follow-on document; the **requirement** is that:
  - Unauthenticated users see nothing of operational value.
  - Roles exist: at minimum **Operator** (full console + chat inject) and **Viewer** (read-only). Additional roles may be defined later.
  - Operator-mutating actions are gated to Operator.
  - Chat-injection and HITL decisions are gated to Operator.
  - All auth decisions are auditable.

### 2.7 Design system

- A design system must be created from the existing Cambrian brand assets (logo set under `design/` and `www/public/`). The system defines: color, type, spacing, motion, iconography, component inventory.
- The design system is the single source of truth for visual language across chat surface and operator console. No "two visual styles" in the same app.
- The design system must be token-efficient, accessible (keyboard, contrast, screen reader), and dark-mode-first (operators live in dark UIs).

### 2.8 Deployment & reach

- The UI must be deployable **remotely**, not only on the same host as the kernel. A developer on a laptop must be able to point the UI at a remote Cambrian runtime.
- The UI does not assume a specific OS or kernel version; it is a separate deliverable.

---

## 3. Out of scope

- **A marketing site.** No public landing page, no docs site, no "About Cambrian."
- **A chat product for end users of applications built on Cambrian.** The chat surface here is for operators talking *to* the runtime, not for customers of a Cambrian-powered product.
- **A full observability / tracing UI.** Langfuse and OTel already exist; the UI links to them. A status panel is in scope; a metrics explorer is not.
- **An agent authoring IDE.** The UI does not let you write or test an agent. It surfaces agents that already exist.
- **A marketplace / agent store.** No install-from-catalog flow.
- **Mobile-native apps.** Responsive web on desktop is the target. Tablet is acceptable; phone is best-effort, not a requirement.
- **Internationalisation.** English-only at V1. Strings must be externalised so i18n is a follow-on, but the UI does not ship in multiple languages.

---

## 4. Audiences

| Audience | What they do in the UI | Notes |
|---|---|---|
| **Operator** (developer / technical-enough operator) | The primary user. Full chat + full console. Steers the system in real time. | Will live in the UI for hours. Polish, speed, and keyboard-friendliness matter. |
| **Viewer** (read-only stakeholder) | Watches sessions, memory, and agent state. Cannot mutate. | Lower polish bar; correctness of what they see matters more than density of features. |
| **Auditor / reviewer** | Reads the audit log and inspects operator-mutating actions after the fact. | Probably the same human in the Operator role, in a different mood. Same UI; the audit views must be discoverable. |

There is no "end user" in the chat-surface sense; the chat is operator↔runtime, not customer↔bot.

---

## 5. Use cases (the heart of the document)

Each use case is **a job the operator performs**, not a screen. The follow-on technical/UX document maps jobs to screens and flows.

### 5.1 Chat & steer

1. **UC-1: Open an existing session and continue.** Operator picks a session from the list, sees the prior plan(s), reopens the last one, and continues the conversation.
2. **UC-2: Start a new session from a prompt.** Operator types a prompt, the Planner composes a plan, the operator sees it form, sees bids, sees agents execute, and watches the response stream in.
3. **UC-3: Inject a mid-plan correction.** While a plan is running, the operator types a new instruction that lands *inside* the running plan, not as a new message. The plan continues, possibly with a replan, and the operator sees the effect immediately.
4. **UC-4: Approve / reject / edit a HITL intervention.** The runtime pauses on a destructive action. The operator sees the intervention, can read the surrounding context, and chooses approve / reject / edit (a modified version of the action). The plan resumes.
5. **UC-5: Pause and resume a session.** Operator pauses a running session, walks away, comes back, resumes from a checkpoint (the most recent, or any historical one).

### 5.2 Inspect

6. **UC-6: Watch a live plan across all sessions.** Operator wants to see everything the runtime is doing right now — every in-flight plan, every active step, every agent. One screen, sortable.
7. **UC-7: Inspect an agent's genotype and history.** Operator opens an agent, sees its trait, manifest, TrustScore history, recent verification outcomes, last error, last successful plan.
8. **UC-8: Inspect a tool.** Operator opens a tool, sees its schema, description, danger flags, granted agents, recent invocations, errors, cost.
9. **UC-9: Inspect a skill.** Operator opens a skill, sees its SKILL.md, its bundled grants, its scope tags, where it is loaded.
10. **UC-10: Inspect an MCP connection.** Operator opens an MCP server, sees its connection state, discovered tools, health/reconnect history, default price.
11. **UC-11: Explore memory.** Operator filters the LTM by DocType, scope, time, activation_strength, or session. Opens a document, sees its FACT and SCENE, its graph neighbours, and its provenance. Compares two documents side-by-side. Promotes or deletes a memory.
12. **UC-12: Inspect scope rules.** Operator opens an agent, sees its EffectiveScope, DefaultWriteTags, the caller scope, and the k-anonymity floor at work. Sees the audit log of scope changes.
13. **UC-13: Inspect procedural templates.** Operator opens a template, sees the plan, its hit rate, the runs that produced it, and the agents it typically uses.
14. **UC-14: Inspect verifications.** Operator sees the verifier pool composition, recent rounds, cross-verification outcomes, and the surveillance triggers that fired.

### 5.3 Mutate

15. **UC-15: Tag a memory or resource with an evaluation / scope tag.** Operator selects a document or resource, applies a tag from the vocabulary, and sees the *blast radius* — which agents' EffectiveScope is now affected.
16. **UC-16: Register a new system skill.** Operator fills a form (name, description, instructions, bundled tool grants, scope tags), submits, and the kernel indexes it. The operator sees the new skill appear in the registry and the index.
17. **UC-17: Register a new MCP connection.** Operator provides connection details (command/URL, auth), the UI submits, the connector connects, the discovered tools appear.
18. **UC-18: Adjust an agent's scope or write tags.** Operator opens an agent, edits its scope or DefaultWriteTags, submits, sees the diff in the audit log.
19. **UC-19: Adjust tool grants.** Operator grants or revokes a tool for an agent, sees the effective tool menu update, and the change is auditable.
20. **UC-20: Trigger consolidation.** Operator triggers a manual memory-pressure event or a scoped consolidation, and watches the lifecycle manager's progress.

### 5.4 Health & cost

21. **UC-21: Glance at system health.** Operator opens the app, sees the status panel, knows within two seconds whether anything is wrong, and clicks into the relevant subsystem if it is.
22. **UC-22: Read cost and energy.** Operator sees per-session, per-agent, per-model cost for the current run and the recent history, and the circuit-breaker state of the LLM provider.

### 5.5 Audit

23. **UC-23: Read the audit log.** Operator filters mutations by actor, target, type, time. Each entry shows before/after and a reason field (mandatory on mutating actions).
24. **UC-24: Export the audit log.** Operator exports a slice of the audit log (CSV / JSON) for an external review.

---

## 6. UX principles

These are the rules the design system and every screen must follow. They are derived from the use cases and the audience.

1. **One mission-control visual language.** The chat surface and the operator console share components, color, type, and motion. No second visual style.
2. **Density over decoration.** Operators read dense information. Spacing and grouping do the work that ornamentation usually does. The design is dark-mode-first because that is where operators live.
3. **The plan is the centre of gravity.** When a plan is running, the plan view is always visible. The chat and the console are *around* the plan, not *instead of* it.
4. **Realtime is the default.** Nothing in the UI is a "click to refresh." A state change made by the runtime appears in the UI within one render. Latency budgets for each event class will be defined in the technical document.
5. **Mutations are loud, reads are quiet.** A destructive action (delete a memory, revoke a grant, override a HITL) requires a confirmation that names the consequence. A read does not.
6. **The operator is never the bottleneck.** Every action the operator might want to take during a run is reachable in one click from the relevant panel. Keyboard shortcuts for the top 20 actions will be defined later.
7. **Show the truth, including the ugly.** A crashed agent, a failed plan, a verification disagreement — these are first-class states, not edge cases to be hidden.
8. **No silent failures.** When the UI cannot reach the kernel, it says so plainly and tells the operator what is known. When a mutation fails server-side, the failure is shown with the kernel's reason, not a generic toast.
9. **The runtime's vocabulary is the UI's vocabulary.** The UI uses Cambrian's terms — Substrate, Handoff, ExecutionPlan, Gatekeeper, Auctioneer, TrustScore, EphemeralFact, EpisodicMemory, Scope, etc. The UI does not invent its own naming.
10. **Accessible by construction.** Keyboard, contrast, screen reader, focus order. This is not a polish step; it is in the design system from day one.

---

## 7. Data surfaces the UI must expose

This is the **shape** of what the UI must be able to read and write, listed by the kernel's subsystems. The exact field names and transport will be fixed in the technical document. The list here is the *completeness* requirement: nothing in this list is optional, and nothing outside this list is required for V1.

### 7.1 Read

- **Sessions**: list, by-id, lifecycle (Active/Paused/Dormant/Completed), event log, checkpoints.
- **Plans in flight**: live DAG, per-step status, active agent, streamed output, cost so far, elapsed time.
- **Plans completed**: stored plan, outcomes, replays.
- **Agents**: registry (genotype), live state (phenotype), TrustScore history, Merit history, last verification.
- **Tools**: registry, schema (Tier-1 and Tier-2), grants per agent, recent invocations, errors, cost.
- **Skills**: registry (system skills, agent skills), SKILL.md, bundled grants, scope tags.
- **MCP connections**: servers, connection state, discovered tools, health/reconnect, per-server price.
- **Memory**: documents by DocType, scope tag, session, time, activation_strength; graph neighbours; provenance.
- **Procedural templates**: stored plans, hit rate, ancestry, agent mix.
- **Scope**: per-agent EffectiveScope, DefaultWriteTags, caller scope, k-anonymity floor, history.
- **Watch configs**: list, by-id, last fires, errors.
- **Lifecycle**: scheduler state, pending jobs, last consolidation, dormancy events.
- **Verifier pool**: composition, recent rounds, cross-verification outcomes, surveillance triggers.
- **LLM provider**: per-model health, price, circuit-breaker state, recent acquire outcomes.
- **Audit log**: every operator-mutating action with actor, target, before/after, reason.
- **System status**: kernel up, LTM up, in-flight plans, queue depth, spend rate.

### 7.2 Write (operator-mutating actions)

- Create / pause / resume / complete a session.
- Send a chat message; inject a mid-plan correction.
- Approve / reject / edit a HITL intervention.
- Tag a memory or resource with a scope / evaluation tag.
- Register / update a system skill.
- Register / update / remove an MCP connection.
- Adjust an agent's scope, write tags, or tool grants.
- Trigger a consolidation.
- Record a reason on every mutating action.

### 7.3 Realtime events (the UI must subscribe)

- Plan state changes (step started, finished, failed, replanned).
- Agent state changes (booted, crashed, evicted, TrustScore updated).
- Memory writes (new document, supersede, delete, promotion).
- HITL intervention raised.
- Verifier round outcome.
- Watch config fired.
- Lifecycle event (dormant, completed, pressure).
- LLM provider health change (circuit-breaker open / half-open / closed).
- Audit event.

The list is complete. Anything not in 7.1–7.3 is not required for V1.

---

## 8. Success criteria

V1 is **done** when, on a fresh machine, with the kernel and the UI running:

- An Operator can authenticate, open the app, and see the status panel report green within 5 seconds.
- An Operator can create a session, type a prompt that requires at least one tool and one agent, and watch the plan form, the agents bid, the output stream, and the result land — all in one view.
- An Operator can inject a mid-plan correction and the running plan visibly reorients.
- A HITL intervention is raised, the operator approves/rejects/edits, and the plan resumes, all in the same view.
- An Operator can open an agent, see its TrustScore, see the tools granted to it, change one grant, and see the change reflected in the audit log.
- An Operator can register a new MCP connection through the UI; the discovered tools appear in the registry without a manual refresh.
- An Operator can search the memory store by DocType and scope, open a document, see its graph neighbours, and tag or delete it.
- A Viewer can do everything the Operator can do *except* the mutating actions, and the UI shows the Viewer the same realtime data.
- Every operator-mutating action is in the audit log, with actor, target, before/after, and a reason.
- The UI is responsive (interaction → frame within 100 ms for local interactions; specific realtime-event latency budgets will be set in the technical document).
- The design system is consistent: every component, every screen, every motion is a use of the system, not a one-off.

---

## 9. Open questions for the follow-on documents

These are the questions the **technical** and **UX PRD** documents must answer, deliberately left open here:

1. Transport (gRPC-Web / Connect / sidecar / …) and realtime protocol (WS / SSE / streaming).
2. Deployment shape (single binary, sidecar, browser-only), and how remote access works in practice (tunnel, ingress, agent).
3. Auth provider, role model implementation, session storage.
4. Tech stack for the UI implementation.
5. Build target, packaging, and CI/CD.
6. The latency budget per realtime event class.
7. The exact V1 cut order (vertical slice first, what is the slice, what are the parallel work packages after).
8. Concrete component inventory and the design tokens extracted from the existing brand assets.
9. The first end-to-end demo path that V1 is optimised for.
10. Performance, observability, and testing approach for the UI itself.

---

## 10. Glossary (UI-side, for the record)

The UI uses Cambrian's terms. Definitions live in `CONTEXT.md` §7. The terms the UI surfaces most are:

- Substrate, Handoff, Payload
- ExecutionPlan, Step, Plan
- Planner, Gatekeeper, Auctioneer, Verifier
- Agent (genotype / phenotype), Trait (Cognitive / Model / Daemon), Provisional
- TrustScore, GatekeeperScore, Merit
- Session, Checkpoint, EpisodicMemory
- LTM, MnemonicFact, MnemonicScene, NegativeEdge, ProceduralTemplate
- Scope, EffectiveScope, DefaultWriteTags, k-anonymity
- Tool (System Tool, MCP Tool, Skill), Tier-1 / Tier-2 disclosure
- HITL, Amber Overlay, PauseController
- EventBus, Audit, Consolidation, Lifecycle
- LLM Provider, Circuit Breaker, Acquire, Failover
