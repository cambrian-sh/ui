# 09 — Configuration and Profiles

**Bound by decision log 11 (in-app configuration) and the sub-decision on Settings V1 scope.**

The UI is the **sole** end-to-end interface for an operator. Setup, deploy,
run, interact, monitor — all of it lives in the UI. **Nothing is "edit the
file on disk."** The runtime publishes a schema of what is editable; the
UI is a form over that schema.

## What the UI exposes

Four config surfaces, all reachable from the nav rail (`Settings`) and
from any drill-down ("configure this instance" in the instance switcher,
"configure this agent" from the agent detail, etc.):

### 1. Connection settings

- Host, port, UDS path.
- Auth method.
- Namespace, label, colour tag.
- **Multiple instances can be configured.** The operator switches between them with the global instance switcher (`Cmd/Ctrl-.`) or the nav-rail footer.

### 2. Runtime settings (V1 scope — sub-decision)

The subset of `config.json` keys the kernel publishes as
operator-editable. The **kernel is the source of truth for what is
editable; the UI is a form over the published schema, never a free-form
editor.**

For each field, the UI shows:

- Description
- Default value
- Current value
- "Reset to default" affordance
- "What this does" tooltip

**Destructive changes** (e.g. "disable the audit log," "lower the
TrustScore EWMA floor") require:

- A **confirm-with-consequence bar** ("Changing this will affect X / Y / Z").
- A **mandatory reason field**.

**The free-form JSON editor is OUT of V1.** This is the lock-in decision
the agent was making in this session. The runtime schema is the only
editable surface; if the operator needs a free-form editor, the
technical document can propose it as a follow-on, but the V1 product
decision is "no."

### 3. UI control-plane settings

- **Density** (compact / default / spacious). Persists per operator and per device.
- **Theme** (dark; light ships in V1 — sub-decision from this session).
- **Shortcut map** (the V1 map + the operator's overrides).
- **Default landing** (last screen vs pinned screen).
- **Panel sizes** (left rail width, right inspector width).
- **Telemetry opt-in.** Deep-link to Langfuse / OTel. The UI does not collect telemetry unless the operator opts in.

### 4. Instance profiles

A named bundle of (connection + UI control-plane + published runtime
settings). Save, load, export, import.

- The operator can have one profile per environment (dev / staging / prod / their laptop).
- Profiles are exportable as JSON, importable as JSON. The JSON shape is documented and stable.
- The profile editor (`InstanceProfileEditor`) is itself a form; no free-form JSON editing of profiles in V1 either (same rule as runtime settings).

## The audit surface (every config change)

**Every config change is audited** with:

- Actor (which operator)
- Target (the field, the instance, the profile)
- Before / after (the diff)
- Timestamp
- **A mandatory reason** (for destructive changes; the UI requires it before the change can be submitted)

The same audit surface as every other mutating action in the app
(Console — Audit, also pinned to the resource context when the
mutation is open). See the Audit entry in the nav rail.

## Role gating on settings

| Role | Settings surface |
|:-----|:------------------|
| **Operator** | Full surface, all four areas. |
| **Viewer** | Read-only. The Viewer can see connection settings and runtime settings but cannot edit. The UI control plane is also read-only for Viewer (the operator's own preferences don't apply to the Viewer). |

Server-side enforcement is authoritative; the UI reflects it.

## What is NOT in the UI (V1)

- **Free-form JSON editor for runtime config.** The UI is a form over the published schema. A follow-on technical document can propose this; V1 product decision is "no."
- **A live `config.json` reload button.** The runtime applies changes through its own channels; the UI does not poke the file system.
- **A "reveal in file system" / "open the .json" affordance.** The runtime is the source of truth, not the file on disk.
- **Direct edit of the kernel's published schema.** The schema is what the kernel publishes; the UI does not let the operator redefine what is editable. (If a new key needs to be editable, that's a kernel change, not a UI change.)

## What the implementation phase needs from the technical document

- A stable schema for runtime settings. The schema is the contract; the UI renders from it.
- A diff / apply API that the UI can call to submit a config change with a reason. The kernel enforces the reason for destructive changes.
- A list of which keys are "destructive" (require a confirm-with-consequence bar). The UI cannot infer this; the kernel must declare it.
- An audit endpoint that records the actor / target / before / after / reason / timestamp for every config change.
- An instance-profile export/import format. Stable, versioned, documented.

The 8 final todos (see `10-final-todos.md`) include drafting a "ready to
develop" checklist that the technical document must satisfy before code
starts — this list is a starting point.
