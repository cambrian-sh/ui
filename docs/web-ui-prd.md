# Cambrian Web UI — Product Requirements Document (PRD)

**Source:** `docs/requirements/web-ui-requirements.md` (v0.1)
**Status:** Draft v0.1 — for review.
**Scope of this document:** This PRD converts the requirements document into a product-architecture document. It defines **what the product is**, **what flows exist**, **what the system promises**, and **what it refuses to do**. It deliberately contains **no technical decisions** (no transport, framework, deployment, or auth provider choice). Those live in a follow-on technical document that consumes this PRD as input.
**Vocabulary source:** `CONTEXT.md` §7 (Cambrian domain glossary) and the data-surface list in §7 of the requirements document.

---

## Problem Statement

Cambrian's runtime — a deep-kernel substrate coordinating an LLM-aware Planner, an auction-based market of cognitive agents, a system-tool executor, an MCP connector, a scoped LTM, a verification loop, and lifecycle/consolidation workers — has no human surface. The TUI that once filled that role was deleted (ADR-0030, 2026-06-01). Today the only ways to interact with a running Cambrian are:

- direct gRPC calls against the Substrate, by hand,
- a small operator HTTP API for a handful of administrative actions (grants, scope, write tags, watch configs, consolidation trigger),
- and logs.

The operators of a Cambrian deployment (the developers and technical operators who run, debug, and steer the system) cannot:

- watch a plan form and execute in real time,
- see what an agent is doing *right now*,
- inject a correction into a running plan,
- approve a HITL intervention in the same surface they were watching the plan in,
- browse the LTM by `DocType`, scope, or session,
- inspect a tool, skill, MCP connection, or procedural template without going to the source code or the database,
- adjust an agent's scope, write tags, or tool grants and see the audit trail of the change,
- register a new MCP server or a new system skill without restarting the kernel,
- glance at the system's health, cost, and circuit-breaker state in one place.

This is not a polish problem; it is an operational problem. The runtime is observable only to its own logs, and steerable only by hand-crafted gRPC. As the runtime grows (memory engine, episodic memory, procedural templates, scope engine, MCP tools, skills, the proposed Central-Executive Planner, the proposed unified deliberation loop), the gap between "the runtime is doing something" and "I can see and steer what it is doing" widens.

The Cambrian Web UI is the product that closes that gap. It is a mission-control for the runtime — one application, two surfaces (chat + operator console), one design system, one realtime data plane, one audit story.

---

## Solution

A single browser application, called the **Cambrian Web UI** (working title), provides:

1. **A chat surface** in which a Cambrian session is created, prompted, watched, and steered. The operator sees the Planner's plan form, sees bids from agents, watches steps execute, sees the streamed output, and can inject mid-plan corrections or resolve HITL interventions inline.

2. **An operator console** organised by kernel subsystem (sessions, plans in flight, agents, tools, skills, MCP, memory, scope, watch rules, lifecycle, verifier pool, cost, audit). Every read is realtime; every mutating action is auditable.

3. **A unified design system** derived from the existing Cambrian brand assets under `design/` and `www/public/`. The system is dark-mode-first, dense, keyboard-friendly, and uses Cambrian's vocabulary as its own.

4. **Two roles, one application.** Operator (full surface, including mutating actions) and Viewer (read-only). The same app, the same realtime data, the same components, gated by role.

5. **A deployment story that allows remote use.** A developer on a laptop can point the UI at a Cambrian runtime running elsewhere and have the same experience as running it locally.

The product does **not**:

- become a marketing site, end-user chat, agent IDE, marketplace, or full observability clone.
- speak a different vocabulary from the runtime.
- replace the kernel's hexagonal architecture: it is a controller over the kernel's existing boundary, not a back door into it.
- hide failures. Crashed agents, failed plans, verification disagreements, and unreachable kernels are first-class states.

The V1 demo path is: **Operator authenticates → opens the app → sees green status → creates a session → types a prompt that requires at least one tool and one agent → watches the plan form, sees bids, sees the active agent, sees output stream → injects a mid-plan correction → resolves a HITL intervention → opens the memory explorer and tags a document → opens the audit log and sees every mutation they made — all without leaving the app, all in realtime.**

---

## User Stories

The stories are organised by the audiences defined in the requirements document. The numbering is stable so future documents can refer to stories by id.

### Chat & steer (Operator)

