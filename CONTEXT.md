# CONTEXT.md — Cambrian Studio

**Cambrian Studio** is a **Tauri 2 + React 19 + TypeScript** desktop app. Three layers:

1. **Rust core** (`src-tauri/`) — the ONLY gRPC speaker; owns the transport,
   state of record, auth, and recovery. See `src-tauri/CONTEXT.md`.
2. **Webview** (`src/`) — a projection/cache of the Rust core's state; never
   speaks gRPC. See `src/CONTEXT.md`.
3. **Proto** (`proto/`) — vendored from `cambrian-core/api/proto/operator.proto`.

For agent rules see `AGENTS.md`. For per-ADR status see `cambrian-knowledge/adrs/`.

---

## Knowledge & work tracking

This file is the *current shape* of the operator UI. It is not where decisions or work live:

- **Why it is this shape** — ADRs and decisions in `../cambrian-knowledge/`. Query the
  graph (`search_graph`, `query_graph`) rather than citing from memory; check an ADR's
  freshness before building on it.
- **What is being done, and what is broken** — tickets: `list_tickets` (`repo: "ui"`), or the
  knowledge-board Tickets view. Every change is ticketed, claimed, and closed with a
  resolution — the protocol is root [`AGENTS.md`](../AGENTS.md) §0.
- **What has been measured** — benchmark runs in `../cambrian-knowledge/benchmarks/`
  (`list_benchmarks` by `tag`/`adr`, or the knowledge-board Benchmarks page). Every benchmark
  run is recorded there, with a verdict — the procedure is root [`AGENTS.md`](../AGENTS.md) §0.5.
- **Every gap listed in this file should have a ticket.** Put its id next to the gap
  (`— T-20261031-…`); when the ticket closes, update or remove the gap here in the same change.

## Build & Run

```bash
bun install                  # webview deps
bun run dev                  # Vite dev server (webview only)
bun run build                # tsc + vite production build
bun run test                 # vitest (~894 tests, 94 files)
cargo check                  # Rust core type-check
cargo tauri dev              # full Tauri dev (Rust + webview)
bun run studio               # local kernel + Tauri dev + dev bridge: the live
                             # session is also at http://localhost:1420 in a browser
VITE_USE_MOCK_IPC=1 bun run dev   # webview on simulated IPC; ?scenario=populated|empty|degraded|viewer|disconnected
```

---

## Architecture

- **Contract pinned to `0101`** (`src-tauri/src/pb.rs` `PINNED_CONTRACT_VERSION`, history
  there). The Rust core handshakes and shows a skew banner on mismatch. 0101 (ADR-0139
  phase 2/3, additive) is fully surfaced since the 2026-11-06 redesign
  (T-20261106-operator-console-redesign-chat-first-shell): memory notes
  (`src-tauri/src/notes.rs`, Memory › Notes), skill lifecycle + grants
  (`src-tauri/src/skills.rs`, `/skills`, Inbox), and — vendored 2026-11-06 as an exact copy of
  core's proto, still 0101 — the integrations catalog (`src-tauri/src/integrations.rs`,
  `/integrations`, `OperatorEvent.integration_health` folded into
  `StateOfRecord.integration_health`). 0100 (ADR-0138
  Amendment B1, T-20261104-operator-upload-cannot-replace-a-document-a-re) is additive:
  the kernel keys an operator upload by (operator, classification scope, normalised file
  name). With capability `upload-replace` the ingest pane calls `op_match_upload`
  (`ListDocuments` `upload_name`/`upload_tags`) for each staged file. A match opens
  "Replace <name> (uploaded <date>)?" with **Replace** focused as the default; **Keep both**
  sends `<base> (n).<ext>` (the next n the kernel reports free, `src/screens/memory/uploadNames.ts`)
  through `op_ingest_file`'s `filename` override, and closing the dialog skips the file. The
  ingest response tuple gains `duplicate_of` / `version`: the queue row reads "duplicate of
  <id> · nothing written" or "replaced the earlier version (vN)". The kernel replaces a
  same-named upload even without the prompt; the prompt is UX. 0099 added `Logout`,
  the ADR-0134 event-time fields on memory ingest/query/hits and the ADR-0101 D8 file facts
  on config-write outcomes. The console uses all three
  (T-20261101-ui-for-contract-0099-logout-config-override):
  - **Sign out** (`op_logout` → `Logout`, then the same local teardown as `op_disconnect`;
    `src/lib/signOut.ts` also drops webview caches and chat/discovery pointers). Shown in the
    header and Settings › Connection only when the kernel advertises `logout`; a token the
    kernel did not revoke (older kernel, unreachable) is said so on the login screen.
  - **D8 file facts**: `ConfigFileFacts` (settings/ConfigFileFacts.tsx) under every config
    write ack (generator, role assignment, MCP server) — "written to <file>", or a warning
    "stored; overrides <file> (file value: X)" with **Revert to file** (`op_delete_config` →
    `DeleteConfig`). Dispatch & retrieval lists every `value_source == "store"` key with the
    same revert. Gap: `GetConfigSchema` does not say which file a stored key overrides, so
    the read-side marker names the store, not the file.
  - **Event time** (capability `memory-event-time`): hits and citations carry
    `event_time_unix_ms` / `event_time_end_unix_ms` / `time_source` / `time_precision`
    (flattened `EventTime` in transport.rs); `src/lib/eventTime.ts` formats to precision
    (date-only precisions in UTC, never a clock time) and labels non-explicit sources. The
    ingest form sends `occurred_at` + `time_precision`. The memory detail shows the kernel's
    ingest time (document listing), never the UI-side receipt clock. Not sent: the event
    window (`event_after`/`event_before`) — the kernel refuses it until ADR-0134 P2 — and
    `reference_time`, `parts`.
