# UI-017 — Auth Provider

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-07 ([../prd/07-configuration-and-audit.md](../prd/07-configuration-and-audit.md)) §9 requires the Settings surface to consume the auth provider. The in-repo state has bearer token + OS keychain (`keyring` crate per the explore) and the `op_login` Tauri command (the explore confirmed it's already implemented in the Rust core). The decision this ADR records is: **what is the formal role model that the auth provider exposes, and how does the UI consume it?**

### Constraints

1. **The kernel is the source of truth for the role.** Product PRD ID-7: "The role model is enforced server-side; the UI reflects it but is not the source of truth." The kernel's `OperatorConsole.Login` RPC returns the role; the UI renders.
2. **The role is one of a small, fixed set in V1.** Product PRD ID-7: "Two roles, one application. Operator (full surface, including every mutating action) and Viewer (read-only; the same realtime data; mutating actions are not visible, not just disabled). The same app, the same realtime data, the same components, gated by role. Additional roles may be added later, but V1 ships with these two."
3. **The session token never reaches the webview.** The `keyring` crate stores the token in the OS keychain; the Rust core is the only component that holds the token at runtime. The webview's role determination is per-event (the kernel's `OperatorEvent` includes the role in the snapshot).
4. **Multi-instance support.** The operator can be logged in to multiple instances simultaneously (one Tauri shell, one auth per instance).
5. **The role pill is the at-a-glance read.** PRD-02 §4.2 — the role pill in the nav-rail footer.

### Options

| Option | V1 roles | Future extensibility | Implementation | Notes |
|:-------|:---------|:---------------------|:----------------|:------|
| **Operator + Viewer only** (the spec) | 2 | ✅ the architecture supports adding more; the kernel's role check is a set membership test | ✅ | **Recommended.** Matches the product PRD. |
| **Operator + Viewer + Auditor** | 3 | ✅ | ⚠️ adds an Auditor role with read-only access to the audit log + a "this is for review" badge in the nav-rail footer | The Auditor is the "same human in a different role" per the requirements doc; V1 can ship without it. |
| **Operator + Viewer + Admin** | 3 | ✅ | ⚠️ adds an Admin role with full surface + the ability to manage other operators' roles | Admin is a follow-on; the kernel's role enforcement is the source of truth. |
| **Operator + Viewer + Auditor + Admin** | 4 | ✅ | ❌ overkill for V1 | Rejected. The product PRD is explicit: "V1 ships with these two." |

## Decision

**Recommended:** **Operator + Viewer only in V1.** The architecture is extensible; a follow-on ADR adds `Auditor` and `Admin` when the product calls for them.

Rationale:

1. **The product PRD is the constraint.** ID-7: "V1 ships with these two." Adding more roles is a follow-on.
2. **The architecture is extensible.** The kernel's role check is a set membership test; adding a new role is a kernel-side change (add the role to the `Role` enum, update the role checks) + a UI-side change (add the role to the role pill, update the role-gating per surface). The contract (the `Login` RPC returns `role`) is unchanged.
3. **The role pill is the source of UI truth for the role.** PRD-02 §4.2 — the role pill in the nav-rail footer carries the role. The pill is the operator's at-a-glance read.
4. **The Viewer experience is strict.** Per product PRD ID-7: "Mutating actions are not visible, not just disabled." The UI hides the mutating actions for Viewer (with the shell-chrome exception documented in PRD-02 §7.2). The role pill says "Viewer."

### The two roles in detail

#### Operator

- **Full surface**, including every mutating action.
- Every PRD-07 mutating form is rendered (with the confirm-with-consequence bar + the reason field).
- The PRD-02 §4.2 footer items are interactive (instance switcher, account / log out, theme toggle, density toggle).
- The PRD-06 mutating actions (scope, write tags, tool grants, new skill, new MCP, new watch config, manual consolidation) are rendered.
- The PRD-05 mutating actions (tag, promote, supersede, delete) are rendered.
- The PRD-04 mutating actions on the plan (pause, resume, inject, abort, retry) are rendered.

#### Viewer

- **Read-only.** The same realtime data; mutating actions are **not visible** (not just disabled, per product PRD ID-7).
- Every PRD-07 mutating form shows the read-only state with a "this action requires Operator" disabled state. The reason field is not rendered. The confirm-with-consequence bar is not rendered. The form is in "view" mode, not "edit" mode.
- The PRD-02 §4.2 footer items: instance switcher is read-only (the "add an instance" action is not rendered); account / log out shows a "user info" surface (the operator can see their own role, but cannot log out — that's a follow-on). Theme and density toggles are interactive (they are UI control-plane, not security-sensitive).
- The PRD-06 mutating actions are hidden (not just disabled). The list rows show the read-only detail; the mutating buttons are not rendered.
- The PRD-05 mutating actions are hidden.
- The PRD-04 mutating actions on the plan are hidden.
- The role pill says "Viewer." The shell chrome's account item shows "Viewer — this role does not allow mutating actions."

### Extensibility (for the follow-on)

When the follow-on ADR adds `Auditor` (a role with read-only access to the audit log + a "this is for review" badge):

- The kernel's `Role` enum gains `RoleAuditor`.
- The UI's role pill gains the "Auditor" label.
- The audit list is rendered for Auditor (with the same read-only treatment as Viewer's other read-only surfaces).
- The other surfaces are hidden for Auditor (the role is "audit-only"; the auditor does not see the operator console or the chat).

When the follow-on ADR adds `Admin` (a role with full surface + the ability to manage other operators' roles):

- The kernel's `Role` enum gains `RoleAdmin`.
- The UI's role pill gains the "Admin" label.
- A new sub-screen under Settings → "Operators" is rendered for Admin (the form is "add an operator," "remove an operator," "change an operator's role"). The mutating actions are kernel-side enforced; the UI is the form.

The follow-on is additive. The V1 contract (the `Login` RPC returns `role`) is unchanged.

## Consequences

**Positive.**

- The role model is **simple and explicit** in V1. Operator and Viewer; the role pill says which one the operator is.
- The architecture is **extensible**. The follow-on ADRs add Auditor and Admin without breaking the V1 contract.
- The kernel's role enforcement is **authoritative**. The UI reflects; the kernel decides. Server-side enforcement is the source of truth.
- The role pill is the at-a-glance read. The operator knows their role without opening Settings.

**Negative / risks.**

- **The Viewer experience requires per-surface care.** Every PRD that has a mutating action must honour the "not just disabled, hidden" rule. The PRD-02 §7.2 shell-chrome exception (the account / instance switcher shows a "this action requires Operator" disabled state with the underlying form not rendered) is a tighter rule than the rest of the app.
- **Multi-instance role consistency.** The role is per-instance (each instance has its own auth). The role pill carries the role of the *current* instance. Switching instances re-renders the role pill.
- **The "log out" affordance for Viewer is a follow-on.** V1 ships the "user info" surface for Viewer; the ability to log out as Viewer is a follow-on (the Viewer can switch instances via the instance switcher, but cannot log out entirely — the kernel's session persists).

**Out of scope here** (handled in PRD-07): the first-run flow (§8), the instance profile format (§6), the audit log (§5).

**Reversibility.** High. The role model is a small change; the V1 contract (the `Login` RPC returns `role`) is unchanged. The follow-on is additive.