1. As an **Operator**, I want to authenticate once at app start, so that every subsequent action is in my name and auditable.
2. As an **Operator**, I want to see a list of recent sessions with their state (Active / Paused / Dormant / Completed) and last activity, so that I can pick up where I left off.
3. As an **Operator**, I want to create a new session with a title and an initial prompt, so that the runtime has a place to put the work.
4. As an **Operator**, I want to type a natural-language prompt into a session and see the response stream in step by step, so that the runtime feels live, not batch.
5. As an **Operator**, I want to see the **ExecutionPlan** the Planner composed (steps, dependencies, status, the active step, the active agent) **alongside the chat**, so that the plan and the response are one experience, not two.
6. As an **Operator**, I want to see the bids each Gatekeeper-qualified candidate made in the latest auction, with confidence / trust / latency, so that I understand who is competing and who won.
7. As an **Operator**, I want to see the streamed output of the active step, formatted and colour-coded by event class (LLM token, tool call, tool result, agent message, error), so that I can read the run like a log.
8. As an **Operator**, I want to **inject** a new instruction into a running plan, so that I can correct the runtime mid-execution without aborting the run.
9. As an **Operator**, I want to be notified, inline in the chat view, when a **HITL intervention** is raised (destructive command, approval request, dangerous tool), with enough surrounding context to make a decision.
10. As an **Operator**, I want to **approve, reject, or edit** a HITL intervention without leaving the chat, and have the plan resume immediately, so that the decision is one click from where I was watching the plan.
11. As an **Operator**, I want to **pause** a running session, walk away, and **resume** from any historical checkpoint (not just the latest), so that I can branch a session or roll it back.
12. As an **Operator**, I want to see the live state of the session as a small always-visible strip: current step, active agent, confidence, TrustScore, cost so far, elapsed time.
13. As an **Operator**, I want the chat surface to behave correctly when the kernel is unreachable: clearly show the disconnection, surface what is known, and recover automatically when the kernel comes back.

### Inspect — operator console (Operator & Viewer)

14. As an **Operator** (and a **Viewer**), I want a **Plans in Flight** screen that shows every currently executing plan across every session, with step status and active agent, so that I can see the system as a whole at a glance.
15. As an **Operator**, I want a **Sessions** screen that lists all sessions (filterable by state, time, agent, and free text), and lets me open, pause, resume, or complete one.
16. As an **Operator**, I want to open a session and see, in one view, its live plan, its event log, its checkpoints, and its outputs.
17. As an **Operator**, I want an **Agents** screen that lists every registered agent with its trait (Cognitive / Model / Daemon), its scope, its TrustScore, and its current state (running / idle / crashed / evicted).
18. As an **Operator**, I want to open an agent and see its **genotype** (manifest, cognitive fingerprint, scope) and its **history** (TrustScore EWMA, recent verification outcomes, last error, last successful plan).
19. As an **Operator**, I want a **Tools** screen that lists every registered system tool with its schema (Tier-1 summary by default, Tier-2 full spec on demand), the agents it is granted to, recent invocations, errors, and cost.
20. As an **Operator**, I want a **Skills** screen that lists every system skill and every agent skill, shows the SKILL.md body, the bundled tool grants, the scope tags, and where the skill is loaded.
21. As an **Operator**, I want an **MCP** screen that lists every external MCP server, its connection state, its discovered tools, its health/reconnect history, and its default price.
22. As an **Operator**, I want a **Memory** screen that lets me filter the LTM by `DocType` (MnemonicFact / MnemonicScene / EpisodicMemory / AgentProfile / ProceduralTemplate / NegativeEdge / Tool / Skill), by scope tag, by session, by time, and by `activation_strength`.
23. As an **Operator**, I want to open a memory document and see its FACT, its SCENE, its graph neighbours (the `document_edges` graph), and its provenance.
24. As an **Operator**, I want to **compare two memory documents side-by-side** (similarity, scope, provenance), so that I can decide whether to keep, merge, or supersede.
25. As an **Operator**, I want a **Scope** screen that shows, for a given agent, its `EffectiveScope`, its `DefaultWriteTags`, its caller scope, the k-anonymity floor, and the audit history of scope changes.
26. As an **Operator**, I want a **Watch** screen that lists every WatchConfig with its rule, its target streams, its last fires, and its errors, and lets me create / update / delete a rule.
27. As an **Operator**, I want a **Lifecycle** screen that shows the scheduler state, pending jobs, last consolidation, dormancy events, and lets me trigger a manual consolidation.
28. As an **Operator**, I want a **Verifier** screen that shows the verifier pool composition, recent rounds, cross-verification outcomes, and the surveillance triggers that fired.
29. As an **Operator**, I want a **Cost & Energy** screen that shows per-step, per-session, per-agent, and per-model cost, plus the LLM provider's circuit-breaker state and price ledger, and links out to Langfuse / OTel for deep dives.