- **Live step output** (ADR-0139 amendment 2026-11-06, additive within 0101, capability
  `step-output-stream`): `TokenChunkOp` gained fields 4-10 (`lease_id`, `task_session_id`,
  `agent_id`, `kind` text|progress|status, `chunk_seq`, `final`, `source` gateway|agent) and now
  carries every step's live output, native tool turns included. `transport.rs` forwards them all
  on `kernel://token` (`TokenChunk` in Rust and `src/ipc/types.ts`); `proto/operator.proto` is
  synced. The webview subscribes once (`Shell` → `lib/stepOutput.ts`, batched ~100 ms) and
  renders it per task/step in Chat and the task surface (`screens/run/LiveOutput.tsx`).
  Subagent nesting is inferred (no parent lease on the wire —
  T-20261106-tokenchunkop-has-no-parent-lease-so-the-console).
- **Approvals**: the feed's `HITLRaisedOp` lands in `pending_hitl` with `raised_at` (event
  ts), `session_id` and `kind` (`skill_access` derived from the hub's `skill:` description);
  a `resolve_hitl` `AuditOp` removes it, whoever resolved it. `WatchToolApprovals` runs beside
  the feed (started when the feed goes live, stops on Unimplemented) and merges `args_preview`
  / `kind` into the matching entry (`state::merge_approval`). The Inbox (`lib/inbox.ts`)
  adds pending skill proposals and timed-out skill-access requests (read, not pushed —
  T-20261106-skill-proposals-and-skill-access-requests-have). An approval of `kind`
  `schedule` (an assistant proposing a recurring task for the person it serves, kernel
  capability `scheduled-tasks`) is a `schedule_approval` row, approved through the same
  ResolveHITL path. **ADR-0142 D11 addressed approvals** (capability `addressed-approvals`):
  `merge_approval` copies `rule` / `answerable` / `beneficiary` / `allow_standing` / `expires_at`
  onto the card, and the feed's `HITLResolvedOp` (approved, denied, expired, withdrawn,
  needs_hierarchy, unroutable) removes it on every console. The Inbox shows "answered by
  <rule>", lists items the person may not answer (operator audit view) with approve/deny
  blocked and keeps them OUT of the badge count, answers through `op_answer_approval`
  (`AnswerApproval`; a refusal is shown, ResolveHITL stays the fallback on older kernels),
  offers "Approve always" (a standing approval) where `allow_standing`, and lists/revokes
  the person's standing approvals (`op_list_standing_approvals` / `op_revoke_standing_approval`,
  `StandingApprovals` in `screens/inbox/InboxConsole.tsx`). `operator.proto` carries act-for (`on_behalf_of`, capability
  `conversations-act-for`) and `ListScheduledTasks`; the console sends `on_behalf_of` empty
  and has no scheduled-tasks view yet (T-20261106-console-has-no-act-for-picker-or-scheduled).
