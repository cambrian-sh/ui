# Cambrian Studio — Development Rules

> **Name.** This repository (`ui/`) is **Cambrian Studio**, the desktop app. "Operator
> UI" is retired as a product name. The *operator* role and the operator-plane gRPC
> contract keep their names — they are kernel vocabulary. Internal identifiers stay
> as they are so saved logins and app data survive: bundle id `com.cambrian.ui`,
> keychain service `cambrian-ui`, crate `cambrian_ui_lib`.

> **This file is canonical.** `CLAUDE.md` in this directory points here; it is not a
> second copy. Edit this file, and never maintain the two by hand.
>
> They were previously two hand-maintained copies that drifted into stating
> *contradictory* invariants — this file carried the pre-ADR-0073 "only
> `OperatorConsole`" rule, which forbids the premium planes the UI is required to
> render, and omitted the session→TASK naming exception entirely. An agent reading
> one file and an agent reading the other derived opposite rules. The content below
> is the correct, current version.

## Knowledge & tickets in HQ (MANDATORY — every task)

The full protocol is root [`../AGENTS.md` §0](../AGENTS.md) — read it. **All project knowledge and
all live status live in HQ**: ADRs, decisions, investigations, research and knowledge cards are
versioned HQ documents (the `cambrian-knowledge/` repo is read-only until it is archived — never edit
it), and tickets, ADR status, card freshness and benchmark runs are HQ records. Use the `hq` MCP
tools (`ready`, `create_ticket`, `update_ticket`, `list_tickets`, `brief`, `read_doc`, `search_docs`,
`write_doc`, `record_finding`, `verify_card`, `list_decisions` / `set_decision_status`, the benchmark
tools) or `C:/Users/afsin/Dev/hq/bin/hq.exe … --config ../hq.yaml`. Every call carries your HQ token
(MCP header; the CLI and hooks read `~/.hq/token-cambrian`) — never print it. In short, for every
change in this repo, however small:

1. **Before editing:** `ready` / `list_tickets` (`repo: "ui"`) → `create_ticket` if the work is
   not ticketed → `update_ticket` action `claim`. `brief <path>` (or the card that loads when you
   open a file) for the cards, ADRs, decisions and open tickets that govern the code you will
   touch; a drifted card or stale ADR is a claim to re-verify against code before relying on it.
2. **While working:** `log` findings, dead ends and `decision:` lines on the ticket. A bug or
   follow-up you will not fix now gets its own `create_ticket` (`triage=true`), immediately.
3. **Decisions:** architectural → document `adrs/NNNN-slug.md` via `write_doc` (`status: proposed`,
   template `meta/SCHEMA.md`; its lifecycle status is set in HQ, not the frontmatter); operating rule
   → document `decisions/<slug>.md`; tradeoff → the ADR's `tradeoffs:`. ADR and decision writes are
   **drafts** only the owner approves — never approve one yourself. **Never write ADRs to
   `docs/adr/`** — no sub-repo has that directory.
4. **Before reporting done:** benchmark runs → a run record each (`record_benchmark_run`; the
   procedure is root `../AGENTS.md` §0.5); other numbers you produced → the ADR's `measurements:`;
   gotchas → `observations:` (ADR drafts) or `record_finding` on the card; re-verified ADRs →
   `last_verified` + `verified_at_rev`; cards you re-read against code → `verify_card` (the Stop hook
   blocks while a card your edit drifted is unverified); architecture, behaviour or gaps changed →
   the area's card via `read_doc` → `write_doc` (with `base_rev` and a reason; never an empty or
   truncated text). `CONTEXT.md` here is a short stub — never add facts to it. Then `close` the
   ticket with a resolution (files changed, documents written with their revisions, drafts left for
   the owner, tests run and result) — or, if unfinished, `log` where you stopped and `release`.

Pass `by: "agent:<name>"` on HQ calls (you are recorded as `agent:<name>@<person>`). Tickets never
close from commit messages.