### Mutate (Operator only)

30. As an **Operator**, I want to **tag a memory document or system resource** with a scope / evaluation tag from the existing vocabulary, and see the *blast radius* — which agents' `EffectiveScope` is now widened or narrowed, and which `EffectiveForCaller` results would change.
31. As an **Operator**, I want to **register a new system skill** through a form (name, description, instructions, bundled tool grants, scope tags), submit, and see the new skill appear in the registry and the memory index without a kernel restart.
32. As an **Operator**, I want to **register a new MCP connection** through a form (command / URL, auth), submit, see the connection attempt, the discovered tools, and the resulting change in the registry — all without a kernel restart.
33. As an **Operator**, I want to **adjust an agent's scope or write tags** through a form, submit with a mandatory reason, and see the diff in the audit log and the resulting `EffectiveScope` change.
34. As an **Operator**, I want to **grant or revoke a tool for an agent** through a form, submit with a reason, and see the effective tool menu update and the change audited.
35. As an **Operator**, I want to **trigger a manual consolidation** (full or scoped) and watch the lifecycle manager's progress.
36. As an **Operator**, I want **every mutating action to require a confirmation that names its consequence**, so that I cannot delete a memory or revoke a grant by accident.
37. As an **Operator**, I want every mutating action to be **recorded with actor, target, before / after, timestamp, and a reason** that I provide.
38. As an **Operator**, I want to **bulk-tag or bulk-supersede** a selection of memory documents, with a single confirmation and a single audit entry, when the operation is conceptually one action.

### Health, audit, and resilience

39. As an **Operator**, I want a **status panel** on every screen (or a persistent strip) that shows kernel connection, LTM connection, in-flight plans, queue depth, circuit-breaker state, and current spend rate — legible at a glance.
40. As an **Operator**, I want a single **Health** screen that summarises the same, with one-click drill-downs into the relevant subsystem.
41. As an **Operator**, I want an **Audit** screen that lists every operator-mutating action with filter by actor, target, type, and time, and shows the before/after diff and the reason.
42. As an **Operator**, I want to **export a slice of the audit log** (CSV / JSON) for external review.
43. As an **Operator**, I want **realtime updates everywhere**, with no "click to refresh" anywhere in the app — a state change made by the runtime must appear in the UI without my intervention.
44. As an **Operator**, I want **the kernel's vocabulary on the UI** — Substrate, Handoff, ExecutionPlan, Gatekeeper, Auctioneer, TrustScore, Scope, MnemonicFact, EpisodicMemory, etc. — so that the UI and the runtime are the same world.
45. As an **Operator**, I want **keyboard shortcuts** for the top 20 actions, so that I can live in the app without leaving the keyboard.
46. As an **Operator**, I want the app to be **legible, navigable, and operable by keyboard alone**, with a sensible focus order and visible focus rings.
47. As an **Operator**, I want the app to be **dark-mode-first** because that is where I live; light mode is a follow-on, not a V1 requirement.
48. As an **Operator**, I want the app to **explain its own failure** — when a mutation fails server-side, show the kernel's reason, not a generic toast.
49. As a **Viewer**, I want to see exactly what the Operator sees, but every mutating action is hidden / disabled for me.
50. As a **Viewer**, I want to be able to **follow a running plan live** in read-only, including bids, step output, and HITL interventions (just not decide on them).
51. As an **Auditor / reviewer**, I want the audit log to be discoverable from the main navigation, and every entry to deep-link back to the target it affected (the agent, the tool grant, the memory document, the skill, the MCP server).
52. As an **Operator** connecting to a **remote** Cambrian runtime, I want the same experience as connecting to a local one, so that I can develop on my laptop and operate a production kernel.
53. As an **Operator** whose session is interrupted, I want to **recover gracefully** — drafts, in-flight messages, and pending approvals survive a refresh, and the realtime stream reconnects without my intervention.

