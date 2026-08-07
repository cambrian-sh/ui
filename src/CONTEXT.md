# Webview (`src`) — CONTEXT.md

**Scope:** the **React 19 + TypeScript** webview — the presentation layer. It is a **projection/cache** of the Rust core's state, never a source of truth, and it **does not speak gRPC**. Read the project root `../CONTEXT.md` first; transport detail is in `../src-tauri/CONTEXT.md`.

---

## Status

- **Scaffold:** Vite, React 19, Bun, Tailwind CSS, Radix UI primitives.
- **IPC & Store:** `ipc/` and `store/` are fully implemented. The webview hydrates from `op_get_state` and listens to `kernel://state` and `kernel://token`.
- **Screens Implemented:**
  - Sessions (UI-IMPL-19)
  - Plans in Flight (UI-IMPL-20)
  - Agents (UI-IMPL-22)
  - Tools & Skills (UI-IMPL-22b)
  - MCP Servers (UI-IMPL-23)
  - **Access Policy** (`/scope`, ADR-0085/0086/0087) — the UI's first PREMIUM surface, evolved from the old Scope screen. Seven panes; **Principals** + **Explain** ride the pinned OSS contract, **Policies** / **Groups** / **Ingress** / **Assistant** / **Rollout** render only when the handshake advertises `access-policy` (same gate as `chat` / `memory-answer`). `IngressPane` (ADR-0090) administers entry points, because registering one mints a surface. `ProposePane` (ADR-0092) turns a description into a draft policy and is deliberately powerless: `op_propose_policy` cannot write, and approving is `savePolicy` then `linkPolicy` — the same calls used for hand-authored policy, policy first so a link never points at something that was never saved. `TagPicker` replaced the free-text tag inputs — a free-text tag field is a defect, because a typo produces a boundary that silently matches nothing (ADR-0085 D11). `LabelsPane` puts documents INTO labels, which is the step that makes every rule above it reachable: policy acts on labels and never on a document by name, so an unlabelled document is not denied but *invisible to the policy model*. It has two lanes over one row type — **search** (semantic; finds a document by what it says) and **browse** (`listDocuments`, contract 0070, gated on `document-listing`; lists documents by row, defaulting to unlabelled-only, which is the only way to find a document without already knowing its contents). Labelling is multi-select: one label across the selection, one reason, and because `TagMemory` is per-document the result is reported as a COUNT ("labelled 7 of 9") with the failures named — a bulk run is atomic per document and never across the selection, so a blanket success would be a claim the UI cannot make. When the capability is absent the empty state says the deployment **is** unscoped-and-correct, never that something is missing.
  - **Memory** (`/memory`) — ingest + recall. The ingest pane's label field is the SAME `TagPicker` the Access Policy console uses, driven by `useVocabulary`: a label applied at ingest and a label applied afterwards must be the same term, or a rule written about it reaches only half the corpus. It was a free-text draft input, which is the ADR-0085 D11 defect — `internal-only` for `internal_only` is not a restricted document, it is a mislabelled one, and the two look identical from the console. With no vocabulary configured the kernel's coinage check is off, so free entry stays available and says so; an unscoped OSS deployment must still be able to tag. Selecting a CLOSED label warns before the write: it makes the document deny-by-default for everyone, the operator included, until a policy grants it.
  - Lifecycle (UI-IMPL-26)