- **Sign-in (ADR-0142 D1, T-20261106-console-has-no-oidc-authorization-code-pkce)**: the
  login screen (Settings › Connection) asks `op_describe_auth` (DescribeAuth) for the endpoint
  and renders exactly what the kernel offers: "Sign in with <issuer host>" (`op_login_oidc`),
  the password form, or both; an older kernel (Unimplemented) or a failed describe falls back
  to password (`lib/loginMethods.ts`). OIDC is authorization code + PKCE S256 in the system
  browser with a loopback redirect on `127.0.0.1:<ephemeral>/callback` (decision: loopback over
  a private-use scheme, RFC 8252 §7.3/§8.3/§8.10); state compared in constant time (a wrong
  state is answered and ignored); ID token iss/aud/azp/exp/nonce checked (signature left to the
  kernel, OIDC Core 3.1.3.7(6)); refresh with rotation 60 s before expiry; RFC 7009 revocation
  and RP-initiated logout on Sign out — all in `src-tauri/src/oidc.rs` (no OIDC crate: built on
  hyper / tokio-rustls / sha2 that Cargo.lock already carried, pinned). Session wiring is
  `src-tauri/src/transport/session_auth.rs`; the webview sees only `StateOfRecord.identity`.
  Tested against a mock issuer in Rust tests, not a live IdP. The plane role of an OIDC session
  is probed (Snapshot refused → member; the operator-only read ListScheduledTasks refused →
  viewer) until a WhoAmI exists (T-20261106-operator-plane-has-no-whoami-an-oidc-signed-in).
  **Member** sessions run a member lane instead of the feed (member surfaces probed:
  chat / addressed-approvals / accounts / logout; `WatchMyApprovals` into `pending_hitl`); the
  rail shows Chat, Inbox, Integrations and Settings only (`forMembers`, `lib/roleGate.ts`), and
  a deep link elsewhere shows "Not available with your role". The header and the Connection
  panel show who is signed in, how, and the role. Gaps: the WhoAmI ticket above;
  T-20261106-kernel-oidc-verifier-accepts-an-id-token-as-an (kernel).
- **Organisation (ADR-0142 stage 2, premium, capability `org-directory`)**: `src-tauri/src/org.rs`
  speaks every `OrgDirectoryAdmin` RPC (`proto/org/org_directory.proto`, vendored by the stage-2
  backend); the generated org messages derive serde in `build.rs` and cross the bridge
  unchanged. `/organisation` (Admin rail): **People & units** (tree with heads and members;
  unit create / move / delete; person unit / manager / title; suspend / reactivate;
  directory-owned rows read-only by the kernel's `editable`), **Mapping rules** (Save stores AND
  applies, so it is offered only after a preview of exactly this rule — `lib/hierarchy.ts`
  `ruleDigest` / `saveBlockedReason`; delete is preview-first; re-apply all), **Who approves
  what** (GetOrgChain + the person's approval limits + relationship fallbacks), **SCIM** (create
  and rotate show the bearer ONCE in a dialog held in component state; the listing has only the
  last four), **Directory sync** (Keycloak reconcile status, Sync now). Inbox: approvals that end
  `needs_hierarchy` / `unroutable` are kept in `StateOfRecord.unrouted_approvals` and listed as
  "Ended without an approver" with the reason and the fix; supervisor-routed items show the
  requester's escalation chain (GetOrgChain). Mock twin: `src/ipc/hierarchy-mock.ts`.
- **Premium planes**: AccessPolicyAdmin, TelegramAdmin,
  IngressStudioAdmin, SubstrateLane, Telemetry, AccountsAdmin, Links (on the OSS contract).
  Each rides the same gRPC channel + bearer token; gated by capability strings.