---

## Implementation Decisions (product-architecture)

These are decisions about the **product**, not the **stack**. They will be enforced by every follow-on technical document; they exist here so that the technical decisions cannot accidentally violate the product.

### ID-1: One application, two surfaces, one design system.

The chat surface and the operator console are **one web application**, with two modes, one navigation, one design system, one realtime data plane, one audit story. They are not two separate products glued together. They are not two "skins" of the same backend. They are one product that opens onto two different default views, with role gating.

### ID-2: The runtime's vocabulary is the UI's vocabulary.

The UI uses Cambrian's domain terms (Substrate, Handoff, ExecutionPlan, Step, Gatekeeper, Auctioneer, Verifier, TrustScore, GatekeeperScore, MnemonicFact, MnemonicScene, EpisodicMemory, ProceduralTemplate, EffectiveScope, DefaultWriteTags, HITL, Amber Overlay, PauseController, LLM Provider, Circuit Breaker, Acquire, EventBus, Consolidation, Lifecycle, EpisodicMemory, etc.). The UI does not invent its own names for these concepts, does not "translate" them into a more colloquial register, and does not expose them under multiple names. The glossary in §10 of the requirements document is normative.

### ID-3: The UI is a controller over the kernel's existing boundary, not a back door.

The UI mutates the runtime only through the kernel's documented operator surface (the existing `POST /v1/admin/...` HTTP endpoints, the gRPC API, the `EventBus` for reads, and any operator-plane RPCs the kernel exposes for chat/memory/mutation). The UI does not bypass the kernel, does not write directly to Postgres or BBolt, and does not introduce a parallel routing layer. The Zero-Hardcode Rule (routing is the LLM's job, never Go conditionals) and the hexagonal separation (kernel is the only composition root) are constraints the UI respects, even though the UI is outside the kernel.

### ID-4: The plan is the centre of gravity.

When a session has a running plan, the **plan view is always visible**. The chat is *around* the plan, not *instead of* it. The operator console is *anchored on* the plan state (Plans in Flight is a first-class screen; every other console screen can deep-link to the plan that produced a given artefact).

### ID-5: Realtime is the default, with no manual refresh.

No part of the UI is a "click to refresh" surface. State changes made by the runtime (new documents, agent boot/evict, TrustScore updates, plan state changes, HITL interventions, lifecycle events) appear in the UI within one render. The specific latency budget per event class is a technical decision (deferred), but the **promise** — no manual refresh, ever — is a product decision.

### ID-6: Mutations are first-class and auditable; reads are quiet.

Every operator-mutating action:

- requires a confirmation that names the consequence (the UI does not let you delete a memory or revoke a grant by clicking once);
- requires a **mandatory reason** field (free text, min length TBD in the technical document);
- is recorded with **actor, target, before, after, timestamp, reason**;
- appears immediately in the audit log (the same realtime engine that powers the rest of the UI);
- is exposed to the runtime's own audit (Langfuse / OTel) for cross-correlation.

Reads, by contrast, do not require confirmation, do not log to the audit trail, and do not produce a "you are about to…" dialog.

### ID-7: Two roles, one application.

**Operator** (full surface, including every mutating action) and **Viewer** (read-only; the same realtime data; mutating actions are not visible, not just disabled). The role model is enforced server-side; the UI reflects it but is not the source of truth. Additional roles may be added later, but V1 ships with these two.

### ID-8: The design system is the single source of visual truth.

The design system is derived from the existing Cambrian brand assets in `design/` and `www/public/`. It defines: color, type, spacing, motion, iconography, elevation, focus, and the component inventory. The chat surface and the operator console both use the system. New screens use the system. No screen has bespoke styles. The system is dark-mode-first. It is accessible by construction (keyboard, contrast, screen reader, focus order). The system itself is treated as a product artefact and lives in a dedicated location inside the project; it has its own tests and its own tokens.

### ID-9: The data plane is the kernel's data plane, period.

The UI reads from the kernel's data sources. It does not maintain its own copy of LTM, its own agent registry, its own tool registry, or its own session store. Where the kernel already has a realtime event mechanism (`domain.EventBus` plus any streaming RPC the kernel exposes for the UI), the UI subscribes. Where the kernel does not yet have such a stream, the UI surfaces the gap and the follow-on technical document proposes the seam — but the UI never invents a parallel store.