- **Design System:** `design-system/` is established with tokens, components, and utilities.
- **Audit remediation (Phase 1–4):** the full middleware audit is tracked in `../docs/plan-remediation.md` (5 phases, 17 tickets). Phase 1 (Safety Net: `ErrorBoundary`, hardened `formatRelativeTime`, `useStore` selector), Phase 2 (Mutation Integrity) and Phase 3 (Unwired Actions: grant/revoke, registerMCP, setScope, HITL resolve) are complete. Phase 4 (Test Hardening) — T4.1 is done: `tsc --noEmit` clean and **148 tests pass** (74 net-new across all mutating + read-only screens). A shared `useMutation` hook lives at `lib/useMutation.ts`; Tool/MCP/Scope/ChatSurface/SessionDetail/Lifecycle gate mutations by `role === 'operator'` and surface real kernel errors via `ErrorState`; memory/plan reason fallbacks removed so an empty reason is never faked (buttons disable instead). T4.2 (a11y hardening) is complete: the four P2 screens (Watch, Lifecycle, Verifier Pool, Cost & Energy) now have vitest-axe `toHaveNoViolations` coverage; heading-order violations fixed by adding visually-hidden `<h2>` section bridges (`.cambrian-sr-only`) between the page `<h1>` and the shared `CardTitle` `<h3>`; full suite **152 tests pass**, `tsc --noEmit` clean.
- **T5.1 (Comment cleanup):** removed all line-leading `/* … */` block comments from the 57 in-scope `src/` files; the targeted grep returns zero matches, `tsc --noEmit` is clean, and the full vitest suite passes.
- **T5.2 (Stale focus URL param):** added `replace: true` to all 8 row-click/cross-link `navigate` calls that set/clear `?focus=` in the 6 list consoles, and added a `useEffect` scrubber to each console that clears stale `focus` values when the focused id leaves the membership list; 6 scrubbing tests added, `tsc --noEmit` clean, full vitest suite passes.
- **T5.3 (MEDIUM/LOW audit items):** wired the remaining audit items — `relativeTime` NaN/undefined/future guards; `CircuitBreakerPill`/`MCPConnectionPill` unknown-state → neutral gray `unknown` pill (not green `ok`); `formatUSD`/`formatDuration` non-finite → `—`; Verifier/Cost loading state unified with Lifecycle's `isHydrating` check; Cost array-index keys → content-based (`model_id`); `ConfirmMutationDialog` reason `maxLength={1024}`; `aria-current="true"` on selected list rows; `EmptyState` optional `action` prop wired for clear-filters in the 7 filtered consoles; **158 tests pass**, `tsc --noEmit` clean. Phase 5 (Polish) complete.
- **Gap closed (follow-up to T4.1):** `MemoryDetail` and `PlanWorkSurface` now gate every mutating control by `role === 'operator'` (Viewers see disabled controls + "These actions require the Operator role."), route all mutations through `useMutation`, surface failures via `ErrorState` (role="alert"), and use `ConfirmMutationDialog` for the mandatory reason. `MemoryDetail`'s 4 actions (Tag/Delete/Promote/Supersede) and `PlanWorkSurface`'s Pause/Resume now match the `ScopeDetail`/`SessionDetail` pattern; Promote/Supersede no longer fake a hardcoded reason. **161 tests pass**, `tsc --noEmit` clean. The T4.1 "Viewer sees disabled controls" + "mutation rejects → ErrorState" bullets are now satisfied for these two screens.

---

## Responsibilities (target module map)

| Area (target) | Responsibility |
|---|---|
| `ipc/` | The Tauri client: `invoke(...)` user intents (login, send_message, inject, set_grant, …) and `listen(...)` for **projection events** from the Rust core. This is the only way the webview reaches the runtime — through the core. |
| `store/` | A **projection store** (e.g. Zustand) hydrated from the core's events. A **cache**, not the state of record. On mount / after a reload, re-request the current projection from the core. |
| `screens/` | One screen per PRD surface; **each screen traces to a user story** in `../docs/web-ui-prd.md`. The plan view is the centre of gravity when a plan is running. |
| `design/` | The design system: tokens (color/type/spacing/motion/elevation/focus), components, iconography — derived from Cambrian brand assets. **Dark-mode-first, dense, keyboard-friendly, accessible by construction.** |
| `lib/queryClient.ts` | The TanStack Query client, for the **imperative edges only**: mutations, and the request/response reads that are not on the feed. Every automatic refetch is disabled on purpose. **Nothing that arrives on `kernel://state` may be cached here** — that is `store/`'s job, and putting it in Query would reintroduce polling and let the console disagree with the kernel. Mutations never invalidate: the effect arrives on the feed. |

### Shell composition

The shell is a header, a grouped nav rail, the routed main pane, and **an inspector that is mounted only while a screen is inspecting something** (`components/InspectorSlot.tsx`: `useInspectorHost` on the shell side, `<Inspector>` on the screen side). Two rules follow from that:

- **No screen renders its own permanent aside.** Two stacked 360px inspectors is what this replaced — it left the list 480px of a 1440px window with both panels saying "select something".
- Outside a shell (a screen rendered standalone, or in a test) `<Inspector>` renders **in place**; inside a shell with no inspector offered (mobile) it renders **nothing**, and the screen navigates to a full-screen detail instead.

