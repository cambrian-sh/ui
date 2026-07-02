# PRD-07 — Configuration & Audit

**Status:** Frozen v1.0 — locked 2026-06-22.
**Parent PRD:** `web-ui-ux-prd.md` v0.1 · [PRD-01](01-foundation.md) Foundation · [PRD-02](02-shell-and-layout.md) Shell & Layout.
**Sibling PRDs:** [PRD-03](03-chat-surface.md) Chat Surface · [PRD-04](04-plan-work-surface.md) Plan Work Surface · [PRD-05](05-memory-explorer.md) Memory Explorer · [PRD-06](06-operator-console.md) Operator Console.
**Source requirements:** `../requirements/web-ui-requirements.md` §2.3 (memory & resource governance), §2.6 (auth & access), §2.8 (deployment & reach), §5.3 (UC-15…UC-20), §5.4 (UC-21…UC-22), §5.5 (UC-23…UC-24).
**Source PRD:** `web-ui-prd.md` ID-1, ID-3, ID-6, ID-7, ID-10, ID-11.
**Story coverage:** Story 30 (tag a memory with a scope / evaluation tag, with blast-radius preview), Story 31 (register a new system skill), Story 32 (register a new MCP connection), Story 33 (adjust an agent's scope or write tags), Story 34 (grant or revoke a tool for an agent), Story 35 (trigger a manual consolidation), Story 36 (every mutation requires a confirmation that names its consequence), Story 37 (every mutation is recorded with actor, target, before/after, timestamp, reason), Story 38 (bulk-tag or bulk-supersede), Story 39 (status panel — PRD-02), Story 40 (Health screen — this PRD's "Health" sub-screen under Settings), Story 41 (Audit screen), Story 42 (export a slice of the audit log), Story 43 (realtime updates — PRD-02), Story 44 (kernel vocabulary — PRD-01), Story 45 (keyboard shortcuts — PRD-01), Story 46 (legible, navigable, keyboard alone — PRD-01), Story 47 (dark-mode-first — PRD-01), Story 48 (no generic toasts — PRD-01), Story 49 (Viewer read-only — PRD-02), Story 50 (Viewer can follow a running plan — PRD-02/04), Story 51 (audit deep-link to target), Story 52 (remote connection), Story 53 (draft recovery — PRD-03).
**Companion ADRs (all Frozen):** [UI-015](../adr/UI-015-config-schema.md) Config Schema (JSON Schema + TS codegen) · [UI-016](../adr/UI-016-audit-export-format.md) Audit Export (CSV + JSON, streamed) · [UI-017](../adr/UI-017-auth-provider.md) Auth Provider (Operator + Viewer; extensible).

---

## 1. Scope

**In scope.** The Settings surface (Connection / Runtime / UI control plane / Instance profiles / Telemetry opt-in); the Audit log + export (CSV / JSON); the blast-radius preview panel that gates every mutating action's confirm-with-consequence bar (the same component as PRD-05 §7); the first-run flow when no instance is configured; the per-resource drill-downs from every other PRD (the "configure this X" affordance); the role-gating enforcement on the settings surface (Viewer sees the form read-only, with a "this action requires Operator" disabled state per PRD-02 §7.2); the integration with the auth provider (UI-017) and the operator HTTP API (the existing `POST /v1/admin/...` surface that the UI sits on top of per product PRD ID-3).

**Out of scope.** The kernel's internal configuration storage (the kernel owns it; the UI is a form over the published schema, per LD-11). The kernel's audit log storage (the kernel writes; the UI reads + exports). The kernel's role enforcement (server-side authoritative; the UI reflects it per product PRD ID-7). The follow-on metrics explorer (PRD-06 / UI-014 deferred it). The mobile-native app (out of scope per product PRD).

---

## 2. Inherited decisions (cited by number)