**Default execution lane (ADR-0150, owner decision 2026-11-13).** A request runs in the
**single-agent lane** by default: one agent holds the person's tools and answers itself, fanning
out read-only work through the kernel-run `run_subtasks` tool (`execution.lane.default:
single_agent`, `cambrian-core/internal/config/lane.go`). The ADR-0145 **multi-agent research lane** (planner →
Gatekeeper → Dispatcher → DAG, coverage, verifier) runs only under `execution.lane.default:
planner` and is kept for research — so plan views, dispatch events and Gatekeeper scoring appear
only in that lane. See document `decisions/default-lane-single-agent-with-fan-out.md`.

## Session Bootstrap (REQUIRED)

Every new session MUST start by reading, in full:
1. **The knowledge cards for the area you will touch** — `brief <path>` in HQ (e.g. `brief ui/src-tauri`, `brief ui/src/screens/inbox`); `brief card.subsystem.operator-ui` for the whole picture. Cards (`card.ui.*`) are the source of truth for architecture, layer responsibilities, decisions and gotchas; `CONTEXT.md` here is only a stub.
2. **`docs/prd/web-ui-prd.md`** — the product spec (what to build: 53 user stories, 24 use cases, the V1 demo path, out of scope).
3. **`proto/operator.proto`** — the vendored, pinned gRPC contract. The *only* API to the runtime.

Then read the **layer file for the layer you are working in**, and its `AGENTS.md`:
- Working in the **Rust core / transport / state** → `src-tauri/AGENTS.md` + `brief ui/src-tauri` (`card.ui.operator-transport`, `card.ui.auth-sessions`, `card.ui.dev-bridge`).
- Working in the **webview / UI / projection** → `src/AGENTS.md` + `brief ui/src` (`card.ui.shell-routing`, `card.ui.capability-gating`, `card.ui.design-system`, the screen cards).