There is **no bottom status strip**. Connection and cursor are the header pill, in-flight plan counts are on the rail, spend is in the header, and circuit breakers live on Cost & Energy — surfacing in the header only when one is not `ok`.

---

## How the webview gets data (no gRPC here)

```
Rust core (state of record) ──Tauri events (typed projections)──> store ──> React screens
React screens ──Tauri invoke (op_* intents)──> Rust core ──gRPC──> kernel
```

The Rust core's bridge is **live** (see `../src-tauri/CONTEXT.md` for the full table). Concretely:

- **Listen to events** (`@tauri-apps/api/event` `listen`):
  - `kernel://state` → the full `StateOfRecord` projection — `{ connection, role, kernel_version, contract_version, capabilities, contract_skew, cursor, plans, sessions, audit_tail, pending_hitl, agents, tools, skills, mcp_servers }`. Replace the store with it (the core is authoritative). Emitted on connection change, snapshot, and each structural feed event.
  - `kernel://token` → `{ session_id, step_index, text }` — the live-only token lane; append to the active step's output buffer, do NOT store it as record.
- **Invoke commands** (`@tauri-apps/api/core` `invoke`): `op_login(endpoint, username, password) → role`, `op_get_state() → StateOfRecord` (hydrate on mount), `op_create_session`, `op_send_message`, `op_inject_correction`, `op_pause_session`, `op_resume_session`, `op_resolve_hitl`, `op_set_tool_grant`, `op_set_scope`, `op_register_mcp`, `op_register_skill`, `op_trigger_consolidation`, `op_list_tools`, `op_list_skills`, `op_list_watches`, and the ADR-0084 conversation lane `op_open_conversation`/`op_send_turn`/`op_list_conversations`/`op_list_conversation_messages`/`op_close_conversation` (the `/chat` screen; gated on the `chat` capability — `SendTurn` runs on the kernel's chat worker pool, never the planner). All async; errors come back as strings — surface the real message, not a generic toast.
- **Reads are push, writes are intents.** No "click to refresh" — render from the folded `kernel://state`. Every mutating `invoke` requires a **`reason`** (the kernel rejects empty); the `command_id` and token are the core's job, not yours.
- **Contract 0057 degradation (graceful).** 0057 removed the per-entity getter RPCs (`GetTool`/`GetAgent`/`GetSkill`/`GetMCPServer`/`GetScope`/`GetWatchConfig`) and the rich detail fields from `StateOfRecord`. The 6 detail screens (Tool/Skill/Agent/MCP/Scope/Watch) therefore read their entity from the projection summary arrays (`state.tools`/`skills`/`agents`/`mcp_servers`/`scope`/`watch_configs`) and render only the fields the kernel projects today. **Population path (closed gap):** `agents` is folded from `AgentReadyOp` feed events; `watch_configs` is folded from `WatchTriggeredOp` feed events; `tools`/`skills`/`watch_configs` are additionally upserted from `op_list_tools`/`op_list_skills`/`op_list_watches`, which the Tools/Skills and Watch consoles call on mount. **MCP and Scope stay empty** — 0057 has no RPC and no feed event for them (kernel-limited; request in `HANDOFF-afsin-core-projection.md` §0). Rich panels that need fields core doesn't yet project (tool schema, agent manifest/cognitive fingerprint, MCP health history, scope change history, watch rules/fires) are shown as honest "not projected by the current kernel build" notes — never faked. The missing projection fields to close this gap are tracked in `HANDOFF-afsin-core-projection.md` (additive; no new RPCs needed).
- The webview holds no kernel state the core didn't give it. A **reload re-hydrates** via `op_get_state` from the still-connected core (drafts/in-flight/pending approvals survive — they live in the core).

## UX principles (from the PRD)

1. **One mission-control visual language** across chat + console. No second style.
2. **The plan is the centre of gravity** — when a plan runs, the plan view is always visible.
3. **Realtime is the default; mutations are loud, reads are quiet.** A destructive action needs a confirmation that names the consequence.
4. **Show the truth, including the ugly** — crashed agents, failed plans, verification disagreements, a disconnected kernel are first-class states, not hidden errors.
5. **The runtime's vocabulary is the UI's vocabulary** — Substrate, ExecutionPlan, Gatekeeper, TrustScore, HITL, Inject, Plans in Flight, … (root `../CONTEXT.md §7`). No synonyms.
6. **Accessible by construction** — keyboard nav, focus order, contrast (WCAG AA in dark mode min), screen-reader semantics. Not a follow-on (PRD story 46).

## Role & capability reflection

The Rust core tells the webview the `role` (`operator`/`viewer`) and the `capabilities`/version from the handshake. The webview:
- **Hides/disables mutating controls for a Viewer** (the kernel enforces it server-side; the UI only reflects it).
- **Hides surfaces the kernel doesn't advertise** (e.g. Watch/daemon screens when absent) and **shows a version-skew banner** when the kernel's `contract_version` differs from the pinned `0067`.
- **Wraps every plugin-contributed surface in `components/PluginSurface.tsx`** (ADR-0089). `contract_version` covers the OSS proto surface only — it cannot detect a plugin two majors ahead of the panels compiled here, because those RPCs live on the plugin's own plane and answer normally. `PluginSurface` owns both halves of that: the per-plugin skew banner (silent when aligned, quiet on a minor difference, loud across a major line) and the absent state, which distinguishes "this kernel has no such plugin" from "it declined to register" using the state and reason the kernel now reports. Wrapping is the entire opt-in — a new plugin panel gets the banner by existing, not by its author remembering. Skew informs, it never withholds: a warned surface still renders.

## Out of scope (PRD)

No marketing site, no end-user chat product, no agent IDE, no marketplace, no full observability/Grafana clone, no mobile-native, no i18n at V1 (externalize strings), light mode is a follow-on (dark-mode-first).

## The Ingress Studio (`screens/ingress-studio/`, route `/ingress-studio`, ADR-0112)

Where external sources become armed ingresses: describe → secure+capture → draft →
confirm → dry-run → arm, three human gates on purpose. Mounted inside `PluginSurface`
(`pluginId="ingress-studio"`, capability `ingress-studio`, reported post-Build). Rules:

1. **The kernel's state machine is the only authority.** Buttons appear by state as a
   courtesy, but legality is decided server-side and a refused move renders its NAMED
   reason inline — the screen never pre-empts or paraphrases a guard.
2. **Credentials are write-only.** Password inputs clear on both outcomes; the only
   render-back is `configured` + last four. An unconfigured binding says the consequence
   ("deliveries answer 503"), not just the fact.
3. **An abstention is a result.** The drafter declining renders with the model's reason
   and next steps, styled as information — a drafter that cannot say "I don't know"
   would be guessing.
4. **The coverage report is the confirm gate's artifact** (plan D13): mapped, unmapped
   ("check each is intentional"), named discards, absence rates. Review is meaningful
   only when the omissions are visible.
5. **The dry-run preview says it is ephemeral** — memory-only, capped, gone on restart —
   and polls fast (5 s) because it is the pane an operator watches while sending test
   traffic. Everything else polls at 15 s; there is no feed lane and nothing pretends
   to be live.

## The drift surfaces (`screens/drift/`, route `/drift`, ADR-0102)

The drift product's own output. Mounted inside `PluginSurface` (`pluginId="drift"`, capability `record-lane`) so contract skew is reported by construction and an absent plugin renders as a *complete deployment*, not a fault. Four surfaces behind `?tab=`: **Alerts**, **Ledger**, **Coverage**, **Retention**; `?alert=` selects one alert's evidence, which fills the **inspector slot** rather than a permanent aside.

Five rules govern this screen, and each exists because the obvious implementation is wrong:

1. **Silence has two meanings, so there is no empty state.** "No drift found" and "nothing could be compared" are different facts that the kernel keeps apart the whole way through — four outcome kinds, five unresolved reasons, refusals on their own surface. The feed therefore carries a *permanent* card pointing at the ledger, and an empty alert list says which of the two it is instead of rendering nothing.
2. **`GetDriftStats.available === false` is never a tally of zeros.** When it is false the not-configured card is the **entire page**: the four outcome cards, the reason list and the refusals do not render at all. A deployment with no reconciler and one with nothing wrong produce identical numbers, and this is the only thing that tells them apart.
3. **Citation markers are derived, never hardcoded.** `drift-format.ts` parses the kernel's `[n]` markers and resolves each against `citations[]`; the `[3..n]` run comes from the history array's own length. A marker with no citation renders as **plain text**, not as a followable superscript — a hardcoded `[3][4]` once produced two unfollowable markers on two of three alerts, and this page argues for that invariant in its own copy.
4. **Nothing implies an action the product does not take.** No Resolve, acknowledge, dismiss or snooze: alerts have no state field, and a UI-local flag is wrong the moment there are two operators. "N since you last looked" is the honest substitute — it is a claim about this client only, so a local high-water mark is the right shape for it.
5. **`refused` is styled with the accent, never as an error.** It is the product declining to cross a classification boundary, which is the thing being sold.

**Coverage carries two more silences that must not collapse.** `GetCoverage` returning an empty list means *no connector has reported* — the store is pushed and process-lifetime, so that is the absence of a statement, not a statement that everything is covered. And `GetPushStatus` is driven off the record rows, so a kind configured in the exporter but never pushed once has no entry at all; the list says it is not exhaustive rather than implying it. The retention horizon is read through `describeHorizon()` because it has **three** states — `N` days, unlimited, and `-1` "not reported" — and a console that printed unknown as unlimited would be making a recall claim against the wrong denominator. (The design mockup's `90 d · plan tier: pro` was wrong for that reason: only `free` is 90 days in the connector's table.)

**This screen polls, and it is the only one that does.** `ListAlerts` is request/response only — alerts are not on the operator event feed, and putting them there is a contract bump — so the alert queries set `refetchInterval` explicitly against an otherwise inert `queryClient`. The header says "polled N s ago" for exactly that reason: a pulsing live dot over a poll would be a lie. Retention is the exception and *is* folded (`retention_runs` on the projection, capability `retention-feed`), merged with `ListRetentionRuns` so a pass from before login is still visible on the first paint.

`tags[]` on an alert are **inherited** classification (ADR-0095 D9). An alert is never more visible than the material it quotes, and it is the artifact most likely to be forwarded — so the copy/export path leads with the tags, and any future share affordance must too.

## The Knowledge console (`screens/knowledge/`, route `/knowledge`, ADR-0118, PRD story 54)

Asking, exploring and auditing the knowledge substrate. Mounted inside `PluginSurface` (`pluginId="substrate"`, capability `substrate-query`, reported post-Build) — an absent plugin or a Postgres-less kernel is a complete deployment, not a fault. Three surfaces behind `?tab=` (**Ask**, **Explore**, **Contradictions**); `?entity=` centres the explorer, `?receipt=` opens the evidence drawer in the **inspector slot** — all three are things an operator sends someone, so they are search params.

Rules, each load-bearing:

1. **The ask box is the only user-facing query surface — there is deliberately no structured query builder.** The kernel compiles the question into the closed AST; curated drill-ins (entity cards, contradictions, receipts) cover the structured shapes via `knowledgeQuery` as internal plumbing.
2. **An answer always renders its guarantee label verbatim AND the compiled query.** A row set without its warranty is just another ranked list, and the compiled chip is what keeps NL convenience from becoming NL ambiguity — the operator always sees exactly what was asked of the store.
3. **A refusal is the plane WORKING** — rendered as "Refused — by design" with a word and a shape (dashed border), never error styling; `lane_hint === 'memory'` links the memory page, because open-ended questions belong to the approximate lane.
4. **The receipt is one click from any value.** Every substrate row keeps its `evidence_id`; `RowTable` renders it as the one interactive column, opening `ReceiptInspector` (source surface, source key, content hash, classification tags — the scopes that gate the material).
5. **Rows render as a dynamic table** (`rows.tsx`): shape-specific keys, undecodable rows stay visible, zero rows say "an answer, not an error". No schema this build guessed at.
6. **Full-visibility by design** (ADR-0118 v1): operator numbers include classified material, and nothing on this page reflects what any agent can see — agent reads elsewhere are scope-filtered.
7. **This page does not poll.** Holdings change on ingest cadence; the overview reads on navigation with `staleTime: 60s`, and everything else reads on demand. The outbox badge ("N materializing") is the honest async-ingest indicator.

The co-participation graph (`NeighborGraph`) follows the PlanGraph conventions (dagre layout, tokens for every colour, hidden attribution) and is bounded by the query plane's own hop cap; node clicks re-centre the entity card — exploration is the feature.