**From the UX PRD `web-ui-ux-prd.md` §2:**
- **LD-1 — Shell shape.** The Settings entry is in the nav rail (PRD-02 §4.1); the Settings surface renders into the centre column with the right inspector as the "mutation context" shape (PRD-02 §4.4) when a form is open.
- **LD-8 — States.** Empty / loading / error / success / audit (PRD-01 §10) applied to every Settings sub-screen, the audit log, and the export flow.
- **LD-11 — In-app configuration.** UI is the **sole** end-to-end interface. Connection, runtime, UI control plane, instance profiles — all in the UI. Every config change is audited. **V1 settings scope cut (sub-decision from the session index):** free-form JSON editor is out; the UI is a form over the kernel's published schema, with description, default, current value, reset-to-default, and "what this does" tooltip. Destructive changes require a confirm-with-consequence bar + a mandatory reason.

**From PRD-01 (Foundation):**
- §4 (visual tokens; the Settings surface consumes them).
- §6 (component inventory; this PRD composes from `InstanceSwitcher`, `InstanceList`, `InstanceProfileEditor`, `RuntimeSettingsForm`, `UIControlPlaneSettings`, `DiffView`, `AuditList`, `AuditEntry`, `AuditDiff`, `AuditReasonField`, `AuditExport`, `ConfigFileRevealButton`).
- §7 (realtime grammar; the audit list is realtime; every config mutation's success is the audit entry).
- §8 (a11y contract; every form is keyboard-navigable; the DiffView is readable to screen readers; the reason field is a labelled input with a min-length constraint).
- §9 (keyboard; `j` / `k` for audit list nav, `Enter` to open an audit entry, `Esc` to close, `/` to focus the filter bar, `n` for "new" where applicable, `g x` to go to Settings, `g u` to go to Audit).
- §10 (state vocabulary).
- §11 (forbids; no free-form JSON editor; no bespoke per-form styles).

**From PRD-02 (Shell & Layout):**
- §4.1 (nav rail; the Settings + Audit entries).
- §4.2 (nav-rail footer; the instance switcher + operator identity).
- §4.4 (right inspector; the "mutation context" shape is the form + diff + reason + confirm-with-consequence bar).
- §6 (status strip; the circuit-breaker drill-in is a deep link to Settings → Runtime → LLM provider).
- §7 (role gating; Viewer sees Settings read-only).

**From PRD-05 (Memory Explorer):**
- §7 (the blast-radius panel is the same component reused here for every mutating action).

**From PRD-06 (Operator Console):**
- The per-resource mutating actions (scope / write tags / tool grants / new skill / new MCP / new watch config / manual consolidation) are the local form of the same mutations; the Settings surface is the global view. The two share the same blast-radius panel + confirm-with-consequence bar + reason field.

**From the in-repo `ui/CONTEXT.md` (PRD-01 §2.5):**
- **EC-1** (Tauri 2), **EC-2** (React 19 + TS + Vite), **EC-3** (Bun), **EC-4** (gRPC in Rust core; every Settings mutation goes through a Tauri command, the auth provider uses the in-repo `keyring` crate), **EC-5** (vendored proto at 0047).

**From kernel ADRs (cited, not re-decided):**
- **ADR-0019/0021** (OTel Bridge + Langfuse — the telemetry opt-in target).
- **ADR-0034/0035** (scoping + kernel-derived write classification — the source of the schema contract UI-015; the kernel is the source of truth for the editable keys).
- **ADR-0039/0040** (Tool Registry + Hermes — the tools panel; the Settings surface's "Tools" sub-screen is the global view of the same registry).
- **ADR-0042** (Centralized LLM Provider — the Runtime → LLM provider sub-screen; the price ledger, the circuit-breaker state, the failover ladder).
- **ADR-0043/0044/0045/0046** (MCP / semantic tool retrieval / two-tier disclosure / skills — the MCP and Skills sub-screens; the same data as PRD-06 §7 + §8).
- **ADR-0047** (Operator Transport Plane — the audit gRPC seam; `QueryAudit` + `OperatorEvent.AuditEvent` are the kernel-side data source).

---

## 3. The Settings surface

The Settings surface is the operator's primary workspace for setup and configuration. It is also reachable from drill-downs inside the rest of the app (the "configure this X" affordance from PRD-06's per-resource mutating actions).

### 3.1 Sub-screens

The Settings surface is organised into sub-screens, each reachable from a tab list (PRD-01 §6: `Tabs` component):

- **Connection (instances).** List of configured Cambrian instances. For each: label, colour tag, host, port, UDS path, auth method, namespace, last-seen, last health. The operator can add, edit, remove an instance. The current instance is highlighted with the colour tag and the accent border. The instance switcher lives in the nav-rail footer (PRD-02 §4.2); the instance list lives in Settings.
- **Runtime settings.** The subset of `config.json` keys the kernel publishes as operator-editable. The UI is a **form over the published schema** — the kernel is the source of truth for what is editable (UI-015). Each field has a description, a default, a current value, a "reset to default" affordance, and a "what this does" tooltip. Destructive changes (e.g. "disable the audit log") require a confirm-with-consequence bar and a mandatory reason.
- **UI control-plane settings.** Density (compact / default / spacious), theme (dark / light — both V1 per LD-3), shortcut map (the V1 map + the user's overrides), default landing (last screen vs pinned screen), panel sizes (left rail width, right inspector width), telemetry opt-in (deep-link to Langfuse/OTel; the UI does not collect telemetry unless the operator opts in).
- **Instance profiles.** A named bundle of (connection + UI + published runtime settings). Save, load, export, import. Profiles are the operator's "I run a development kernel and a production kernel" answer.
- **Telemetry & audit of config.** Every config change is audited with actor, target, before, after, timestamp, mandatory reason. The audit list is the same surface as the main audit list (PRD-07 §5). Config changes are tagged `kind=config` for filtering.
- **Health.** A sub-screen under Settings that summarises kernel health, LTM health, in-flight plans, queue depth, circuit-breaker state, current spend rate, event backlog — the same data as the status strip (PRD-02 §6) but with one-click drill-downs to the relevant console screen. This is Story 40's "single Health screen."

### 3.2 First-run flow (PRD-07 §11.2 of the parent UX PRD)

The first time the operator opens the app and no instance is configured:

- The app lands on the **Instance Setup** screen (a Settings sub-screen). The operator adds the first instance (host, port, auth, label, colour tag). The UI connects; on success, the operator lands on the **Sessions** screen.
- The first-run flow is skippable for developers: an "advanced" toggle shows the connection form on every launch until the operator turns it off.

### 3.3 Drill-downs

Every "configure this X" affordance in the rest of the app opens the relevant Settings sub-screen with the relevant field focused. Examples:

- From the instance switcher (PRD-02 §4.2): "Configure this instance" → Settings → Connection.
- From the agent detail (PRD-06 §6): "Configure scope" → Settings → Scope (the operator can also edit scope in the agent detail; Settings is for global view).
- From the audit entry of a config change: deep link to the relevant Settings sub-screen.
- From the status strip's "circuit-breaker" field: deep link to Settings → Runtime → LLM provider.

### 3.4 Role gating

The Settings surface follows PRD-02 §7.2: Operator sees the full surface (every mutating action rendered); Viewer sees the form read-only with a "this action requires Operator" disabled state. The role pill in the nav-rail footer (PRD-02 §4.2) carries the role. The audit list is read-only for Viewer.

---

## 4. The mutating-action contract (the heart of PRD-07)

Every mutating action in the Settings surface — and every mutating action in any other PRD's console entry — follows the same contract. The contract is the **product PRD ID-6 promise** (mutations are first-class and auditable; reads are quiet) + the **PRD-05 §7 blast-radius panel** (where the mutation affects scope) + the **PRD-01 §10 state vocabulary** (success = the audit entry appearing in real time).

### 4.1 The five-part form

Every mutating action opens a form in the right inspector (the "mutation context" shape, PRD-02 §4.4) with five parts, in this order:

1. **The form** — the field(s) the operator is changing.
2. **The diff** — before / after. `DiffView` (PRD-01 §6). For text fields, an inline diff. For structured fields (a list, a map), a side-by-side diff. For destructive changes, a "this will be removed" highlight.
3. **The reason field** — `AuditReasonField` (PRD-01 §6). Free text, **min 16 characters**. The character count is visible. The confirm-with-consequence bar stays disabled until the reason meets the minimum.
4. **The blast-radius panel** (where applicable) — `MemoryBlastRadius` (PRD-01 §6, reused from PRD-05 §7). For scope / write-tag / tool-grant changes, the panel re-computes on every keystroke (throttled to 250 ms per PRD-01 §4.4) and shows the impact.
5. **The confirm-with-consequence bar** — `Dialog` (PRD-01 §6, confirm-with-consequence variant). A sentence that names the consequence in plain language. A "Confirm" button + an "Edit" button (re-opens the form) + a "Cancel" button. Disabled until the reason is valid and the blast-radius panel has rendered.

### 4.2 The audit success state

On confirm, the mutation is sent via the relevant Tauri command (EC-4). On the kernel's `OperatorEvent.AuditEvent` (per the vendored proto, EC-5), the audit list updates in real time. **The audit entry appearing in real time is the success state** (product PRD ID-6). A non-destructive mutation also shows a 3-second confirmation toast (PRD-01 §10.4): the toast name-checks the action ("Granted `terminal_tool` to `analyst`.").

### 4.3 The reason field

The reason field is **mandatory** (product PRD ID-6). The 16-character minimum is the V1 default; PRD-07 can refine it. The field is a labelled input with a character count. The reason is recorded as the audit entry's `reason` (per the vendored proto, EC-5). The reason is a UI concern; the kernel stores what the kernel stores.

### 4.4 Destructive changes

A destructive change (delete a memory, revoke a grant, override a HITL, disable the audit log) requires:

- The five-part form (above).
- The confirm-with-consequence bar with a red-tinted border.
- An explicit "type the target's id to confirm" affordance for the most-destructive actions (delete a memory, override a HITL).
- A 3-second hold on the "Confirm" button before it enables (a final brake against fat-finger).

The destructive-change UX is PRD-01 §11 forbids-compliant: no toast (a toast is reserved for non-destructive confirmations per PRD-01 §10.4); the destructive confirmation is the audit entry, not a toast.

---

## 5. The Audit log

The audit log is the operator's primary tool for accountability. Every mutating action is recorded (product PRD ID-6). The audit log is the same surface as the main audit list (PRD-07) + every other PRD's "recent activity" list (PRD-05, PRD-06).

### 5.1 List

A virtualised list of every mutating action. Filter by:
- **Actor** (operator + role).
- **Target** (agent id, tool id, skill id, MCP server id, memory document id, session id, plan id, config key).
- **Type** (scope change, write-tag change, tool grant, memory tag, memory supersede, memory delete, skill register, MCP register, watch config create/update/delete, manual consolidation, session pause/resume/complete, HITL approve/reject/edit, config change).
- **Time range** (date range picker; default last 24 h).
- **Kind** (`config`, `data`, `runtime`).
- **Free text** (search over the reason field + the target id).

Each row: timestamp, actor, target, action type, status, reason (truncated).

### 5.2 Detail

Opens in the right inspector (the "audit context" shape, PRD-02 §4.4):
- The full entry: actor, target, before, after, timestamp, reason.
- The before / after diff (`AuditDiff`, PRD-01 §6).
- The reason (full text, not truncated).
- A deep link to the target (the agent, the tool grant, the memory document, the skill, the MCP server, the config key).

### 5.3 Realtime

The audit list is **realtime** (product PRD ID-5 + ID-6). Every new audit entry from the kernel's `OperatorEvent.AuditEvent` stream appears in the list within one render. The pulse-and-trail grammar (PRD-01 §7) is applied: a new entry slides in from the top (audit list is reverse-chronological); the new entry's status pill is "applied"; the trail mark fades after 600 ms.

### 5.4 Export (Story 42, UI-016)

The audit list is exportable. The export formats are CSV and JSON (UI-016). The export is filtered to the current list view (the operator's filter set). The export is auditable itself (an `audit_export` action with the filter set as the audit entry's `target`).

### 5.5 Audit deep-links (Story 51)

Every audit entry deep-links to its target. The target is rendered into the centre column + the right inspector (per the target's owning PRD). The deep link is typed (UI-003 router): `/audit/$entryId?target=agent:foo&kind=scope`.

---

## 6. The instance profile format (PRD-07 §11.1)

An instance profile is a named bundle of (connection + UI + published runtime settings). The format is JSON, version-stamped:

```json
{
  "format": "cambrian.ui.instance_profile",
  "format_version": 1,
  "label": "Production",
  "created_at": "2026-06-22T18:00:00Z",
  "connection": {
    "label": "Production",
    "color_tag": "#5b8def",
    "host": "kernel.prod.example.com",
    "port": 8443,
    "uds_path": null,
    "auth_method": "bearer",
    "namespace": "prod"
  },
  "ui": {
    "density": "compact",
    "theme": "dark",
    "shortcut_map_overrides": {},
    "default_landing": "last_screen",
    "panel_sizes": { "left_rail_w": 240, "right_inspector_w": 360 }
  },
  "runtime": {
    /* the values the operator has set for the published config keys */
  },
  "telemetry_opt_in": false
}
```

The format is version-stamped so a future format bump is forward-compatible. Export / import is a file picker (the OS file dialog via Tauri 2's `tauri-plugin-dialog`).

---

## 7. The reason field's character minimum

The reason field's 16-character minimum is the V1 default. The reasoning:

- **Too short (e.g. 0 or 1 char)** lets the operator type a single character and bypass the audit narrative.
- **Too long (e.g. 80+ chars)** discourages operators from writing the reason.
- **16 chars** is a sentence: "Granted scope:internal to the analyst agent." (45 chars) is comfortable; "scoped analyst" (14 chars) is one short; the operator gets the immediate signal that the reason is meaningful but not onerous.

The minimum is a UI concern; the kernel stores what the kernel stores. The minimum is editable in the UI control-plane settings (PRD-07 §3.1) — advanced setting, default 16, range 8–80.

---

## 8. The first-run flow

The first time the operator opens the app and no instance is configured:

1. The shell hydrates (PRD-02 §5.1); the projection store has no `current_instance`.
2. The shell detects the no-instance state and routes to the **Instance Setup** sub-screen (Settings → Connection).
3. The operator fills the form: label, colour tag, host, port, UDS path (optional), auth method, namespace, credentials (the auth provider's login flow per UI-017).
4. The form calls the kernel via Tauri IPC (`op_login` from the in-repo Rust core); the kernel's `Login` RPC returns the role.
5. On success, the operator lands on the **Sessions** screen (the default landing per PRD-07 §3.1, or the operator's pinned landing).
6. The instance is saved in the instance list; the profile is the new default profile.

The first-run flow is skippable for developers: an "advanced" toggle shows the connection form on every launch until the operator turns it off (PRD-07 §3.2). The toggle is in the UI control-plane settings.

### 8.1 Error states

- The kernel is unreachable (Story 13, PRD-02 §6.2): the form shows the kernel's reason verbatim + a "retry now" affordance.
- The auth provider rejects (UI-017): the form shows the kernel's reason + a "forgot password" / "use a different method" affordance (depending on the auth method).
- The instance's `connection_skew` is too high (per the kernel's contract handshake): the form shows the skew + a warning that "this kernel is on a different contract; some features may be unavailable."

---

## 9. The auth provider (UI-017)

The Settings surface consumes the auth provider. The in-repo state has bearer token + OS keychain (`keyring` crate per the explore). UI-017 records the formal role model:

- **Operator** — full surface, every mutating action.
- **Viewer** — read-only; mutating actions are not rendered, not just disabled (product PRD ID-7).
- **Future roles** — the architecture is extensible; a follow-on can add `Auditor`, `Admin`, etc. without a schema break.

The auth provider's role is the kernel's authoritative role (product PRD ID-7). The UI reflects it via the role pill in the nav-rail footer (PRD-02 §4.2). The role pill is the operator's at-a-glance read.

### 9.1 Login flow

The `op_login` Tauri command takes (endpoint, username, password) and returns `{ role, session_token, ... }`. The session token is stored in the OS keychain (`keyring` crate); the webview never sees the token. The auth provider's session is tied to the kernel's session; the kernel's role enforcement is authoritative.

### 9.2 Logout

The `op_logout` Tauri command (a follow-on to the in-repo 9 commands) clears the session token + the OS keychain entry. The webview re-routes to the Instance Setup screen (PRD-07 §3.2) on success.

### 9.3 Multi-instance

The operator can be logged in to multiple instances simultaneously (one Tauri shell, one auth per instance). The instance switcher (PRD-02 §4.2) swaps the active instance + the active session token. The projection store is per-instance; switching wipes the store and re-hydrates from the new instance (UI-005's re-hydrate path).

---

## 10. Keyboard

The Settings surface consumes the keyboard map from PRD-01 §9:

- `g x` — go to Settings.
- `g u` — go to Audit.
- `j` / `k` — next / previous row in the audit list or the instance list.
- `Enter` — open the focused row.
- `Esc` — close the form / clear the filter.
- `/` — focus the filter bar.
- `n` — new (instance, profile, etc.).
- `Cmd/Ctrl-S` — submit the form (the same as the "Confirm" button).

The reason field's min-length validation is keyboard-friendly: the confirm bar enables when the field meets the minimum.

---

## 11. Realtime

The audit list is **realtime** (product PRD ID-5 + ID-6). The fold (UI-005) updates the projection store. The Zustand selectors (UI-004) re-render only the changed rows. The realtime grammar (PRD-01 §7) is applied to:

- A new audit entry arriving (pulse on the new row).
- A row's status changing (trail mark + the status pill updates).
- A row's target / actor / reason changing (the row's meta cell pulses).

The Settings sub-screens (Connection, Runtime, UI control plane, Profiles) are **not** realtime; the operator's local changes are local. The kernel-side state (e.g. "is the audit log enabled?") is reflected via the next fold (UI-005) — the operator sees the kernel's truth on the next event, not in real time.

---

## 12. Empty / loading / error / success states (PRD-01 §10)

- **Settings sub-screens** — empty (e.g. no instances configured + first-run flow), loading (skeleton for the form), error (kernel's reason verbatim), success (the form is the success), audit (every mutation is audited).
- **Audit list** — empty ("no audit entries" + a deep link to the Lifecycle console to trigger a consolidation, which produces a consolidation audit entry), loading (skeleton), error (kernel's reason), success (the list is the success), audit (n/a).
- **First-run flow** — empty (the Instance Setup form is the empty state), loading (the login is the loading state), error (the kernel's reason), success (lands on Sessions).
- **Mutating form** — the form's states are part of the PRD-01 §10 vocabulary; the success state of a destructive mutation is the audit entry.

---

## 13. Open questions (gaps for ADRs)

| # | Question | ADR | Status |
|:--|:---------|:----|:-------|
| 1 | What is the contract for the kernel's published runtime config schema? (JSON Schema / Protobuf reflection / custom) | [UI-015](../adr/UI-015-config-schema.md) | **Draft** |
| 2 | What is the audit export format? (CSV / JSON / both) | [UI-016](../adr/UI-016-audit-export-format.md) | **Draft** |
| 3 | What is the auth provider's role model? (Operator/Viewer only / extensible to more roles) | [UI-017](../adr/UI-017-auth-provider.md) | **Draft** |

**Not in this PRD's open-questions block:**
- The plan graph layout (PRD-04 → UI-011).
- The memory graph visualisation (PRD-05 → UI-012).
- The blast-radius computation (PRD-05 → UI-013).
- The cost-panel vs metrics-explorer decision (PRD-06 → UI-014).

---

## 14. Cross-references

- **Parent PRD** — `web-ui-ux-prd.md` §11 (Configuration surface), §7.13 (Audit), §2.1 (LD-1), §2.8 (LD-8), §2.11 (LD-11).
- **Sibling PRDs** — PRD-02 (nav-rail footer instance switcher), PRD-05 (blast-radius panel reuse), PRD-06 (per-resource mutating actions drill-in to Settings), PRD-03 (slash-prefixes from chat navigate to Settings; PRD-03 §9.1).
- **Foundation PRD** — PRD-01 §4.4, §6, §7, §8, §9, §10, §11.
- **In-repo `ui/CONTEXT.md`** — EC-1…EC-5.
- **In-repo `ui/src-tauri/CONTEXT.md`** — full transport contract; the Settings surface calls Tauri commands for every mutation, the audit list reads from the kernel's `QueryAudit` RPC + the `OperatorEvent.AuditEvent` stream.
- **Kernel ADRs** — see §2 for the list.
- **Companion ADRs** — UI-015, UI-016, UI-017 (all in this PRD's §13).

---

## 15. Glossary

Definitions of new vocabulary this PRD introduces. For shared terms see `CONTEXT.md` §7. For design-system terms see PRD-01 §14. For shell terms see PRD-02 §11. For chat terms see PRD-03 §16. For plan terms see PRD-04 §16. For memory terms see PRD-05 §16. For operator-console terms see PRD-06 §21.

- **Settings surface** — The Settings entry's full screen. Organised into sub-screens (Connection, Runtime, UI control plane, Profiles, Telemetry & audit, Health).
- **Sub-screen** — One tab within the Settings surface. Reachable from the Settings entry's tab list and from drill-downs.
- **First-run flow** — The Instance Setup flow when no instance is configured. Lands on Sessions on success.
- **Mutating action** — Any action that changes kernel state. Operator-only. Audited. Gated by the five-part form (form + diff + reason + blast-radius panel + confirm-with-consequence bar).
- **Five-part form** — The contract for every mutating action. The form / the diff / the reason field / the blast-radius panel (where applicable) / the confirm-with-consequence bar. PRD-07 §4.1.
- **Reason field** — A free-text input with a min-length constraint (default 16 chars). Mandatory for every mutating action. Recorded as the audit entry's `reason`.
- **Blast-radius panel** — A virtualised list of which agents / plans are affected by a proposed mutation. Re-uses the PRD-05 §7 component.
- **Confirm-with-consequence bar** — A `Dialog` (PRD-01 §6) variant. A sentence that names the consequence. Disabled until the reason is valid and the blast-radius panel has rendered.
- **Instance profile** — A named bundle of (connection + UI + published runtime settings). JSON, version-stamped. Save / load / export / import.
- **Audit entry** — A first-class UI object: actor, target, before / after, timestamp, reason. Streamed in real time to the audit list and to the relevant console screen's "recent activity" list. PRD-01 §10.5.
- **Audit deep-link** — Every audit entry's stable URL. `/audit/$entryId?target=agent:foo&kind=scope`. The target is rendered into the centre column + the right inspector.
- **Auth provider** — The bearer token + OS keychain flow that backs the Operator / Viewer role model. The kernel is the source of truth; the UI reflects. UI-017.
- **Role pill** — The label in the nav-rail footer that says "Operator" or "Viewer." Reflects the kernel-authoritative role from the latest folded snapshot.
- **First-run flow's "advanced" toggle** — A per-operator UI control-plane setting that shows the connection form on every launch until turned off. For developers iterating on the kernel.