- **Accounts (ADR-0141 phase 4, capability `accounts`)**: `src-tauri/src/accounts.rs` speaks
  every AccountsAdmin RPC in `proto/accounts/accounts.proto` (phase 1 personal accounts +
  phase 2 ConfirmMyAccount, org accounts + Bind/Unbind grants, provider OAuth clients).
  `op_start_account_connect` opens the kernel's single-use `start_url` in the SYSTEM browser
  from Rust (tauri-plugin-opener; http/https only) and never returns it to the webview; the
  webview follows the flow by polling `GetAccountConnectFlow` (`lib/accounts.ts
  runConnectFlow` — the kernel pushes no event for a sign-in). Phase 2 added RPCs, not a
  capability: org accounts, people's accounts and provider clients are read only with
  `accounts` + the Operator role (they are Operator-only RPCs); self-service (connect,
  confirm, reconnect, disconnect) is open to every role (`useCommandGate(…, { selfService })`).
  Integrations is now one page per external system — `/integrations` lists systems,
  `/integrations/$systemId` has Accounts · Data in · Agent actions. There is no system-catalog
  RPC, so systems are DERIVED (`buildSystems`; T-20261106-console-derives-external-systems-because-the).
  Settings › OAuth providers writes `SetProviderClient` (secret write-only). The Inbox adds
  `account_confirm` / `account_reconnect` items from `ListMyAccounts`. Ingress Studio's
  credential rows gain an org-account picker (`BindOrgAccount` purpose `ingress`); inbound
  secrets stay in its credential list. Per-server Credentials are hidden for account-backed
  servers (per_user, or bound to an org account). Gaps:
  T-20261106-ingress-studio-cannot-tell-an-inbound-secret,
  T-20261106-console-personal-ingest-binding-account-owner,
  T-20261106-no-signal-tells-a-person-their-agent-stopped. Acceptance still needs a live
  sign-in against one real provider.
- **Dead outbox deliveries (2026-11-13, contract change in the vendored
  `proto/ingress/ingress_studio.proto` + `proto/substrate/substrate.proto`; no
  operator.proto / pb.rs pin change)**: Ingress Studio's Delivery failures list
  (`screens/ingress-studio/OperationsPane.tsx`) shows a Replay button on
  `dead_letter` rows, plus "Replay all N dead" when several, hidden when the session
  is read-only (`op_studio_replay_dead_deliveries` → `ReplayDeadDeliveries`; the
  kernel audits it). The knowledge overview strip shows `outbox_dead` as its own
  "N dead — not transformed" badge; "materializing" (`outbox_pending`) no longer
  includes dead items. Tests: `replayDead.test.tsx`, `knowledge.test.tsx`.
- **Data flow**: Rust core streams `kernel://state` (absolute-state projection)
  → Zustand store → React screens. Writes go through `invoke('op_*')` →
  Rust core → gRPC → kernel. No polling. (The drift console and its RecordLane
  plane were removed 2026-10-31 with the premium drift product.)
- **Plugin surfaces** wrap in `PluginSurface.tsx` (ADR-0089) — per-plugin skew
  banner, absent state, all automatic.

---

## Console layout (redesign 2026-11-06)

Audit and plan: `cambrian-knowledge/investigations/2026-11-06-operator-console-redesign.md`.
Rail groups: **Work** (Chat — home, Inbox — badge = every pending decision, Tasks),
**Knowledge** (Memory, Skills, Knowledge, Link review), **Automate** (Integrations — external systems, ADR-0141 D9,
Pipelines, Plan builder, Ingress Studio, Telegram), **Admin** (Runtime, Access policy,
Audit, Logs, Plugins) + Settings. Every optional surface is gated by one rule
(`entryAvailable` in the rail, `useCapability` in screens). Deleted: Now, Plans in flight,
Verifier Pool, Lifecycle, Cost & Energy (they read state nothing populates or duplicated
other screens). Theme (dark / light / system) and density persist in localStorage.

Known gaps (tickets): T-20261106-a-destructive-step-pause-hitl-is-resolved-with,
T-20261106-hub-approvals-on-the-operator-feed-carry-no,
T-20261106-hooks-and-a2a-agent-cards-are-not-visible-on,
T-20261106-runtime-tools-skills-tab-still-shows-the-old,
T-20261106-snapshot-only-plans-render-fabricated-step,
T-20261106-state-of-record-still-carries-never-populated.

## Key Invariants

- The webview holds NO kernel state the core didn't give it.
- Every mutation requires a `reason` (kernel rejects empty).
- `command_id` is generated inside the Rust core, never by the webview.
- Token events (`seq=0`) are live-only, never replayed, never stored as record.
- TanStack Query is for imperative edges only — nothing on `kernel://state` may be cached there.
