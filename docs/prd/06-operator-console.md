# PRD-06 — Operator Console

**Status:** Frozen v1.0 — locked 2026-06-22.
**Parent PRD:** `web-ui-ux-prd.md` v0.1 · [PRD-01](01-foundation.md) Foundation · [PRD-02](02-shell-and-layout.md) Shell & Layout · [PRD-05](05-memory-explorer.md) Memory Explorer.
**Sibling PRDs:** [PRD-03](03-chat-surface.md) Chat Surface · [PRD-04](04-plan-work-surface.md) Plan Work Surface · [PRD-07](07-configuration-and-audit.md) Configuration & Audit.
**Source requirements:** `../requirements/web-ui-requirements.md` §2.2 (operator console — 12 domains), §5.2 (UC-6…UC-14, UC-15…UC-22), §7.1 (data surfaces — read), §7.2 (write — operator-mutating actions).
**Source PRD:** `web-ui-prd.md` ID-1 (one app two surfaces), ID-2 (vocabulary), ID-3 (controller over the boundary), ID-7 (two roles, one app), ID-8 (design system), ID-9 (data plane = kernel's data plane), ID-11 (every screen has a story).
**Story coverage:** Story 14 (Plans in Flight), Story 15 (Sessions list + filter + open/pause/resume/complete), Story 16 (session view: live plan + event log + checkpoints), Story 17 (Agents list), Story 18 (agent genotype + history), Story 19 (Tools), Story 20 (Skills), Story 21 (MCP), Story 25 (Scope), Story 26 (Watch & Reactive), Story 27 (Lifecycle), Story 28 (Verifier Pool), Story 29 (Cost & Energy). Memory Explorer = Story 22 / 23 / 24 / 30 / 38 lives in PRD-05. Audit = Story 41 / 42 / 51 lives in PRD-07.
**Companion ADRs (all Frozen):** [UI-014](../adr/UI-014-cost-panel.md) Cost Panel (lightweight + link-out + CSS-only Sparkline).

---

## 1. Scope

**In scope.** The 11 console entries reachable from the nav rail (PRD-02 §4.1): Sessions, Plans in Flight, Agents, Tools & Skills (tabbed), MCP, Memory (owned by PRD-05), Scope, Watch & Reactive, Lifecycle, Verifier Pool, Cost & Energy. Each entry follows the canonical three-section pattern (LD-1 / PRD-02): **filter bar at the top, list in the centre, detail in the right inspector**. Mutations live in the inspector (operator-only; Viewer sees the read-only form with a "this action requires Operator" disabled state per PRD-02 §7.2). Drill-downs to other PRDs (memory documents → PRD-05, plans → PRD-04, audit entries → PRD-07).

**Out of scope.** The Memory console entry's body (PRD-05 owns it). The Settings + Audit surface (PRD-07). The chat surface (PRD-03). The plan work surface (PRD-04). The first-run flow (PRD-07). The instance profile format (PRD-07). The health summary screen (this PRD's "Cost & Energy" entry subsumes the "at-a-glance" health read; the deeper Health screen is a follow-on).

---

## 2. Inherited decisions (cited by number)

**From the UX PRD `web-ui-ux-prd.md` §2:**
- **LD-1 — Shell shape.** Three columns; the right inspector is context-shaped. This PRD's console entries all use the "resource context" shape (PRD-02 §4.4) for their detail panel.
- **LD-8 — States.** Empty / loading / error / success / audit (PRD-01 §10) applied to every list, detail, and mutation form.
- **LD-11 — In-app configuration.** The operator console's mutating actions (scope change, write-tag change, tool-grant change, register a new skill / MCP / tool) are the V1 form of "in-app configuration." The Settings surface (PRD-07) is the global view; the per-resource drill-downs from this PRD are the local form. **The V1 settings scope cut:** no free-form JSON editor (sub-decision from the session index; the UI is a form over the kernel's published schema, PRD-07 / UI-015).