### ID-10: The UI is deployable remotely, and is honest about the connection.

The UI can be pointed at a Cambrian runtime on a different host. The user is shown:

- what kernel they are connected to (host, version if known);
- the connection state (live / reconnecting / down);
- what is known to be stale when the connection is degraded.

A degraded connection is a first-class state, not an error to be hidden.

### ID-11: Every screen has a job in the requirements document.

Every screen and every flow in the technical/UX documents must trace back to one or more user stories above. Stories that have no screen are an indicator of a gap; screens that have no story are an indicator of scope creep. The follow-on documents are the place where the stories become screens, but no screen may appear there that does not have a story.

---

## Testing Decisions

The product is tested at three levels. What is tested is product behaviour, not implementation details.

### What makes a good test (UI side)

- Test what the user sees and does, not the implementation behind it.
- A test that requires a specific framework, store, or hookup to be green is a smell; the test should survive a rewrite of the internals.
- A test that exercises a real user flow (the V1 demo path, the audit-before-and-after of a mutation, the realtime handoff between chat and console) is a good test. A test that exercises a single component in isolation is a unit test, not a product test.
- Accessibility tests are part of "good test." Keyboard navigation, focus order, screen reader, contrast.

### What is tested

1. **The 24 use cases from the requirements document** (UC-1 … UC-24) — at least one end-to-end test per use case, with the full stack (UI ↔ transport ↔ kernel ↔ storage) wired. These are the regression net.
2. **The 53 user stories above** — at least one test per story that fails when the story is violated. Stories about role gating (Operator vs Viewer) are tested as both roles.
3. **The realtime promise** (ID-5) — tests that make a state change in the runtime and assert that the UI receives it within a budget, with no manual refresh.
4. **The audit promise** (ID-6) — for each mutating action, a test that asserts the audit entry has actor, target, before, after, timestamp, reason, and appears immediately.
5. **The vocabulary promise** (ID-2) — a string-level test that asserts the UI's surface strings use the glossary terms (and do not invent synonyms).
6. **The remote connection promise** (ID-10) — at least one test that points the UI at a remote kernel and exercises the same flows.
7. **The design-system promise** (ID-8) — a snapshot / lint test that asserts every component in the UI is a use of the design system, with no out-of-system styles.
8. **The "out of scope" tests** — the things the requirements document says the UI is *not* (marketing, agent IDE, marketplace, full observability, mobile-native, i18n) are explicitly tested as absent. A regression that adds one of them fails.

### Prior art inside the codebase

- The kernel's `e2e` benchmark and the chaos / integration tests in `internal/benchmarks` and `internal/testing/chaos` are the pattern for end-to-end tests that exercise the real stack.
- The existing `httptest` patterns in the admin HTTP surface are the pattern for testing the operator HTTP endpoints.
- The Go-side unit tests in `internal/domain/` are the pattern for testing the security-critical decisions (scope, audit, classification). The UI consumes these decisions and must not bypass them.
- The Python SDK tests in `python-sdk/` are the pattern for the agent side of the system, not the UI.

### What is not tested here

- The kernel's correctness — already tested in the Go repo, separately.
- The LLM's behaviour — out of scope; the UI tests the contract, not the model.
- Performance micro-benchmarks — those are a technical-document concern; the product test asserts the *promises* (ID-5: no manual refresh; UC-21: status legible within 2 seconds), not the implementation.

---

## Out of Scope

This list restates and extends the requirements document's "Out of Scope" to make the product boundary explicit.

- **Marketing site, public landing, docs site.** The product is a tool, not a website.
- **End-user chat.** The chat surface is for operators talking *to* the runtime, not for customers of a Cambrian-powered product.
- **Agent authoring IDE / SDK.** The UI surfaces agents; it does not author them.
- **Agent marketplace / install-from-catalog.** No catalog, no install flow.
- **Full observability / tracing UI.** The status panel and the link-out to Langfuse/OTel are the bridge. A metrics explorer, a query builder, and a trace flame-graph viewer are not in scope.
- **Mobile-native apps.** Responsive web on desktop is the target; tablet is acceptable; phone is best-effort.
- **Internationalisation.** English-only at V1. Strings must be externalised so i18n is a follow-on.
- **Light mode.** Dark-mode-first; light mode is a follow-on.
- **A second visual language.** One mission-control visual language across the entire app.
- **A second copy of any data the kernel already has.** The UI is a controller, not a store.
- **A bypass of the kernel's hexagonal boundary.** The UI mutates only through the operator surface.
- **A chat history view that exceeds the kernel's session event log.** The UI renders what the kernel has.
- **A built-in eval / benchmark runner.** The product may surface eval results the kernel has produced; it does not run them.
- **A "free-form" / "experimental" / "sandbox" mode where the operator can type prompts that bypass the Planner's contract.** Every prompt is a real session message.