Do not assume anything about the runtime, the transport, or the domain terminology without consulting these. For runtime-side rationale, document `adrs/0047-operator-transport-plane-a-sequenced-grpc-surface-for-the-ca.md` is the authority (this UI consumes ADR-0047's Operator Transport Plane).

## The architecture in one paragraph

This is a **Tauri 2** desktop app: a **Rust core** + a **React 19 / TypeScript** webview. The Rust core holds a **native `tonic` gRPC client** (one HTTP/2 connection) to the Cambrian runtime-core's **`OperatorConsole`** service, and bridges to the webview over **Tauri IPC**. Two hops: `kernel ──gRPC──> Rust core ──Tauri IPC──> webview`. The webview NEVER speaks gRPC and NEVER opens a socket to the kernel. The Rust core is the **client-side state of record**; the webview store is a **projection/cache**.

## Non-negotiable rules

- **Only the operator plane.** The runtime is reachable through the pinned `OperatorConsole` service in `proto/operator.proto`, **plus** any premium-owned service mounted on the same kernel server behind the same operator auth interceptors — vendored under `proto/<plugin>/`, spoken over the same connection and token (ADR-0073/0088). Never call the agent-facing `Orchestrator`/`AgentService`. Never carry an `x-agent-id` principal for a human. Never bypass the kernel (no direct DB, no parallel store). The UI is a **controller over the kernel's boundary, not a back door**.
- **A premium surface is capability-gated, never probed.** Render a plugin's panel only when `capabilities[]` from the handshake carries its string (`access-policy`, `chat`, `memory-answer`, …). The kernel forwards plugin capabilities without interpreting them (ADR-0082 D2), so this is the whole rendering contract. When the capability is absent, say what the deployment **is** — an unscoped OSS kernel is correct, not broken — and never turn the empty state into an upsell.
- **gRPC lives in the Rust core only.** Put `tonic`/`prost` and all kernel I/O in `src-tauri`. The webview gets typed data via Tauri commands/events. Do NOT add gRPC-Web, Envoy, `protobuf.js`, or browser sockets — they are unnecessary and forbidden by the architecture (the kernel speaks native HTTP/2 gRPC, which the Rust core handles).
- **The vendored proto is pinned and read-only.** Do not hand-edit `proto/operator.proto`. Re-vendor from the kernel repo (`api/proto/operator.proto`) when the contract bumps, and update the pinned-version header + `card.concept.contract-version` / `card.ui.operator-transport` (`write_doc`).
- **Use the kernel's vocabulary verbatim** (Substrate, ExecutionPlan, Gatekeeper, Dispatcher, TrustScore, HITL, Inject, Plans in Flight, …). Never invent synonyms. See `card.concept.glossary` (`brief card.concept.glossary`).
  - **Auctioneer is not in that list any more.** ADR-0100 P3 deleted the auction; `domain.Auctioneer` is `domain.StepDispatcher` and selection is capability-typed dispatch. Contract 0102 renamed the wire too: the feed payload is `SelectionEventOp` (oneof `selection`, field 35; field 10 `auction` is reserved), its candidates are `SelectionCandidateOp` (with `merit`, not a bid confidence) and the semantic gate verdict is `SemanticGateOp`. There are no bids to render.
  - **One deliberate exception: a kernel `session` is called a TASK in the UI.** Every ask an operator makes is registered as a session, and "task" is what that is to a human. The rename is presentation-only — the wire keeps `session_id`, `SessionSummary`, `op_*_session`, and the route is `/tasks`. Do not "correct" the visible copy back to Session, and do not rename the wire to Task.
- **Realtime by default.** No "click to refresh" anywhere. State updates by folding the `StreamEvents` feed. The status of the connection (live / reconnecting / down) and what is stale must always be honest and visible.

## Transport rules (implement in the Rust core)

- **Auth (ADR-0142 D1):** ask the kernel how to sign in first — `DescribeAuth` (unauthenticated) names local password login and/or ONE OIDC issuer + client id. Password: `Login(username,password) → {token, role, principal, roles}`. OIDC: authorization code + PKCE in the **system browser** with a **loopback redirect** (`http://127.0.0.1:<ephemeral>/callback`, RFC 8252 §7.3), run entirely in `src-tauri/src/oidc.rs`; the ACCESS token is the bearer (its `aud` must carry the client id). Send `authorization: Bearer <token>` on every call. **Tokens, codes, verifiers, state and nonce never enter the webview, a log or the DOM**; the webview gets `StateOfRecord.identity` (display name, email, issuer, expiry, role source) only. Refresh runs in Rust 60 s before expiry; Sign out also revokes the refresh token (RFC 7009) and opens the IdP's end-session page with `client_id` (never `id_token_hint`). "Remember this instance" keeps the password or the OIDC REFRESH token in the OS keychain. Secure-by-default: a kernel with no sign-in method rejects every login (surface that state). TLS is additive on the remote hop.
- **Roles (ADR-0142):** `operator` | `viewer` | `member`. A `member` (signed in, no console role) may call only their own surfaces (chat, `WatchMyApprovals`/`AnswerApproval`, their accounts, Logout) — `Snapshot`/`StreamEvents` are refused, so the Rust core runs the **member lane** (`transport/session_auth.rs`) instead of the feed. Hide what a member cannot reach with the ONE gating rule: `entryAvailable(entry, capabilities, role)` (rail entries opt in with `forMembers`) plus `routeAllowedForRole` (`lib/roleGate.ts`) for deep links; `useCommandGate` refuses non-self-service commands for members. An OIDC session's role is PROBED until the kernel has a WhoAmI (T-20261106-operator-plane-has-no-whoami-an-oidc-signed-in) — say so (`identity.role_source`).
- **Feed:** subscribe `StreamEvents(last_seq)`. Events carry a **global monotonic `seq`** (the cursor) and **absolute-state** payloads. Fold them **idempotently** (last-writer-wins by id) — never as increments.
- **Recovery:** on a `ResyncRequired` event (cursor aged out of the ~120s spool), call `Snapshot`, replace state, and resubscribe from `Snapshot.as_of_seq`. Re-received events after a snapshot are harmless (idempotent fold). Gaps are impossible; duplicates are fine.
- **`token` events** (`seq=0`) are **live-only, never replayed** — accumulate text live; resync it from snapshot/pull on reconnect, not by replaying chunks.
- **Reconnect** (Rust↔kernel) with backoff+jitter (`base=1s ×2 cap=30s ±10%`); after ~2–5 min surface "kernel unreachable". A webview reload is a cheap local resync from the still-connected core — not a kernel reconnect.
- **Commands:** every mutating command needs a client-generated **`command_id` (UUID)** + a **mandatory `reason`**; reuse the same `command_id` across retries (the kernel dedups → `CommandAck{deduped}`). The actor comes from the token, never the body.
- **Roles & capabilities:** Operator vs Viewer vs Member is **server-enforced** (Viewer mutations → `PermissionDenied`); reflect it by hiding mutating controls. Read `kernel_version`/`contract_version`/`capabilities[]` from `Snapshot` — **hide surfaces the kernel doesn't advertise** and **warn on contract-version skew**.

## Development rules

- **Match the existing stack:** Tauri 2, React 19 + TypeScript + Vite, **Bun** for JS deps, Cargo for the Rust core. Don't introduce a second framework or a second visual language.
- **Dark-mode-first, dense, keyboard-friendly, accessible by construction** (WCAG AA in dark mode minimum). Accessibility is not a follow-on (PRD story 46).
- **Every screen traces to a PRD user story.** A screen with no story is scope creep; a story with no screen is a gap. The PRD (`docs/prd/web-ui-prd.md`) is normative.
- **The plan is the centre of gravity — when there is one.** Plans exist only in the multi-agent research lane (`execution.lane.default: planner`); in the default single-agent lane (ADR-0150) a request is one agent's turn plus its `run_subtasks` children, with no ExecutionPlan, Gatekeeper or dispatch events. When a session has a running plan, the plan view is always visible; chat and console are *around* it. Since the 2026-11-06 redesign the run (steps, live output, inline approvals) renders *inside* the conversation that started it, and Chat is the landing route.
- **One gating rule.** A rail entry declares `requires` / `requiresAny` (`nav-rail.tsx`, `entryAvailable`); a screen asks `useCapability()`; a mutating control asks `useCommandGate()` for its disabled reason. Do not add a fourth way.
- **One inbox count.** The rail badge, the header and the Inbox screen all read `useInbox()` (`lib/useInbox.ts`, which derives items with `buildInbox` in `lib/inbox.ts`). A new kind of pending human decision is added there, not as a second badge.
- **Secrets are write-only in the webview.** Integration credentials, org-account keys and OAuth client secrets are typed into password inputs, cleared on every outcome and sent once; nothing in the core returns a secret (an org key shows its last four at most), and the UI never stores one.
- **Account sign-in opens the SYSTEM browser from the Rust core.** `op_start_account_connect` opens the kernel's single-use start URL itself (http/https only) and returns only flow id / provider / scopes / expiry; never put the URL in webview state, a webview, or a log. Self-service account actions use `useCommandGate(action, { selfService: true })` (any role); everything org-wide is Operator-only.
- **External systems are one page each** (ADR-0141 D9). Account, data-in and agent-action logic lives in `lib/accounts.ts`; add a new account surface there and render it on the system page, not as a second accounts screen.
- **State of record = Rust core; projection = webview.** High-frequency event classes are batched at the core→webview seam; control classes (HITL, audit, errors, health, session lifecycle, terminal plans) are delivered immediately and un-batched. As built: `kernel://state` emits are coalesced in the Rust core to at most one per 100 ms (`src-tauri/src/emit_coalesce.rs`, `STATE_EMIT_WINDOW`; `is_control` decides the class; a control event flushes anything held, and the trailing change is always delivered). Token chunks go out on `kernel://token` one by one and the webview batches them (`createChunkBatcher`, `lib/stepOutput.ts`). Keep both halves: a new event payload gets a class in `is_control`.
- After changing how the UI talks to the runtime (transport, recovery, auth, the consumed contract), **update the card(s) for that area** (`card.ui.operator-transport`, `card.ui.auth-sessions`, …; `read_doc` → `write_doc`, then `verify_card`) so they always reflect the current integration.

## Generated files

`src/routeTree.gen.ts` is regenerated by the TanStack router Vite plugin on `bun run dev` /
`bun run build` after a route file is added or deleted. Never hand-edit it.

## What works today (so you can build against reality)

The runtime's Operator Transport Plane is fully implemented: all `OperatorConsole` RPCs respond; the feed carries auction / agent-ready / session-lifecycle / memory-written / HITL-raised / verifier-round / LLM-health / plan-state / audit / (best-effort) token events; commands have real effects; audit is durable. Deferred kernel-side items (design around them): always-on PauseController on the execute path, the LLM inject-planner, precise token `step_index`. See `card.ui.operator-transport` and the open tickets `brief ui/src-tauri` lists.