**From PRD-01 (Foundation):**
- §4 (visual tokens; the console consumes them).
- §6 (component inventory; this PRD composes from `ResourceCard`, `ResourceHeader`, `ResourceManifest`, `ResourceSchemaView`, `ResourceInvocationList`, `MCPConnectionCard`, `MCPHealthBadge`, `ScopeEditor`, `EffectiveScopeView`, `DefaultWriteTagsEditor`, `CallerScopeView`, `ScopeHistoryList`, `PromotionLog`, `LifecycleDashboard`, `WatchConfigList`, `WatchConfigEditor`, `VerifierPoolCard`, `VerifierRoundList`, `CostPanel`, `CircuitBreakerPill`, `PriceLedger`, `AcquireOutcomeList`).
- §7 (realtime grammar; every list is realtime, every mutation's success is the audit-log entry).
- §8 (a11y contract; every list is virtualised with proper aria-rowcount, the detail panel uses semantic roles, the mutation forms are accessible).
- §9 (keyboard; `j` / `k` for list nav, `Enter` to open, `Esc` to close, `/` to focus the filter bar, `n` for "new" where applicable, `1`…`9` to jump to the nth plan in Plans in Flight).
- §10 (state vocabulary).
- §11 (forbids).

**From PRD-02 (Shell & Layout):**
- §4.1 (nav rail; the 11 console entries plus Memory and Settings).
- §4.4 (right inspector; the detail panel for each console entry is the "resource context" shape).
- §6 (status strip; the in-flight plans count, queue depth, circuit-breaker state, spend rate, and event backlog fields are the at-a-glance read; the Cost & Energy console entry is the deep view).

**From PRD-05 (Memory Explorer):**
- §5 / §8 (the memory detail's blast-radius preview and inline graph view are reused here for scope changes, write-tag changes, and tool-grant changes — the same PRD-01 components).

**From the in-repo `ui/CONTEXT.md` (PRD-01 §2.5):**
- **EC-1** (Tauri 2), **EC-2** (React 19 + TS + Vite), **EC-3** (Bun), **EC-4** (gRPC in Rust core; every console entry reads from the projection store, every mutation goes through a Tauri command), **EC-5** (vendored proto at 0047).

**From kernel ADRs (cited, not re-decided):**
- **ADR-0001** (Agent-trait classification + DAG parallel execution — the agent list).
- **ADR-0002** (Hybrid Gatekeeper — the agent detail's cognitive fingerprint).
- **ADR-0005/0010** (Self-healing + tiered failure resilience — the agent history).
- **ADR-0011** (Neuromodulator cost-aware routing — the cost panel).
- **ADR-0012** (Synaptic bridge / episodic memory — the sessions + event log).
- **ADR-0019/0021** (OTel Bridge + Langfuse — the link-out targets from the cost panel).
- **ADR-0022** (push/pull context — the memory explorer pull side).
- **ADR-0027** (Hippocampus procedural templates — the agents / plans view).
- **ADR-0030** (Event-Driven Memory Lifecycle — the Lifecycle console).
- **ADR-0031** (Universal Input Router — the slash-prefixes).
- **ADR-0032/0033** (Reactive Rule Engine + Daemon Agent — the Watch & Reactive console + the Daemon filter on the Agents list).
- **ADR-0034/0035** (scoping + kernel-derived write classification — the Scope console + the blast-radius panel).
- **ADR-0039/0040** (Tool Registry + Hermes — the Tools console).
- **ADR-0042** (Centralized LLM Provider — the cost panel's circuit-breaker state).
- **ADR-0043/0044/0045/0046** (MCP / semantic tool retrieval / two-tier disclosure / skills — the Tools + Skills + MCP consoles).
- **ADR-0047** (Operator Transport Plane — the gRPC seam every console entry's mutations pass through).

---

## 3. The canonical three-section pattern (LD-1)

Every console entry in this PRD follows the same shape:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FILTER BAR  (top, compact; "more filters" popover for the long tail)        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ LIST  (centre, virtualised, realtime)                                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Row 1  (DocType pill / status pill / key fields / meta / actions)  │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │  Row 2                                                              │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │  ...                                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
├──────────────────────────────────┬──────────────────────────────────────────┤
│                                  │                                          │
│                                  │  DETAIL  (right inspector, context-      │
│                                  │  shaped per PRD-02 §4.4)                │
│                                  │                                          │
│                                  │  - Header (id, type, status pill)        │
│                                  │  - Key fields (manifest, schema, etc.)   │
│                                  │  - Recent activity (last 10 events)     │
│                                  │  - Related plans (24 h)                  │
│                                  │  - Mutating actions (operator-only)      │
│                                  │                                          │
└──────────────────────────────────┴──────────────────────────────────────────┘
```

The shape is the same for every entry; the content differs. The PRD-01 design system enforces the visual grammar; the PRD-02 shell provides the chrome; PRD-05 provides the blast-radius panel that gates the mutating actions.

---

## 4. Sessions (Story 15 + 16) — PRD-06 §7.1

- **List.** All sessions, filterable by state (Active / Paused / Dormant / Completed), time, agent, free text. Each row: title, state pill, last activity, plan count, agent mix, cost.
- **Detail.** Opens the chat surface for the selected session (the centre column switches into the session). The session header: id, state, created, last activity, plan count, agent mix, cost. Mutating actions: **pause**, **resume**, **complete** (operator-only; PRD-02 §7.2).
- **Checkpoints.** A "Checkpoints" tab inside the session shows the timeline of checkpoints; the operator can resume from any historical checkpoint (Story 11 — kernel ADR-0012's checkpointing).
- **Deep-links.** A session can be deep-linked from the audit log (PRD-07), from the Plans in Flight view (a plan → its session), and from the chat (the active session pill in the nav rail).

---

## 5. Plans in Flight (Story 14) — PRD-06 §7.2

- **List.** Every running plan across all sessions, sorted by start time. Each row: plan id, session, subject, step count, active agent, status pill, elapsed time, cost. The `1`…`9` hotkey jumps to the nth plan when the view is focused (PRD-01 §9).
- **Detail.** Clicking a row opens the plan work surface (PRD-04) in the centre column. The right inspector shows the active step detail.
- **Global view, per-session stack.** This PRD owns the **global** view (every plan, every session). The per-session plan stack is the right inspector's shape (PRD-03 §6 + PRD-04 §10). The two share the same data and the same visual vocabulary.

---

## 6. Agents (Story 17 + 18) — PRD-06 §7.3

- **List.** Every registered agent. Each row: id, trait pill (Cognitive / Model / Daemon), scope summary, TrustScore, last activity, last state. Filter by trait, scope, state.
- **Detail — header.** id, trait, manifest version, last state.
- **Detail — genotype.** Manifest, cognitive fingerprint (TraitCognitive only — kernel ADR-0002), scope.
- **Detail — history.** TrustScore EWMA, recent verification outcomes, last error, last successful plan.
- **Mutating actions** (operator-only):
  - **Adjust scope** (PRD-05 / PRD-07 — the blast-radius panel gates this).
  - **Adjust write tags** (PRD-07 — the blast-radius panel gates this).
  - **Adjust tool grants** (PRD-07 — the blast-radius panel gates this).
  - **Register a new agent** (subject to kernel capability; PRD-07 / kernel ADR-0001 — deferred if the kernel does not yet support runtime registration of agents, confirm in the kernel contract).

---

## 7. Tools & Skills (Story 19 + 20) — PRD-06 §7.4

### 7.1 Tools (tabbed)

- **List.** Every registered system tool. Each row: id, description (Tier-1 summary per kernel ADR-0045), danger flag, granted-agent count, recent-invocation count, last cost.
- **Detail — header.** id, manifest version, danger flag, schema (Tier-1 by default; Tier-2 on demand).
- **Detail — granted agents.** List of agents the tool is granted to.
- **Detail — recent invocations.** List with status, latency, cost, error. Filter by status.
- **Mutating actions** (operator-only):
  - **Adjust grants per agent** (blast-radius panel — the impact is the agent's `EffectiveScope`, not the tool's, but the panel reuses the same component).
  - **Register a new tool** (subject to kernel capability; PRD-07 — deferred if not supported).

### 7.2 Skills (tabbed)

- **List.** Every system skill + every agent skill. Each row: id, description, scope tags, loaded-in count, last loaded.
- **Detail — header.** id, scope tags.
- **Detail — SKILL.md.** Rendered markdown (the `SKILL.md` body; PRD-01 §4.2 mono for code blocks).
- **Detail — bundled tool grants.** The grants the skill confers via `RunGrantOverlay` (kernel ADR-0046).
- **Detail — "where loaded".** Which agents / plans have used this skill recently.
- **Mutating actions** (operator-only):
  - **Register a new system skill** (Story 31; PRD-07 — the form is name, description, instructions, bundled tool grants, scope tags).

---

## 8. MCP (Story 21) — PRD-06 §7.5

- **List.** Every external MCP server. Each row: id, connection state pill, tool count, last health check, default price.
- **Detail — connection state.** Up / reconnecting / down. The PRD-01 §6 `MCPHealthBadge` carries the state. The detail shows the most recent health-check timestamps, the reconnect history, and the per-server default price.
- **Detail — discovered tools.** List of `mcp:<server>/<tool>` tools (kernel ADR-0043) with Tier-1 summaries. The list re-syncs on every `mcpToolSink` event (kernel ADR-0043 D8).
- **Mutating actions** (operator-only):
  - **Register / update / remove an MCP connection** (Story 32; PRD-07 — the form is command / URL, auth, default price).

---

## 9. Memory — owned by PRD-05

The Memory console entry in the nav rail (PRD-02 §4.1) is the entry point for PRD-05 (Memory Explorer). The list / detail / compare / blast-radius panel are PRD-05. This PRD cross-references and does not duplicate.

---

## 10. Scope (Story 25) — PRD-06 §7.7

- **List.** Every agent. Each row: id, EffectiveScope summary, DefaultWriteTags summary, last scope change.
- **Detail — EffectiveScope (read-only).** The three-set predicate (RequiredTags / AnyOfTags / ForbiddenTags) per kernel ADR-0034. The detail renders the tags as a list; the row count + tag count are the at-a-glance read.
- **Detail — DefaultWriteTags (mutable).** The write classification. Mutating action: **adjust write tags** (blast-radius panel).
- **Detail — CallerScope (read-only).** Per kernel ADR-0034 Phase 2 + 0035. The detail shows the effective caller∩agent intersection.
- **Detail — k-anonymity floor (read-only).** The floor from the operator-configured `KAnonymityFloor`. The detail shows the current value and the recent promotion log entries.
- **Detail — audit history.** The list of scope changes for this agent, with actor, before / after, reason, timestamp.
- **Mutating actions** (operator-only):
  - **Adjust scope** (blast-radius panel — the panel shows which agents' EffectiveScope is affected; the scope change is the operator's lever on the `caller_scope` intersection).
  - **Adjust write tags** (blast-radius panel — the panel shows which documents' classification is affected).

---

## 11. Watch & Reactive (Story 26) — PRD-06 §7.8

- **List.** Every WatchConfig. Each row: id, target streams, last fire timestamp, last fire status, error count.
- **Detail — rule.** Rendered YAML or structured form.
- **Detail — target streams.** The kernel streams the config watches.
- **Detail — last fires.** List with status, duration, output. Filter by status.
- **Detail — errors.** The recent error log.
- **Mutating actions** (operator-only):
  - **Create / update / delete a WatchConfig** (Story 32; PRD-07 — the form is the rule + target streams + conditions + actions).

---

## 12. Lifecycle (Story 27) — PRD-06 §7.9

- **Dashboard.** Scheduler state. Pending jobs. Last consolidation (timestamp, duration, output). Dormancy events. The lifecycle manager's current state (kernel ADR-0030's `MemoryLifecycleManager`).
- **Mutating action** (operator-only): **Trigger a manual consolidation** (full or scoped; Story 35; PRD-07). The action is a button in the dashboard; the confirm-with-consequence bar names the consequence ("Triggering a full consolidation may take several minutes; the lifecycle manager will be busy until completion."). The action is audited; the progress is streamed to the dashboard.

---

## 13. Verifier Pool (Story 28) — PRD-06 §7.10

- **Dashboard.** Pool composition (the high-Merit agents in the pool). Recent rounds (list with verifier id, target, score, cross-verification status). Surveillance triggers (list — the triggers that fired 100% sampling per kernel ADR-0001).
- **Detail — round.** The round, the verifier's score, the cross-verification outcome. A "drill into target" affordance opens the target (an agent, a plan, a memory) in its owning console.
- **No mutating actions** on the verifier pool. The pool is operator-observed; the kernel's verification loop is the source of the TrustScore (kernel ADR-0001).

---

## 14. Cost & Energy (Story 29) — PRD-06 §7.11 + UI-014

- **Dashboard.** Per-step, per-session, per-agent, per-model cost for the current run and the recent history. Circuit-breaker state per LLM provider (the `CircuitBreakerPill` from PRD-01 §6, fed by kernel ADR-0042). Price ledger (the `PriceLedger` from kernel ADR-0042). Acquire outcome list (the `AcquireOutcomeList` from PRD-01 §6).
- **Deep-dive link-out.** The "view in Langfuse" / "view in OTel" affordance opens the corresponding trace in the external observability tool. The link-out is a regular link; the deep dive is **not** in V1's UI (per product PRD out-of-scope: "no full observability clone").
- **Lightweight by design.** This dashboard is the status panel, expanded. It is **not** a metrics explorer, not a query builder, not a trace flame-graph viewer. The decisions on this are in UI-014.

---

## 15. Drill-downs

Every console entry supports drill-downs to other PRDs:

- **Memory document** → PRD-05 detail (deep link: `/memory/$docId?type=mnemonic_fact`).
- **Plan** → PRD-04 work surface (the centre column switches).
- **Session** → PRD-03 chat surface (the centre column switches to the session).
- **Audit entry** → PRD-07 audit detail (the entry, the diff, the deep link to the target).
- **Agent / tool / skill / MCP / scope / watch config** → the resource's detail (this PRD).
- **Lifecycle consolidation job** → the kernel-side job progress (streamed).
- **Verifier round target** → the target's owning console.

Drill-downs are part of the right inspector's "resource context" shape (PRD-02 §4.4). The drill-down's destination is a "configure this X" affordance; the destination is rendered into the centre column + the right inspector's "mutation context" shape (PRD-02 §4.4) for the form.

---

## 16. Keyboard

The console entries consume the keyboard map from PRD-01 §9:

- `g s` / `g p` / `g a` / `g t` / `g m` / `g y` / `g o` / `g w` / `g l` / `g v` / `g c` / `g u` / `g x` — go-to-console-entry.
- `j` / `k` — next / previous row in the focused list.
- `Enter` — open the focused row in the detail.
- `Esc` — close the detail / clear the filter.
- `/` — focus the filter bar.
- `n` — "new" where applicable (new session, new agent, new tool, new skill, new MCP, new scope rule, new watch config).
- `1`…`9` — jump to the nth plan in the Plans in Flight view (only when that view is focused).

---

## 17. Realtime

Every console list is **realtime** (product PRD ID-5). The fold (UI-005) updates the projection store; the Zustand selectors (UI-004) re-render only the changed rows. The realtime grammar (PRD-01 §7) is applied to:

- A new row arriving (pulse on the new row).
- A row's state changing (trail mark + the status pill updates).
- A row's activity / cost / last-error changing (the row's meta cell pulses; the change is shown in the detail).
- A mutating action's success (the audit-log entry appears in real time — PRD-07).

---

## 18. Empty / loading / error / success states (PRD-01 §10)

Every list, detail, and form follows the PRD-01 §10 state vocabulary. The empty state is always paired with a primary action:

- **Sessions empty** — "No sessions yet." + "New session" affordance.
- **Plans in Flight empty** — "No plans running." + deep link to Sessions.
- **Agents empty** — "No agents registered. Register one." + "Register agent" affordance.
- **Tools empty** — "No tools registered." + "Register tool" affordance (if supported).
- **Skills empty** — "No skills registered." + "Register skill" affordance.
- **MCP empty** — "No MCP connections." + "Register MCP" affordance.
- **Memory empty** — owned by PRD-05.
- **Scope empty** — "No agents to scope." (rare; usually the agents list is the entry point).
- **Watch empty** — "No watch configs." + "Register watch" affordance.
- **Lifecycle empty** — "No consolidation jobs yet." + "Trigger consolidation" affordance.
- **Verifier Pool empty** — "No recent rounds." (no primary action; the pool is observer-only).
- **Cost empty** — "No cost data yet." + deep link to the status strip's spend rate field.

The loading state is the PRD-01 §10.2 skeleton. The error state is the kernel's reason verbatim + a one-line "what to do" + a deep link to the relevant console screen. The success state of a destructive mutation is the audit-log entry appearing in real time (product PRD ID-6).

---

## 19. Open questions (gaps for ADRs)

| # | Question | ADR | Status |
|:--|:---------|:----|:-------|
| 1 | Should the Cost & Energy console entry be a lightweight dashboard or a full metrics explorer? | [UI-014](../adr/UI-014-cost-panel.md) | **Draft** |

**Not in this PRD's open-questions block:**
- The plan graph layout (PRD-04 → UI-011).
- The memory graph visualisation (PRD-05 → UI-012).
- The blast-radius computation (PRD-05 → UI-013).
- The config schema contract (PRD-07 → UI-015).
- The audit export format (PRD-07 → UI-016).
- The auth provider (PRD-07 → UI-017).

---

## 20. Cross-references

- **Parent PRD** — `web-ui-ux-prd.md` §7 (The operator console), §2.1 (LD-1), §2.8 (LD-8), §2.11 (LD-11).
- **Sibling PRDs** — PRD-03 (chat surface), PRD-04 (plan work surface), PRD-05 (memory explorer — the Memory console entry's body), PRD-07 (settings + audit; the global view of the mutating actions drilled into from this PRD).
- **Foundation PRD** — PRD-01 §4.4, §6, §7, §8, §9, §10, §11.
- **In-repo `ui/CONTEXT.md`** — EC-1…EC-5.
- **In-repo `ui/src-tauri/CONTEXT.md`** — full transport contract; the console entries read from the projection store (UI-005) and mutate via Tauri commands.
- **Kernel ADRs** — see §2 for the list (cited, not re-decided).
- **Companion ADRs** — UI-014 (in this PRD's §19).

---

## 21. Glossary

Definitions of new vocabulary this PRD introduces. For shared kernel terms see `CONTEXT.md` §7. For design-system terms see PRD-01 §14. For shell terms see PRD-02 §11. For chat terms see PRD-03 §16. For plan terms see PRD-04 §16. For memory terms see PRD-05 §16.

- **Console entry** — One of the 11 nav-rail entries (Sessions, Plans in Flight, Agents, Tools & Skills, MCP, Memory, Scope, Watch & Reactive, Lifecycle, Verifier Pool, Cost & Energy) + the 12th Settings entry owned by PRD-07 + the 13th Audit entry owned by PRD-07.
- **Resource context** — The right inspector's shape when a console entry's list row is focused (PRD-02 §4.4). Header + key fields + recent activity + related plans + mutating actions.
- **Drill-down** — A "configure this X" or "open this X" affordance from one surface to another. Always paired with a deep link.
- **Plans in Flight (global view)** — The console entry that shows every running plan across every session. The per-session plan stack is the right inspector's shape (PRD-03 / PRD-04). Same data, same vocabulary.
- **Cost panel** — The Cost & Energy console entry. Lightweight by design; not a metrics explorer (UI-014).
- **Verifier pool** — The dashboard of high-Merit agents that score task completions. Operator-observed; not mutated by the UI.
