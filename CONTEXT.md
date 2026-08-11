# Cambrian UI — CONTEXT.md (Source of Truth)

**Version:** 0.1 — aligned to kernel ADR-0047, contract version **`0095`** (kernel `0.6.9-alpha`).
**Authority for this project.** This file is the authoritative reference for the UI app's **architecture, layer responsibilities/boundaries, current status, and the integration contract with the runtime-core**. For layer-level detail read the nested files: [`src-tauri/CONTEXT.md`](src-tauri/CONTEXT.md) (Rust core / transport) and [`src/CONTEXT.md`](src/CONTEXT.md) (webview). For the product spec read [`docs/web-ui-prd.md`](docs/web-ui-prd.md); for the wire contract read [`proto/operator.proto`](proto/operator.proto); for the runtime-side rationale read the kernel repo `docs/adr/0047-operator-transport-plane.md`.

Do not assume anything about the runtime, the transport, or the domain terminology without consulting these.

---

## Implementation Status

| Area | Status |
|---|---|
| Project scaffold (Tauri 2 + React 19 + TS + Vite + Bun) | **Present** |
| **Rust core: gRPC transport client, feed-fold state of record, auth, recovery, Tauri bridge** | **IMPLEMENTED** — `tonic` `OperatorConsole` client, login+keychain, the feed loop (snapshot→cursor→resync→reconnect), 9 `op_*` commands, `kernel://state`/`kernel://token` events. `cargo check`+`clippy` clean. State structs now aligned with webview `types.ts` (Vec-based sessions/plans, `ConnectionState` struct, subsystem cache fields). See `src-tauri/CONTEXT.md`. |
| Webview: projection store, screens, design system | **IMPLEMENTED** — Zustand projection (hydrate/fold/reset), design system (tokens, primitives, Cambrian components), chat surface, plan work surface, memory explorer, nav rail, status strip, command palette. See `src/CONTEXT.md`. |
| Console screens (PRD-06) — Sessions, Plans in Flight, Agents, Tools & Skills, MCP, Scope, Watch, Lifecycle, Verifier, Cost | **SHIPPED** — Sessions (UI-IMPL-19), Plans in Flight (UI-IMPL-20), data model extension (UI-IMPL-21a), Agents (UI-IMPL-22), Tools & Skills (UI-IMPL-22b), MCP (UI-IMPL-23), Scope (UI-IMPL-24), Watch (UI-IMPL-25), Lifecycle (UI-IMPL-26), Verifier (UI-IMPL-27), Cost & Energy (UI-IMPL-28). All P2 console screens complete. |
| Memory page (`docs/MEMORY_PAGE_MVP.md`) — the RAG vertical slice | **SHIPPED** — `/memory` is the two-pane Ingest/Ask page. Ingest: OS-dialog file picker (Rust reads the bytes via `op_ingest_file`; the webview never holds them — supports large files) + paste (text lane), context, scope, importance, audited reason, and a queue whose status folds from `MemoryWrittenOp` (no polling). **Ask (ADR-0081): grounded, NotebookLM-style answer** via `ipc.answerMemory` — the answer's `[n]`-cited sentences render as coloured, clickable spans; clicking one reveals the exact source chunk. Capability-gated on `memory-answer`; abstention/clarification are first-class. Replaces the old chat-lane hack. Inspect is session-scoped. |
| Memory explorer (PRD-05) — compare, graph, bulk | **Deferred** (P3 UI-IMPL-31…35). Detail + blast-radius are reachable from the Memory page's Inspect tab. Real browse is blocked on a `ListMemory` RPC. |
| Audit & export (PRD-07) — list, deep-link, CSV/JSON export | **Vertical-slice minimal** — read-only audit tail. Mutations + export (P4 UI-IMPL-36…37) deferred. |
| Configuration (PRD-07) — settings, first-run, profiles | **Connection panel shipped** — Settings → Connection operates **one instance at a time**: connect (endpoint/username/password), live instance card (status, endpoint, role, kernel + contract, capability count, skew warning), and a real `op_disconnect`. Endpoint + username persist locally for prefill; the password never does (the token lives in the OS keychain). Runtime/UI/Profiles (P5 UI-IMPL-37) deferred. |
| Vendored contract `proto/operator.proto` | **Present, pinned to `0097`** (second re-vendor 2026-08-11: the MCP server write half — `SaveMCPServer`/`RemoveMCPServer` (live attach/detach, no restart), write-only `SetMCPServerToken`/`ClearMCPServerToken`, `TestMCPServer` probing the DRAFT spec, `MCPServerOp` + declared half + token facts. **`/mcp` is the ONE MCP surface** (owner decision 2026-08-11): `MCPServersConsole` rewritten onto the real read + full write surface (cards + `MCPServerEditor`: add/edit/draft-probe test/write-only token/remove); the interim settings pane was removed the same day, and the mock-era feed projection was deleted end-to-end — `MCPServerSummary`/`MCPServerDetail` types, `StateOfRecord.mcp_servers`, the Rust fold field, mock seeds, and the old `MCPListRow`/`MCPDetail`/`MCPFilters`/`MCPConnectionPill` screens (their health-history/price fields existed on no kernel). `IntegrationsSettings` + `MobileRuntime` rewired from the dead projection to the real read — both had carried honest "kernel does not project this" apologies that are now obsolete. Same day, `0096`: `SetRoleAssignment` — the WRITE half of the role map. The RoleMap grid's radios had invoked `op_set_role_assignment` since the pane was built with nothing behind them (the same missing-bridge failure `op_save_generator` once had); the chain now runs radio → Tauri command → transport → kernel, which stores a per-role key on the ADR-0101 store and hot-applies onto the live provider, so the outcome is `live` and the grid surfaces `rejected`/`shadowed` verbatim. Also contract 0096: `RemoveGenerator` refuses the global default and role-serving generators. Note this prose had itself drifted to `0093` while `pb.rs` pinned `0095` — `pb.rs` remains the authority. Earlier third re-vendor 2026-08-05: `TransitionPipeline` — publish/arm/pause/retire from the canvas; the lifecycle finally has a button, `armed` walks a draft through its gates, refusals carry the registry's own sentence. Earlier the same day, twice for ADR-0116: first `field_schema_json` on `GetPipelineOpResponse`/`ValidatePipelineOpResponse` — the per-node field schema behind the canvas editor's picker and field lineage, capability `pipeline-field-schema` (0091) — then `source` + `node_examples` on `DryRunPipelineOpResponse`, the real-data half: what was replayed and up to 3 real items per node (0092). The pin jumped `0085→0091→0092` because 0086–0090 (the reactive-pipeline surface: listing, dry run, canvas reads, draft saves) landed kernel-side without a re-pin; the vendored proto already carried them. Verified by `cargo check` after each bump.) Earlier **`0085`** (re-vendored 2026-08-01, batch job: `RetentionRunOp`/`RetentionDeletionOp` for ADR-0102 A1 retention-on-feed, and the GOV-02 retained-journal-window fields on `BacktestWatchOpResponse`. The pin had drifted to `0079` while the vendored proto itself was much fresher — it already carried all 65 RPCs and 172 of 174 messages — so the skew banner was firing on a stale NUMBER rather than a stale schema. Verified by `cargo check` (clean) after the bump. The three premium planes (`authz/access_policy`, `telemetry/telemetry_admin`, `telegram/telegram_admin`) were already byte-identical to their sources.) Earlier **`0079`** (re-vendored 2026-07-30 for ADR-0098 progress on the operator feed: `ConversationProgressOp` on the EPHEMERAL lane, so the console gets the same "searching memory" / "running tool" status line Telegram already had. Progress had been routed through the conversation's ingress delivery address, and a console conversation has none, so every snapshot was computed and dropped. Earlier `0067`** (re-vendored 2026-07-26 for ADR-0089: `PluginInfoOp` + `SnapshotResponse.plugins`, per-plugin version skew. Earlier 0066 for ADR-0085: `ExplainAccess`, `ListClassificationTags`, `AccessDecisionOp`, `QueryMemoryResponse.policy_note`, `AnswerMemoryResponse.policy_note`, `ToolOp.{classification_tags,effects,effects_inferred}`. Earlier: 0062 for ADR-0084 D9 conversation lane, 0061 for ADR-0081 AnswerMemory) |
| **Drift console** (`/drift`) — ADR-0102, turn 14 of the UX refactor | **SHIPPED** — the drift product's own output, and the second premium plane the UI speaks. Four surfaces behind `?tab=`: **Alerts** (feed + evidence inspector, from `ListAlerts` with no second round trip because `quote` is populated), **Ledger** (the four outcomes, the five unresolved reasons separated and owner-labelled, and refusals in the same frame reading as correct behaviour), **Coverage** (`GetCoverage` + `GetPushStatus` — the connector's own limits verbatim, the three-state retention horizon, and last-push-per-kind with the consequence attached rather than a bare timestamp), **Retention** (`RetentionRunOp` off the feed merged with `ListRetentionRuns`, where a failed pass is the loudest thing on the page). Gated on `record-lane`, which the plugin reports only after Build finds Postgres — so its absence is a complete deployment, not a fault. Citation markers are derived from the data; `available=false` renders as "not configured" and never as zeros; there is no Resolve, acknowledge or dismiss because alerts have no state field. |
| **Ingress Studio console** (`/ingress-studio`) — ADR-0112 §13 | **SHIPPED** — the full ingress lifecycle as a place: rail + create, four surfaces behind `?tab=` (**Lifecycle**: state-conditional verbs, arm form minting an immutable release, rollback-to-release, write-only credentials with reason-gated clear; **Specs**: JSON editors saving immutable revisions with the kernel's named refusals inline + field-level revision diff; **Draft**: the propose-only drafter with abstention as a first-class outcome and the D13 coverage report as the confirm checklist; **Operations**: the ephemeral dry-run preview from real traffic, shadow-repair diff + reason-gated promote, delivery failures). Gated on `ingress-studio` (reported post-Build — no Postgres/evidence-capture = complete deployment); every mutating action reason-gated per house rule; the kernel's state machine is the single authority and refusals render verbatim |
| Vendored PREMIUM plane `proto/ingress/ingress_studio.proto` | **Present** — the `IngressStudioAdmin` service (ADR-0112 §13). Owned and versioned by `cambrian-premium`, vendored byte-identical, mounted on the same kernel server behind the same operator auth (ADR-0073). Credentials write-only end to end. Re-vendored 2026-08-06: `DraftRequest.base_spec_json` (revise-by-prompt — the mapping stage passes the shown spec as the drafter's base so "Redraft it" truly revises, and live ingresses gain the `ReviseMapping` box: author a proposed revision from words → save as the fork → the existing shadow-reprocess → promote flow carries it; authoring only, nothing applies until promote) |
| Vendored PREMIUM plane `proto/records/records.proto` | **Present** — the `RecordLane` service (alerts, drift tally, refusals, retention runs). Owned and versioned by `cambrian-premium`, mounted on the same kernel server behind the same operator auth interceptors (ADR-0073/0102). Vendored byte-identical from `cambrian-premium/api/proto/records/records.proto`. Read-only from this console: the customer PUSHES records and messages, and the UI never does. |
| Vendored PREMIUM plane `proto/authz/access_policy.proto` | **Present** — the `AccessPolicyAdmin` service (groups, policy objects, links, resultant policy, What-If, audit export). Owned and versioned by `cambrian-premium`, mounted on the same kernel server behind the same operator auth interceptors (ADR-0073/0088). This is the FIRST premium plane the UI speaks; it amends cross-repo invariant #2. |
| **Access Policy console** (`/scope`) — ADR-0085/0086/0087/0090/0091/0092 | **SHIPPED** — the UI's first premium surface. Seven panes: **Principals** + **Explain** ride the pinned OSS contract and work against any `0067` kernel; **Policies**, **Groups**, **Ingress**, **Assistant**, **Rollout** are premium and render only when the handshake advertises `access-policy`. **Ingress** (ADR-0090 D2) administers which daemons are entry points — registration MINTS a surface, so it needs a surface of its own or the registry is API-only. **Assistant** (ADR-0092) drafts a policy from a description in English: the terms come before the prose (the rationale sits below the rule it explains, because it is context and not the artefact under review), a blocking problem disables approval outright, an empty journal says the blast radius is **unknown** rather than rendering three zeroes that read as "safe", and `Approve as report-only` calls the ordinary `savePolicy` + `linkPolicy` — the assistant has no apply path of its own. The old free-text tag inputs are replaced by vocabulary-driven selection (`TagPicker`) — ADR-0085 D11 calls a free-text tag field a defect, because a typo is the primary route to a boundary that silently matches nothing. Tool effect classes + `effects_inferred` surface on Tools & Skills as the strict-mode migration checklist; an abstention that access policy caused now says so instead of reading as "the corpus does not answer". |
| **Knowledge console** (`/knowledge`) — ADR-0118, PRD story 54 | **SHIPPED** — asking, exploring and auditing the knowledge substrate; the fifth premium plane the UI speaks. Three surfaces behind `?tab=`: **Ask** (the natural-language box — `AskKnowledge` compiles the question into the closed AST with a temp-0 model and executes it through the same validated, scoped plane; the answer always carries its §14 guarantee label AND the compiled-query chip, so NL convenience never becomes NL ambiguity; a refusal renders as "Refused — by design" with the memory lane linked for open-ended questions — there is deliberately NO structured query builder), **Explore** (holdings per SOURCE SURFACE with each surface's classification tags — the visible form of "ingress data is scoped by the surface it arrived through" — plus the entity browser and a dagre/React-Flow co-participation graph whose node clicks re-centre), **Contradictions** (both actors' current assertions side by side, neither styled as wrong, "resolving it is a human call"). The evidence receipt (`?receipt=`) opens in the inspector slot from any value's `evidence_id`. Gated on `substrate-query` (reported post-Build — no Postgres = complete deployment). Full-visibility operator numbers by design (ADR-0118 v1). |
| Vendored PREMIUM plane `proto/substrate/substrate.proto` | **Present** — the `SubstrateLane` service (`AskKnowledge`, `Query` over the closed AST, `Overview`, `ListEntities`, plus ingest/point/history the UI does not call). Owned and versioned by `cambrian-premium`, vendored byte-identical, mounted on the same kernel server behind the same operator auth (ADR-0073/0118). Rows are JSON objects (v1 wire shape) end to end — the webview renders a dynamic table, so new row shapes need no Rust release. |
| Runtime-core Operator Transport Plane (the thing we integrate against) | **Implemented & serving** (kernel ADR-0047; see §6) |

The **Rust core (`src-tauri`) and the webview (`src`) are both built**. The console subsystem and memory explorer are partially shipped (vertical slice + P2 console screens complete). The build order is the parent UX PRD §13 (vertical slice → P1 subsystems read → P2 subsystems read+mutate → P3 memory explorer → P4 audit & export → P5 configuration → P6 polish & a11y).

---

## 1. Core Philosophy

The Cambrian UI is a **desktop mission-control** for a running Cambrian runtime ("runtime-core" / Substrate / kernel). One application, two surfaces — a **chat surface** (talk to a session, watch its plan form and execute, steer it) and an **operator console** (inspect/steer agents, tools, skills, MCP, memory, scope, lifecycle, verifier, cost, audit) — sharing one realtime data plane, one design system, one audit story. It replaces the deleted TUI's *role*.

Three principles govern every decision:

1. **Controller, not back door.** The UI mutates and reads the runtime **only** through the kernel's documented operator PLANE — the pinned `OperatorConsole` service, plus any premium-owned service mounted on the same kernel server behind the same operator auth interceptors, over the same connection and token (ADR-0073/0088). It never speaks the agent-facing `Orchestrator`, never carries an `x-agent-id` principal for a human, never bypasses the kernel, never writes to its databases, and never maintains a parallel copy of kernel data. A premium plane's surface is **capability-gated**: rendered only when the handshake advertises that plugin, so an OSS kernel simply does not grow it.
2. **The runtime's vocabulary is the UI's vocabulary.** Cambrian's domain terms are used verbatim; the UI invents no synonyms (§7 glossary).
3. **Two-tier state: state of record vs projection.** The **Rust core** is the client-side state of record (it owns the connection and folds the feed); the **webview** is a projection/cache of it. This is the load-bearing architectural idea (§2).

---

## 2. Architecture & Layer Breakdown

The app is a **Tauri 2** desktop application with two layers across two hops:

```
Go kernel ──gRPC/HTTP2 (tonic, ONE conn)──> Rust core (src-tauri) ──Tauri IPC──> Webview (src)
 [runtime-core]      [the transport client]      [state of record]        [a projection/cache]
```

The webview **never** speaks gRPC and **never** opens a socket to the kernel. All kernel I/O is in the Rust core. This dissolves the browser-era transport problem entirely: **no gRPC-Web, no Envoy, no protobuf.js, no browser sockets, no multi-tab/leader-election** — those exist only when a browser speaks gRPC, which here it does not.

### `src-tauri/` — the Rust core (transport + state of record + bridge)

The integration engine. Responsibilities: hold the native `tonic` gRPC client to `OperatorConsole`; authenticate (Login → token in OS keychain → bearer interceptor); drain `StreamEvents` and **fold the absolute-state feed into typed state** (the state of record); run the **recovery state machine** (cursor resume → `ResyncRequired` → `Snapshot` → resubscribe); send **idempotent, audited commands** (command_id + reason, retry queue); reconnect with backoff+jitter; and expose a **Tauri command/event surface** to the webview (typed projections out, user intents in). **Full transport contract + recovery rules live in [`src-tauri/CONTEXT.md`](src-tauri/CONTEXT.md).**

### `src/` — the webview (projection + screens + design system)

The presentation layer. Responsibilities: a **projection store** hydrated from the core over Tauri events (a cache, not the source of truth); **screens that each trace to a PRD user story**; the **design system** (dark-mode-first, dense, keyboard-friendly, accessible by construction); and the **Tauri IPC client** (invoke command intents, subscribe to projection events). It consumes typed data; it does not know gRPC exists. **Detail in [`src/CONTEXT.md`](src/CONTEXT.md).**

### `proto/` — the vendored contract

`operator.proto`, **vendored and pinned** to contract `0097`, header-stamped DO-NOT-EDIT. The single source of the wire types. Re-vendor from the kernel repo `api/proto/operator.proto` when the contract bumps.

(This line said `0061` until 2026-08-07 while `src-tauri/src/pb.rs` pinned `0093` — the *pin* was current and the *prose* was stale, which is the direction that misleads a reader checking whether they are behind. The pin in `pb.rs` is the authority; this sentence is a copy of it and copies drift.)

**Re-vendored 2026-08-07**, byte-identical to core again. The change was one hunk: `AuthoredStepOp.recommended_model` gained `[deprecated = true]` plus a rationale comment — the kernel resolves model choice from the step's declared need and no longer reads the field. **The contract did NOT bump** (still `0093`): the wire is unchanged, nothing was added or removed, and `buf breaking` passes — so no skew banner, correctly. Note for the next re-vendor: because prost emits `#[deprecated]` and `transport.rs` reads that field, `cargo check` surfaces warnings unless the two conversion functions keep their `#[allow(deprecated)]` — they do, deliberately, so an authored value round-trips instead of being silently dropped in transport. `DagBuilder` states the field is advisory rather than pretending the override works.

### Row-level entitlement reaches the console: `0093 → 0094 → 0095` (2026-08-11)

Two bumps, both on the **premium** `proto/authz/access_policy.proto` rather than `operator.proto`,
which is unchanged. Worth stating because the earlier prose here implied the pin tracks
`operator.proto` alone: it does not — `PINNED_CONTRACT_VERSION` is one global sequence covering
the premium planes too, and premium-only surfaces have taken numbers from it since `0077`.

- **`0094`** — party identities (ADR-0121 D3): `List`/`Assign`/`RevokePartyIdentities`, the durable
  answer to "which entities is this reader?". No UI yet; the plane carries it.
- **`0095`** — the authoring path: `party_scoped_tags` on `ScopeRule`, plus `row_scope_note` +
  `party_identities` on `ResultantPolicyResponse` and `row_scope_note` on
  `SimulatePolicyResponse`.

**Why the projection types had to change and not just the generated ones.** `ScopeRule` is a full
round trip — read a policy, edit it, `savePolicy` sends the whole object back — through *two*
hand-written projections (`src-tauri/src/policy.rs` and `src/ipc/types.ts`). A field either
projection omitted would be a restriction deleted by the act of editing something unrelated, and
the policy that came back would read as a full grant. Both now carry it, and it is a REQUIRED
field in the TS interface on purpose: the compiler then names every literal that forgot it, which
is how the four remaining ones were found.

**Rendering, because ADR-0121 D1c says the preview lies otherwise.** Explain shows `Only own rows`
and `Party identities` inside the same term list as Required/Forbidden — a reader who takes that
list as the whole boundary is otherwise reading "sees every order" for a policy that means "only
their own" — followed by the kernel's own sentence saying the answer is per-record and cannot be
enumerated without running the query. Policies gained an `Only own rows` picker beside the
narrowing terms (unconditionally, unlike Grants, since a party scope may name any tag). What-If's
note is projected but not yet rendered: `newly_denied` is an upper bound there, because the
decision journal records tags and never recorded parties.

Verified by `cargo check` (clean) and `tsc --noEmit` + the full webview suite (836 tests).

### Chat: a failed turn now reads as failed (2026-08-08)

`ProgressLine` rendered every ADR-0098 snapshot with a pulsing live dot and
`aria-live="polite"`, including a **final** one. A turn that failed before replying
therefore left the console saying "working on it" forever — the precise "looks like a hang"
reading the terminal signal exists to prevent. A final update that still carries text IS the
failure notice (its `Note`); a successful turn clears instead, by sending empty text that the
Rust fold removes. So final-and-present now renders as ended: `--fg-danger`, a static dot,
`role="alert"` + `aria-live="assertive"`, and no step counter ("step 2 of 4" beside a failure
is where it stopped, not progress). `ProgressLine` is exported from `ChatConsole.tsx` for its
test, the same way `InterviewCard` already is.

`SessionWorkSurface` also stopped `void`-ing `ipc.sendMessage` / `ipc.injectCorrection`. A
rejected command used to vanish — the draft cleared, the composer looked like it had worked,
and nothing said otherwise. An ASYNC failure arrives later on the progress channel, but a
send that never left the machine has no progress channel to arrive on, so that was the one
failure a user could never discover.

### `docs/` — the product spec

`web-ui-prd.md` — normative: 53 user stories, 24 use cases, the V1 demo path, out-of-scope. Every screen must trace to a story.

---

## 3. The integration boundary (summary)

One gRPC service, `cambrian.OperatorConsole` (distinct from the kernel's agent-facing `Orchestrator`/`AgentService` — never call those). It offers: **`Login`**; reads/stream **`StreamEvents`** / **`Snapshot`** / **`QueryAudit`** (any role); and **commands** `CreateSession`/`SendMessage`/`InjectCorrection`/`PauseSession`/`ResumeSession`/`ResolveHITL`/`SetToolGrant`/`TagMemory`/`SetScope`/`RegisterSkill`/`RegisterMCP`/`TriggerConsolidation` (Operator-only, idempotent, audited). The feed delivers a globally-sequenced stream of absolute-state `OperatorEvent`s. **The full RPC + event catalog, sequencing, recovery, auth, and idempotency rules are owned by [`src-tauri/CONTEXT.md`](src-tauri/CONTEXT.md)** (the Rust core implements them).

---

## 4. Frozen architectural decisions

| Decision | Choice & consequence |
|---|---|
| Desktop shell | **Tauri 2** — Rust core + webview, OS keychain, in-process IPC. |
| Webview | **React 19 + TypeScript + Vite**, **Bun** package manager. |
| Transport | **gRPC + Protocol Buffers** over HTTP/2, **native `tonic` in the Rust core**. NOT gRPC-Web. |
| State | **Rust core = state of record; webview = projection.** Webview reload = cheap local resync from the still-connected core, not a kernel reconnect. |
| Contract | One vendored, **pinned** `operator.proto`; runtime skew detected via the `Snapshot` capability/version handshake. |
| Realtime | The feed is the only source of live state; **no "click to refresh" anywhere**. |
| Server state | **TanStack Query is for the imperative edges only** — mutations and the few request/response reads that are not on the feed (`answerMemory`, `queryAudit`, `explainAccess`, `listClassificationTags`, `statFile`). The projection MUST NOT go in it: a cache with staleness and refetching is the model this architecture rejects. The client in `src/lib/queryClient.ts` has every automatic refetch disabled so polling cannot be reintroduced by accident, and mutations never invalidate — the effect arrives on the feed. |
| Shell layout | One header + grouped rail + main + **an inspector that exists only while something is selected** (`src/components/InspectorSlot.tsx`). There is no permanent right-hand panel and no bottom status strip; their contents live where they are read. |

---

## 5. Hard Rules

1. **Only `OperatorConsole`.** Never call agent-facing RPCs; never bypass the kernel; never invent a parallel store.
2. **Kernel vocabulary, verbatim** (§7).
3. **gRPC lives in the Rust core only.** The webview consumes Tauri-bridged projections.
4. **Mutations are loud + audited** (every command carries `command_id` + `reason`); **reads are quiet**.
5. **Realtime by default; honest about the connection** (live / reconnecting / down + what is stale is a first-class state).
6. **Every screen traces to a PRD user story.**
7. After changing how the UI integrates with the runtime, **update this file and the relevant layer `CONTEXT.md`**.

---

## 6. What the runtime serves today

The runtime's Operator Transport Plane (kernel ADR-0047) is **fully implemented and registered** — all `OperatorConsole` RPCs respond. Live on the feed: auction, agent-ready, session lifecycle, memory-pressure, daemon-crash, watch-triggered, **memory-written, HITL-raised, verifier-round, LLM-health, plan-state, audit**, and best-effort **token** chunks. Commands have real effects; the audit log is durable (Postgres). **Deferred kernel-side (design around these):** always-on PauseController on the operator execute path (destructive-step HITL pause is opt-in; tool-approval HITL via `ResolveHITL` works), the LLM inject-planner (inject currently replaces the forward plan with the routed instruction), precise token `step_index` (currently `0`). Kernel detail: `CURRENT_CODEBASE_STATE.md` §0047.

---

## 7. Glossary

**Cambrian domain terms (use verbatim).** Substrate, Handoff, ExecutionPlan, Step, Planner, Gatekeeper, Dispatcher (`domain.StepDispatcher` — **not** Auctioneer, deleted by ADR-0100 P3; the wire still says `AuctionEventOp` and the feed class is still `auction`, because the proto was deliberately left unchanged to hold the contract at `0093`), Verifier, Agent (Cognitive/Model/Daemon), TrustScore, GatekeeperScore, Session, Checkpoint, EpisodicMemory, LTM, MnemonicFact, MnemonicScene, ProceduralTemplate, NegativeEdge, Scope, EffectiveScope, DefaultWriteTags, k-anonymity, Tool/Skill/MCP, Tier-1/Tier-2 disclosure, HITL, PauseController, EventBus, Consolidation, Lifecycle, LLM Provider, Circuit Breaker. Full definitions: kernel `CONTEXT.md §7`, PRD §10.

**UI-app terms.**
- **Runtime-core / kernel / Substrate** — the Go runtime this app controls.
- **Operator Transport Plane** — the kernel's `OperatorConsole` gRPC surface (ADR-0047) that this app is the client of.
- **Rust core** — the `src-tauri` Tauri backend; the gRPC client and **state of record**.
- **Webview** — the `src` React app; a **projection/cache** of the core's state.
- **The feed** — the `StreamEvents` stream of sequenced, absolute-state `OperatorEvent`s.
- **seq / cursor** — the global monotonic sequence number; the resume position.
- **Resync** — the `ResyncRequired` → `Snapshot` → resubscribe recovery move.
- **Projection** — typed state the core pushes to the webview over Tauri events.
- **Plans in Flight** — the live set of running plans, folded from `plan_state` events.
- **Capability handshake** — the `kernel_version`/`contract_version`/`capabilities` in `Snapshot` that drive surface visibility + skew warnings.