---

## Further Notes

### On the place of this document

This PRD is the **product-architecture** artefact. The next two documents in the sequence are:

- A **UX PRD** that maps the 53 user stories to screens, flows, and components. The UX PRD introduces no new requirements; it concretises what is here.
- A **technical document** that picks transport, framework, deployment, auth, build, CI/CD, and the realtime-event latency budgets. The technical document introduces no new requirements either; it satisfies the requirements and respects the product-architecture decisions above.

The flow is deliberately one-way: requirements → product PRD → UX PRD → technical. A technical decision that requires a new product requirement is a flag to come back to this document, not to add it elsewhere.

### On the demo path

The V1 demo path (Operator authenticates → creates a session → types a prompt → watches the plan form, sees bids, sees output → injects a mid-plan correction → resolves a HITL intervention → opens the memory explorer and tags a document → opens the audit log and sees every mutation — all in one app, all in realtime) is the **single end-to-end flow that V1 is optimised for**. It exercises every subsystem in the data-surface list (§7 of the requirements document). It is the canary. If the demo path works, the rest of the console is a composition of the same primitives. If the demo path is broken, no other feature compensates.

### On observability of the UI itself

The UI's own health (its connection to the kernel, its event backlog, its render budget) is a product concern. The status panel surfaces kernel health; the same panel also surfaces UI health. The UI does not depend on a separate observability system to be operable.

### On accessibility

Accessibility is not a follow-on. The design system is accessible by construction. Every screen is operable by keyboard alone. Contrast meets WCAG AA in dark mode at minimum; AAA is preferred. Screen-reader semantics are first-class. This is a product requirement (story 46), not a polish step.

### On the brand assets

The Cambrian brand assets live in `design/` (canonical) and `www/public/` (legacy). The design system derives from `design/`; `www/public/` is treated as a superset for compatibility, with the canonical source of truth in `design/`. The technical / UX documents will confirm this with the project owner.

### On the relationship to the kernel's ADRs

The PRD is consistent with the following kernel ADRs; the follow-on technical document must verify this remains true:

- ADR-0030 (TUI deleted; events via `EventBus`) — the UI is the natural consumer of those events.
- ADR-0034 / 0035 (scoping; kernel-derived write classification) — the UI surfaces scope decisions and never bypasses the kernel's classification.
- ADR-0039 / 0040 (kernel-owned tool registry; Hermes capability migration) — the UI is a form over this registry, not a parallel one.
- ADR-0042 (centralized LLM provider) — the Cost & Energy screen reflects the broker's state; the UI does not call models directly.
- ADR-0043 / 0044 / 0045 / 0046 (MCP, semantic tool retrieval, two-tier disclosure, skills) — the UI exposes these exactly as the kernel exposes them.
- ADR-0037 / 0038 (Central-Executive Planner; unified deliberation loop — proposed) — the UI is forward-compatible with the proposed `ResourceSelector` switch and the unified deliberation loop; it does not assume the auction is the only path.
- ADR-0022 (push/pull context; `ContentStore`) — the chat view's "pull" actions (memory_query, find_tools, find_skills) are surfaced; the UI does not duplicate the push layer.

### On the build cadence

V1 will be built as a **vertical slice** (the demo path end-to-end, thin in features but real in behaviour) followed by **parallel work packages** that fill out the remaining 53 user stories. The UX PRD will propose the slice; the technical document will propose the parallel packages. The build order is decided in the UX PRD, not here.

### On the role of the operator

The Operator is the primary user. The Viewer is a real but secondary user. The Auditor is the same human in a different role. The product does not optimise for "first-time visitor" or "casual user"; it optimises for the human who will live in the app for hours, who will use it in anger during incidents, and who will be the one to blame if the system does the wrong thing and the UI did not warn them.
