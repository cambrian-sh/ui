# Cambrian Web UI — UX PRD

**Source requirements:** `docs/requirements/web-ui-requirements.md` (v0.1)
**Source PRD:** `docs/prd/web-ui-prd.md` (v0.1)
**Status:** Draft v0.1 — for review.
**Scope of this document:** This PRD concretises the product PRD into screens, flows, and components. It introduces **no new product requirements** and **no technical decisions** (no transport, framework, deployment, or auth provider choice). Those live in a follow-on technical document that consumes this PRD as input.
**Traceability rule:** every screen and every component in this document must trace to one or more user stories in the product PRD (web-ui-prd.md §"User Stories"). Stories with no screen are a gap; screens with no story are scope creep.

---

## 1. How this document relates to the others

```
requirements  →  product PRD  →  UX PRD (this)  →  technical document
  (what)         (what+why)      (how it shows)    (how it is built)
```

The flow is one-way. A requirement that surfaces during UX work is a flag to come back to the product PRD, not to add it here. A technical constraint (e.g. "transport cannot deliver below 500 ms") is recorded in the technical document; if it forces a product compromise (e.g. drop the no-manual-refresh promise), the product PRD is updated, and the UX PRD follows.

This document does not pick transport, framework, deployment, or auth provider. It commits to **visual** and **behavioural** contracts that the technical document must satisfy.

---

## 2. Locked decisions

These are the decisions that compound across every screen. They were settled in the planning conversation and are normative for this document.

### 2.1 Shell shape (decision log 1)

- **Three columns.** Left rail (navigation), centre (chat surface + embedded interactive artifacts), right (contextual inspector).
- The **centre column is the widest** — it is where the operator's real action happens. The right column is the "what is happening in your context right now" view. The left column is the navigational frame.
- The shell is **role-aware** (Operator vs Viewer; see ID-7 of the product PRD) and **density-aware** (compact / default / spacious; see §2.3).

### 2.2 Realtime visual grammar (decision log 2)

- **Pulse-and-trail** for the moment of change. **Live status pills** for the durable state.
- **Aesthetic guardrail (anti-slop).** The realtime grammar must not look like default AI-generated UI. Concretely: no gratuitous particle effects, no neon glow, no default-shadcn styling, no motion-for-motion's-sake. The pulse is a **soft, brief, low-saturation** highlight (subtle background tint, 1 px border, no glow). The trail is a **2 px vertical mark** in the right margin of a list, in a brand-tinted neutral. The pills use the same colour tokens as the rest of the system. Motion budget per event: ≤250 ms in, ≤600 ms out.

### 2.3 Density and theme (decision log 3)

- **Density.** Default density for the operator console: compact. Default density for the chat surface: default. **Operator-tunable.** Global toggle (compact / default / spacious). Default is compact for the console, default for the chat. The toggle persists per operator and per device. Density is a **token-level** switch (a CSS variable), not a per-component fork. Components consume density tokens; they do not branch on a prop.
- **Theme.** Global toggle (dark / light). **Both ship in V1.** Dark is the default. The theme is a **token-level** switch; only the token values differ between modes. Components consume theme tokens, they do not branch. (See §3.3 for the colour tokens per mode.)
- The shell is **theme-aware** and **density-aware** (see §4.7).

### 2.4 Plan view (decision log 4)

- **Plan view has two modes, togglable per operator and per session:**
  - **DAG-as-graph** (default). Nodes for steps, edges for dependencies, status by colour, the active step pulses, bids and output stream in attached cards. The graph layout is deterministic and stable across re-renders (steps do not "jump" on update).
  - **Step-list.** A vertical list of steps with status, the selected step expanded to show bids, agent output, and confidence. The list is virtualised.
- **In-flight plans per session.** A single session can have **multiple plans running in parallel** (a foreground plan, background daemon plans, watch-driven reactive plans). The chat view shows **only the foreground plan by default**. The "Plans in Flight" global screen shows everything across all sessions.
- **Bids.** Transient overlay on the active step during the auction moment + persistent card inside the step's details (the operator can scroll back and see who bid on what).

### 2.5 Memory explorer (decision log 5)

- Filter bar at the top (compact; "more filters" popover for the long tail). The right column is for selection details.
- Graph view: inline next to the open document, smaller pane, collapsible.

### 2.6 Chat surface composition (decision log 6)

- **Three-column shell.** Left = navigation. **Centre = chat surface** (conversation, embedded interactive artifacts, custom blocks for plan formation, bids, agent output, HITL interventions). Right = **contextual inspector** (the plan stack, the active step, the active agent, the mutation target).
- The **inject input is its own bar above the right inspector column** (not inside the chat input). It is labelled "Inject into running plan" and has a **plan selector** because multiple plans can be running in one session.
- HITL interventions are **plan-tagged**. Foreground-plan interventions are inline in the chat (and also pinned to the inspector). Background-plan interventions are pinned to the inspector and shown in the chat as a subtle badge with a click-through.

### 2.7 Design system (decision log 7)

- **Location.** Inside the UI codebase, `./ui/design-system/`. Not in the runtime repo.
- **Foundation.** Tailwind CSS + shadcn/ui.
- **Tokens.** TypeScript code-as-stylesheet (vanilla-extract or a thin in-house equivalent). Tokens are consumed by Tailwind via CSS variables emitted at build time.
- **Components.** shadcn/ui customised to the design system tokens. The design system **is** the customised shadcn/ui.
- **Accessibility.** Built in. Keyboard, contrast, screen reader, focus order. Not a follow-on.

### 2.8 States (decision log 8)

- **Empty.** Small dark illustration using brand motifs, one sentence, one primary action.
- **Loading.** Skeleton (Linear-style), never a spinner. Max skeleton time: 5 s, then the empty state takes over.
- **Error.** Kernel's reason verbatim, one-line "what to do," deep link to the relevant console screen.
- **Success.** A destructive mutation's success state is the **audit-log entry appearing in real time** (the operator sees the change land before they have a chance to navigate away).

### 2.9 Keyboard (decision log 9)

- 17 V1 shortcuts (see §10). Subject to refinement after first real use.
- A **command palette** (`Cmd/Ctrl-K`) is the discoverability layer for everything not on the keyboard map.

### 2.10 Multiple active plans per session (decision log, your "no" 2)

- The chat view treats the **plan stack** as the truth.
- The **inject input has a plan selector**. Default target: the foreground plan.
- HITL interventions are **plan-tagged** and rendered according to which plan they belong to.
- The "Plans in Flight" global screen shows all plans across all sessions; the per-session plan stack and the global view share the same data and the same visual vocabulary.

### 2.11 In-app configuration (decision log, your "no" 1)

- The UI is the **sole** end-to-end interface for an operator. Setup, deploy, run, interact, monitor — all of it lives in the UI. Nothing is "edit the file on disk."
- The UI exposes:
  - **Connection settings** — host, port, UDS path, auth method, namespace, label, colour tag. Multiple instances can be configured; the operator switches between them.
  - **Runtime settings** — the subset of `config.json` keys the kernel publishes as operator-editable. The kernel is the source of truth for what is editable; the UI is a form over the published schema, never a free-form editor.
  - **UI control-plane settings** — density, theme, shortcut map, default landing, panel sizes, telemetry opt-in.
  - **Instance profiles** — a named bundle of (connection + UI + published runtime settings). Save, load, export, import.
- Every config change is **audited** with actor, target, before, after, timestamp, and a mandatory reason. The same audit surface as every other mutating action.

---

## 3. Visual language and design system

### 3.1 Brand source

- Canonical brand assets live in `design/` (runtime repo). The design system derives its tokens and motifs from there.
- `www/public/` is treated as a superset for compatibility. The design system is the source of truth; `www/public/` is a reference.

### 3.2 Token taxonomy

The design system is built on **four token layers**. Each layer is consumed by the layer above it; no layer skips a level.

1. **Primitive tokens** — raw values. Colour ramp (12-step neutral, 9-step brand, 8-step semantic, 6-step status: ok / warn / err / info / pulse / muted), type scale (6 sizes), spacing (8-step scale), radius (4 steps), elevation (3 steps), motion (4 easings + 4 durations).
2. **Semantic tokens** — what a value means. `bg/canvas`, `bg/surface`, `bg/elevated`, `fg/primary`, `fg/secondary`, `fg/muted`, `border/subtle`, `border/strong`, `status/ok`, `status/warn`, `status/err`, `status/info`, `status/pulse`, `accent/brand`, etc.
3. **Component tokens** — what a value means inside a specific component. `button/primary/bg`, `button/primary/fg`, `list/row/h`, `list/row/padding-x`, `card/padding`, `inspector/w`, etc.
4. **Density tokens** — what a value means under a density mode. `density/row/h`, `density/padding/x`, `density/text/size`. The density toggle flips the density tokens; components consume density tokens, not raw values.

### 3.3 Colour

- **Dark and light mode both ship in V1.** Dark is the default; light is a toggle. The foundation is shadcn/ui + Tailwind, so both modes share the same components and the same token names; only the token values differ per theme.
- **Background layers** are 1–3 % lightness apart, not 10 %. The UI is dense; contrast comes from borders, type weight, and a single accent, not from background jumps.
- **One accent.** The brand accent is the only saturated colour. Everything else is neutral or status-tinted. The accent is reserved for: focus rings, the active state, the foreground plan in the plan stack, the foreground plan in the inject input selector, and the operator's cursor in a list.
- **Status colours** are reserved for status pills, destructive confirmations, and the realtime pulse. They do not appear in branding.
- **Contrast in both modes** must meet WCAG AA at minimum; AAA is preferred. Status colours (ok / warn / err / info) are tuned per mode to meet AA against that mode's canvas.
- **No neon, no glow, no gradient mesh.** The aesthetic is "professional instrument," not "marketing site."

### 3.4 Type

- **Two families.** A proportional UI family (operator's reading) and a monospace family (numbers, code, IDs, paths, scores, timestamps). System stacks; no remote font fetch on first paint.
- **Scale.** 12 / 13 / 14 / 16 / 20 / 28. Body is 13 in compact density, 14 in default.
- **Weight.** 400 regular, 500 medium, 600 semibold. No bold (700) except in rare emphasis.
- **Tracking.** Default; tightened (-0.01em) on display sizes 20 and 28.

### 3.5 Spacing, radius, elevation

- **Spacing.** 4-step base. Padding inside a card: 12 (compact) / 16 (default) / 20 (spacious). Row height: 28 (compact) / 36 (default) / 44 (spacious).
- **Radius.** 4 (inputs, list rows), 6 (cards, popovers), 8 (modals), 12 (large surfaces). No pill shapes except for status pills.
- **Elevation.** Three levels, expressed as a 1 px border + a subtle, low-opacity background tint. **No drop shadows** in dark mode. Drop shadows are reserved for floating elements (popovers, menus, dialogs) and use a 24 px blur, 8 % opacity, brand-tinted.

### 3.6 Motion

- **Motion budget per event.** ≤250 ms in, ≤600 ms out. Easing: `cubic-bezier(0.2, 0, 0, 1)` (deceleration) for in, `cubic-bezier(0.4, 0, 1, 1)` (acceleration) for out.
- **Pulse.** A 250 ms background tint from `bg/surface` to `bg/pulse` and back, with a 1 px border in `border/pulse`. No scale, no glow, no rotation.
- **Trail.** A 2 px vertical bar in the right margin of a list, in `fg/pulse`, fades in 250 ms, holds until the next event on the same row, then fades out 600 ms.
- **No motion** for state changes that are not realtime. Status pill colour changes are instantaneous.

### 3.7 Iconography

- **One icon family.** A single line-icon set, 16 px base, 1.5 px stroke, rounded caps and joins. Used everywhere — navigation, status pills, list rows, inspector headers. No filled icons, no two-tone icons, no emoji.
- Icons are tokens; they can be recoloured by token swap.

### 3.8 Component inventory (the customised shadcn/ui)

The shadcn/ui components are generated, then customised to consume the design system tokens. The inventory (V1):

- **Layout.** Shell (three-column with collapsible left and right), Resizable panels, Stack, Cluster, Tabs.
- **Navigation.** NavRail (left), NavItem, NavSection, NavBadge, Breadcrumb, CommandPalette, ShortcutHint.
- **Lists.** List (virtualised), ListRow, ListGroup, FilterBar, FilterChip, FilterPopover, EmptyState, Skeleton.
- **Surface.** Card, CardHeader, CardSection, InspectorPanel, PlanStack, PlanStackItem.
- **Chat.** ChatMessage, ChatMessageList, ChatInput, ChatComposer, EmbeddedArtifact, EmbeddedPlanCard, EmbeddedBidPanel, EmbeddedHITLInline, ChatDraftRecovery.
- **Plan.** PlanGraph, PlanGraphNode, PlanGraphEdge, PlanStepList, PlanStepRow, StepDetail, BidCard, BidOverlay, AgentOutputStream, AgentOutputLine, ConfidenceBar, TrustScorePill.
- **Memory.** MemoryList, MemoryListRow, MemoryDetail, MemoryFACT, MemorySCENE, MemoryGraph, MemoryCompareSideBySide, MemoryTagEditor, MemoryBlastRadius.
- **Agent / Tool / Skill / MCP.** ResourceCard, ResourceHeader, ResourceManifest, ResourceSchemaView, ResourceInvocationList, MCPConnectionCard, MCPHealthBadge.
- **Scope.** ScopeEditor, EffectiveScopeView, DefaultWriteTagsEditor, CallerScopeView, ScopeHistoryList, PromotionLog.
- **Lifecycle / Watch / Verifier.** LifecycleDashboard, WatchConfigList, WatchConfigEditor, VerifierPoolCard, VerifierRoundList.
- **Cost.** CostPanel, CircuitBreakerPill, PriceLedger, AcquireOutcomeList.
- **Audit.** AuditList, AuditEntry, AuditDiff, AuditReasonField, AuditExport.
- **Status / realtime.** StatusPanel, StatusPill, PulseHighlight, TrailMark, EventBacklogIndicator, ConnectionBadge.
- **HITL.** HITLInline, HITLEditor, HITLDecisionBar.
- **Form primitives.** Input, TextArea, Select, Combobox, Checkbox, Radio, Switch, Slider, NumberInput, DateRange, FileDrop, TagInput, VocabularyPicker.
- **Feedback.** Toast (mutating-action confirmation only; never for reads), Dialog (confirm-with-consequence), Drawer, Popover, Tooltip, HoverCard.
- **Configuration.** InstanceSwitcher, InstanceList, InstanceProfileEditor (P5+), RuntimeSettingsForm, UIControlPlaneSettings, ThemeToggle, DensityToggle, DiffView, AuditEntry, ConfigFileRevealButton (the power-user "open the .json" affordance).

### 3.9 What the design system forbids

- Bespoke styles per screen. New screens use existing components or propose a new component to the inventory.
- Colours, radii, spacings, or motion values that are not tokens. Hard rule: no `#hex` literals in component code.
- Two visual languages in the same app. The chat surface and the operator console are the same design system.
- AI-generated slop. The aesthetic guardrail in §2.2 is enforced by the design system: the pulse is subtle, the pills use status tokens, the icons are line and consistent, the typography is two families, the motion is bounded.

---

## 4. The shell

### 4.1 Layout grid

```
┌──────────┬─────────────────────────────────────────────┬──────────────────┐
│          │                                              │                  │
│  NAV     │              CENTRE — chat surface           │   INSPECTOR      │
│  (left)  │   (widest column; conversation, embedded     │   (right)        │
│          │    interactive artifacts, custom blocks)     │                  │
│          │                                              │                  │
│          │                                              │                  │
│          │                                              │                  │
└──────────┴─────────────────────────────────────────────┴──────────────────┘
```

- **Left rail.** 240 px (default), 56 px (collapsed, icon-only). Toggle is a global hotkey and a per-operator preference.
- **Centre.** Fills the remaining width; minimum 480 px; can grow to ~60 % of the viewport.
- **Right inspector.** 360 px (default), 280 px (compact), 0 (collapsed, off). Toggle is a global hotkey and a per-operator preference. At viewport <1280 px the right inspector collapses by default.
- **Status strip.** A 32 px strip at the very bottom (kernel up, LTM up, current instance, in-flight plans, queue depth, circuit-breaker state, current spend rate, event backlog). Visible on every screen. Persists across navigation.

### 4.2 Navigation rail (left)

Vertical list of sections, grouped. Each section is a collapsible group. The current selection is highlighted with the accent border and a 2 px left bar.

- **Sessions.** All sessions (Active / Paused / Dormant / Completed), filterable. The active session is pinned at the top with a "running" pill.
- **Plans in Flight.** A flat list of every running plan across all sessions. (PRD story 14.) The "n" hotkey jumps to the nth plan.
- **Console — Agents.**
- **Console — Tools & Skills.**
- **Console — MCP.**
- **Console — Memory.**
- **Console — Scope.**
- **Console — Watch & Reactive.**
- **Console — Lifecycle.**
- **Console — Verifier Pool.**
- **Console — Cost & Energy.**
- **Audit.**
- **Settings.** (Connection + Runtime + UI control plane + instance profiles + telemetry opt-in. See §11.)

Each Console entry maps to one user story in the product PRD. Audit is its own entry because it is used across the app, not just for config changes. Settings is its own entry because it is the operator's primary workspace for setup and configuration.

The navigation rail also has a footer with: the **current instance** (click to switch), the **current operator** (click for account / log out), a **theme toggle** (dark / light; both ship in V1, dark is the default), and a **density toggle** (compact / default / spacious).

### 4.3 Centre column

The chat surface. See §5.

### 4.4 Right inspector

The contextual inspector. The inspector is **context-shaped**: it changes based on what the operator is currently focused on. The shapes are:

- **Chat context.** Plan stack (see §5.4), active step detail, active agent, current session state strip.
- **Plan context (when focused on a plan in the Plans in Flight view).** Plan graph (mini), step status, bids for the focused step, agent output stream, TrustScore.
- **Resource context (when focused on an agent / tool / skill / MCP / memory document).** Resource header (id, trait / type, status pill), key fields, recent activity, related plans, mutating actions.
- **Mutation context (when a mutating form is open).** The form, the diff (before / after), the reason field, the confirm-with-consequence bar.
- **Audit context (when focused on an audit entry).** The entry, the diff, a deep link to the target.

When no context is active, the inspector is empty (a single status pill and a one-line "no context").

### 4.5 Status strip (bottom)

Always visible. Surfaces kernel health, LTM health, current instance, in-flight plans, queue depth, circuit-breaker state, current spend rate, and event backlog. Click on any field to drill in. The status strip is the **first thing an operator reads when something is wrong**.

### 4.6 Role gating

- **Operator.** Full surface, including every mutating action.
- **Viewer.** Same surface; mutating actions are not rendered (not just disabled). The inject input, the mutation forms, the confirmation dialogs, the destructive actions — all absent. The audit log is present and read-only. The Settings surface is read-only.
- Server-side enforcement is authoritative. The UI reflects it. The role is shown in the navigation rail footer (operator vs viewer).

### 4.7 Density and theme

- **Density.** Global toggle (compact / default / spacious). Persists per operator and per device. Default is compact for the console, default for the chat. Density is a token-level switch. Components consume density tokens; they do not branch.
- **Theme.** Global toggle (dark / light). Both ship in V1. Dark is the default. The theme is a token-level switch; only the token values differ between modes. Components consume theme tokens, they do not branch.

### 4.8 Keyboard

See §10.

### 4.9 Settings (preview)

The Settings surface is its own area. See §11. It is reachable from the navigation rail and from any drill-down ("configure this instance" in the instance switcher, "configure this agent" from the agent detail, etc.).

---

## 5. The chat surface (centre column)

The chat surface is **not** a regular chat. It is a conversation in which the runtime produces **embedded interactive artifacts** alongside text: a plan forming, a bid panel, an agent output stream, a HITL intervention. The operator's text and the runtime's artifacts are interleaved in a single chronological flow, but the artifacts are first-class blocks, not text.

### 5.1 The flow

The chat surface is a vertical, virtualised, reverse-chronological list of blocks. The newest block is at the bottom (Linear / iMessage convention) or at the top (chat-app convention). The product decision is **Linear convention** (newest at the bottom) because:

- the operator's natural action is "type at the bottom" (chat muscle memory),
- the plan / step / output blocks grow downward as they stream,
- the status pill of the running plan is always at the bottom near the inject input.

The reverse — newest at top — would force the operator to look up to read a streaming agent output. We choose the convention where the eye and the action are at the same end.

### 5.2 Block taxonomy

Every block in the chat flow is one of:

- **OperatorMessage** — text the operator typed. Mono font for code, proportional for prose. Sent timestamp.
- **RuntimeText** — text the runtime produced (Planner prose, agent prose, system notes). Marked as runtime; never looks like an operator message.
- **PlanCard** — a plan forming or in flight. Contains: subject, steps (graph or list, per density), the active step, the active agent, status pills, elapsed time, cost so far. See §5.3.
- **BidPanel** — an auction moment. Transient by default (auto-collapses after the auction resolves), persistent in the step's card. Shows every qualified candidate with confidence / trust / latency, the winner highlighted.
- **AgentOutputStream** — the streamed output of the active step. Token-by-token for LLM output, line-by-line for tool output, structured for tool calls. See §5.4.
- **HITLInline** — a destructive-command / approval intervention rendered inline in the chat, with approve / reject / edit. See §5.6.
- **ArtifactCard** — a non-ephemeral product (a file the agent wrote, an image, a code patch). Lives in the CAS vault; the card is a link + preview.
- **MemoryReference** — an inline reference to a memory document (the agent said "I remember X" — the reference is clickable to the memory explorer, scoped to that document).
- **ToolCall** — a tool invocation with its arguments and result. The arguments are summarised (Tier-1); the result is collapsible. Tier-2 disclosure is on demand.
- **SystemNote** — informational (kernel connected, instance switched, session paused, lifecycle event). Low visual weight.
- **ErrorBlock** — a runtime error rendered with the kernel's reason verbatim (PRD ID-6). One-line "what to do." Deep link to the relevant console screen.

### 5.3 The PlanCard (in the chat)

The PlanCard is the single most important block in the chat flow. It is a **persistent, growing** block that lives in the chat from the moment the Planner emits the plan to the moment the plan completes (or is aborted). The PlanCard is:

- A compact header (subject, step count, status pill, elapsed time, cost so far, plan id).
- A body that toggles between **DAG-as-graph** and **step-list** (per the operator's per-session preference; default = graph). It is a **read-only** view; the chat card exists to give the operator the plan in context of the conversation.
- A footer that is the **inject input** (see §5.5). The PlanCard and the inject input are visually attached; the PlanCard grows, the inject input stays at the bottom of the PlanCard body.

The PlanCard is **plan-tagged**. When multiple plans are running, each plan gets its own PlanCard in the chat (and its own entry in the plan stack in the inspector).

**The chat card is a *view*; the right-inspector plan tab is the *work surface*.** Clicking a PlanCard in the chat focuses the plan's tab in the right inspector (§6) — the work surface where the operator acts on the plan in detail. The chat card does not duplicate the work surface; it just provides the entry.

### 5.4 The plan stack (in the inspector)

The right inspector's default shape during chat is the **plan stack**: a vertical list of currently executing plans in this session, with the foreground plan expanded and background plans collapsed to a one-line status row each. The foreground plan is highlighted with the accent border. The operator can promote a background plan to foreground with a click (this changes what the chat view's main PlanCard renders, if there is room; in V1 the chat flow shows all PlanCards; promotion changes which is the "active" one for inject targeting and the inspector's detail view).

**The plan stack is the entry to the work surface.** Each entry is a tab in the inspector. The selected plan's tab renders the full plan work surface: the plan graph or step-list (per the operator's preference), the active step detail, the bids, the agent output stream, the TrustScore, and the mutating actions on the plan. The chat card (§5.3) and the plan tab are linked: clicking the chat card focuses the tab; acting in the tab updates the chat card.

### 5.5 The inject input

A separate input bar, labelled "Inject into running plan," with:

- A **plan selector** (default = foreground plan). The selector shows: plan subject, plan id (short), step count, status pill, elapsed time, cost so far. If only one plan is running, the selector is a single badge.
- A text input.
- A "send" affordance and `Cmd/Ctrl-Enter` to submit.
- A small "what this does" tooltip: "Sends a correction into the running plan. The plan may re-plan."

The inject input is **above the right inspector column**, not inside the chat input. The chat input and the inject input are physically separated to make the semantics clear: chat continues the conversation, inject interrupts the plan.

### 5.6 HITL interventions

HITL interventions are rendered **inline in the chat** when they belong to the foreground plan, and **pinned to the inspector** (with a subtle badge in the chat) when they belong to a background plan. The intervention block contains:

- The intervention's nature (destructive command, approval request, dangerous tool). Detected by the kernel's `PauseController`; the UI does not re-detect.
- The surrounding context (the step, the agent, the plan, the proposed action).
- A diff between the proposed action and the action the agent intends (if any).
- Three actions: **approve**, **reject**, **edit**. Approve and reject are single clicks; edit opens a form. Every action requires a **mandatory reason field** (free text, min length TBD in the technical document; default 16 chars).
- A confirm-with-consequence bar: "Approving will execute the action above. The plan will resume."

The intervention block is **pinned to the top of the chat** (or to the top of the inspector) until the operator decides. It is the only block that breaks the chronological flow.

### 5.7 The chat input

The chat input is a multi-line composer at the bottom of the centre column. It is the **conversation** input, not the inject input. It is physically separate from the inject input (which lives above the inspector). The chat input supports:

- Multi-line text.
- Code blocks (mono).
- Slash-prefixes (e.g. `/help`, `/sessions`, `/plan`, `/audit`, `/settings`) — the universal input router.
- A "send" affordance and `Enter` to submit (`Shift-Enter` for newline).
- **Draft recovery** (PRD story 53). If the connection drops or the operator refreshes, the draft survives.

### 5.8 The history of a session

A session is **not** a single conversation. A session is a container for one or more **plans** and the **conversation around them**. The chat flow renders:

- The conversation.
- The plans (one PlanCard per plan).
- The interventions, decisions, and mutations on those plans.
- The session's events (kernel connection, instance switches, lifecycle events) as low-weight SystemNotes.

The operator can scroll back through the full history. The history is a chronological interleaving of operator text, runtime text, plan cards, bid panels, agent output streams, HITL interventions, tool calls, artifact cards, memory references, and system notes.

### 5.9 Session state strip (bottom of centre column)

A small strip below the chat input showing: current plan id, current step, active agent, confidence, TrustScore, cost so far, elapsed time. Persists across the session. The same data also appears in the PlanCard footer and in the inspector.

### 5.10 Embedded interactive artifacts

The chat surface accepts **embedded interactive artifacts** (PRD story 6) — first-class blocks that the runtime can render into the flow. The first set of artifact types:

- **PlanCard** (above).
- **BidPanel** (above).
- **AgentOutputStream** (above).
- **HITLInline** (above).
- **ToolCall** (above).
- **MemoryReference** (above).
- **ArtifactCard** (above).
- **SkillPanel** — a system skill that the agent loaded (SKILL.md, bundled grants, scope tags, "what this skill does"). Pinned while the skill is in working memory.
- **EpisodicMemoryCard** — a session-level narrative the Consolidator produced. Pinned to the session when it lands.
- **ProceduralTemplateCard** — a Hippocampus template the Planner chose. Shows the template, the hit rate, the agents it typically uses. Pinned to the plan that used it.

These are the V1 artifact types. The technical document defines the contract for the runtime to emit a new artifact type; the design system defines the visual vocabulary for an artifact block.

### 5.11 Realtime within the chat

- The chat flow is **realtime by default**. A new block slides in from below (≤250 ms in). A streaming block grows as it receives tokens.
- The PlanCard pulses when a step transitions. The active step pulses. The bid panel pulses when bids arrive. The intervention block pins itself when it is raised.
- The chat does not auto-scroll if the operator has scrolled up to read history. A small "new activity" affordance appears at the bottom edge; clicking it scrolls to the new block.

---

## 6. The right inspector — per-context shapes

The inspector is **context-shaped**. The default shape during chat is the plan stack (§5.4). The other shapes:

### 6.1 Resource context (agent / tool / skill / MCP / memory)

- Header: id, trait / type, status pill, last activity timestamp.
- Key fields (the manifest, the schema, the SKILL.md, the connection state, the FACT/SCENE).
- Recent activity (last 10 events, virtualised).
- Related plans (plans that touched this resource in the last 24 h).
- Mutating actions (operator-only; tagged "mutating"). A mutating action opens a form in the inspector; the form has a diff view and a mandatory reason field.

### 6.2 Mutation context

- The form.
- The diff (before / after), rendered in a side-by-side or inline diff depending on the field type.
- A mandatory reason field.
- A confirm-with-consequence bar.

### 6.3 Audit context

- The entry, with actor, target, before / after, timestamp, reason.
- A deep link to the target (the agent, the tool grant, the memory document, the skill, the MCP server, the config change).

### 6.4 Empty context

- A single status pill and a one-line "no context." No empty illustration; the absence of context is the normal state when the operator is not focused on anything.

---

## 7. The operator console

Each console entry is its own screen, reached from the navigation rail. Each screen follows the same three-section pattern: **filter bar at the top, list in the centre, detail in the right inspector**. Mutations live in the inspector (operator-only; viewer sees the read-only form with a "this action requires Operator" disabled state).

### 7.1 Sessions (PRD stories 2, 3, 15, 16, 17, 5)

- **List.** All sessions, filterable by state, time, agent, free text. Each row: title, state pill, last activity, plan count, agent mix, cost.
- **Detail.** Opens the chat surface for the selected session (this is the centre column switching into the session). The session header shows: id, state, created, last activity, plan count, agent mix, cost. Mutating actions: pause, resume, complete.
- **Checkpoints.** A "Checkpoints" tab inside the session shows the timeline of checkpoints; the operator can resume from any historical checkpoint (story 11).

### 7.2 Plans in Flight (PRD story 14)

- **List.** Every running plan across all sessions, sorted by start time. Each row: plan id, session, subject, step count, active agent, status pill, elapsed time, cost. The `1`…`9` hotkey jumps to the nth plan.
- **Detail.** The full plan view (graph or list, per the operator's preference) in the centre, the active step in the inspector.

### 7.3 Agents (PRD stories 17, 18)

- **List.** Every registered agent. Each row: id, trait pill, scope summary, TrustScore, last activity, last state.
- **Detail.** Header (id, trait, manifest). Genotype (manifest, cognitive fingerprint, scope). History (TrustScore EWMA, recent verification outcomes, last error, last successful plan). Mutating actions: adjust scope, adjust write tags, adjust tool grants, register a new agent (deferred if the kernel does not yet support runtime registration of agents — confirm in the technical document).

### 7.4 Tools & Skills (PRD stories 19, 20)

- **List.** Tabbed: Tools / Skills. Each row: id, description (Tier-1 summary), danger flag, granted-agent count, recent-invocation count, last cost.
- **Detail — Tool.** Header. Manifest (Tier-1 by default; Tier-2 on demand). Granted agents (list). Recent invocations (list with status, latency, cost). Errors. Mutating actions: adjust grants per agent, register a new tool (subject to kernel capability).
- **Detail — Skill.** Header. SKILL.md (rendered markdown). Bundled tool grants. Scope tags. "Where loaded" (which agents / plans have used this skill recently). Mutating actions: register a new system skill (PRD story 31).

### 7.5 MCP (PRD story 21)

- **List.** Every external MCP server. Each row: id, connection state pill, tool count, last health check, default price.
- **Detail.** Connection state. Discovered tools (list with Tier-1 summary). Health / reconnect history. Default price. Mutating actions: register / update / remove an MCP connection (PRD story 32).

### 7.6 Memory (PRD stories 22, 23, 24, 30, 38)

- **List.** Top: filter bar (DocType, scope, session, time, activation_strength, free text). Centre: virtualised list of documents. Each row: DocType pill, scope tag, activation_strength bar, session (if any), age, content preview.
- **Detail.** Open a document. Inspector shows: header (id, DocType, scope tags, activation_strength, age). Body: FACT and SCENE. Graph: `document_edges` neighbours (collapsible). Provenance. Mutating actions: tag (with blast-radius preview — see §7.12), promote, supersede, delete. Bulk select for bulk-tag / bulk-supersede.
- **Compare.** Side-by-side view of two selected documents (similarity, scope, provenance, content).

### 7.7 Scope (PRD story 25)

- **List.** Every agent. Each row: id, EffectiveScope summary, DefaultWriteTags summary, last scope change.
- **Detail.** EffectiveScope (read-only). DefaultWriteTags (mutable). Caller scope (read-only). k-anonymity floor (read-only). Audit history of scope changes. Mutating actions: adjust scope, adjust write tags, register a new agent (subject to kernel capability).

### 7.8 Watch & Reactive (PRD story 26)

- **List.** Every WatchConfig. Each row: id, target streams, last fire timestamp, last fire status, error count.
- **Detail.** Rule (rendered YAML / structured). Target streams. Last fires (list with status, duration, output). Errors. Mutating actions: create / update / delete a WatchConfig.

### 7.9 Lifecycle (PRD story 27)

- **Dashboard.** Scheduler state. Pending jobs. Last consolidation (timestamp, duration, output). Dormancy events. The lifecycle manager's current state.
- **Mutating action.** Trigger a manual consolidation (full or scoped).

### 7.10 Verifier Pool (PRD story 28)

- **Dashboard.** Pool composition. Recent rounds (list with verifier id, target, score, cross-verification status). Surveillance triggers (list).
- **Detail — Round.** The round, the verifier's score, the cross-verification outcome.

### 7.11 Cost & Energy (PRD story 29)

- **Dashboard.** Per-step, per-session, per-agent, per-model cost for the current run and the recent history. Circuit-breaker state (per LLM provider). Price ledger. One-click deep links to Langfuse / OTel.
- **Lightweight, not a metrics explorer.** This is the status panel, expanded.

### 7.12 Blast-radius preview (memory tagging)

When the operator tags a memory or resource (PRD story 30), the mutation form opens the inspector. Above the confirm bar, a **blast-radius panel** shows: which agents' `EffectiveScope` is now widened or narrowed, and which `EffectiveForCaller` results would change. The panel is a virtualised list, sorted by impact. The operator must read the blast radius before the confirm-with-consequence bar enables. The bar names the consequence: "Tagging this memory with `scope:internal` will narrow the EffectiveScope of 3 agents. 2 plans that referenced this memory will be re-evaluated at next step."

### 7.13 Audit (PRD stories 41, 42, 51)

- **List.** Every mutating action. Filter by actor, target, type, time. Each row: timestamp, actor, target, action type, status, reason (truncated).
- **Detail.** Full entry, before / after diff, reason (full text), deep link to the target.
- **Export.** CSV / JSON export of the filtered slice.

---

## 8. The status panel and resilience states

### 8.1 The status strip (bottom of every screen)

A 32 px strip, always visible. Fields (left to right): current instance, kernel up, LTM up, in-flight plans (count), queue depth, circuit-breaker state, current spend rate, event backlog. Each field is a clickable drill-down.

### 8.2 Connection state

- **Live.** Green pill. Real-time events flowing.
- **Reconnecting.** Amber pill, pulsing. The UI shows what is known; pending events are queued; the realtime stream reconnects automatically.
- **Down.** Red pill. The UI is honest: "Cannot reach kernel at `<host>`. Last known state: <timestamp>." A "retry now" affordance.

### 8.3 Event backlog

- The status strip's "event backlog" field shows the count of events the runtime has produced but the UI has not yet rendered. It is a real-time health indicator of the UI's pipeline.
- When the backlog exceeds a threshold (TBD in the technical document), the strip turns amber. The threshold is a per-operator preference.

### 8.4 Draft recovery

The chat input and the inject input both survive a refresh. The operator's drafts persist across reconnections.

### 8.5 Optimistic vs pessimistic

- **Reads** are pessimistic. The UI shows the kernel's truth; it does not pretend to know what the kernel has not told it.
- **Mutations** are optimistic for **fast, non-destructive** actions (toggle a setting, apply a tag). The audit entry appears in real time as the success state.
- **Mutations** are pessimistic for **destructive** actions (delete a memory, revoke a grant, override a HITL). The confirm-with-consequence bar is a hard gate. The audit entry appears in real time as the success state.

---

## 9. Empty, loading, error, success, audit

### 9.1 Empty state

- Every list (sessions, agents, tools, memory, audit) has an empty state.
- **Shape.** Small dark illustration using brand motifs, one sentence, one primary action. Example: "No agents registered. Register one." with a "Register agent" affordance. The illustration is a single line drawing in the brand accent; no other colour.

### 9.2 Loading state

- **Skeleton.** Linear-style, 5 px tall bars for text, 32 px tall bars for cards. No spinner. The skeleton uses `bg/skeleton` and a 1.5 s shimmer (the only motion in the app that loops).
- **Max skeleton time: 5 s.** After 5 s, the empty state takes over with a "we couldn't load this; retry" affordance.

### 9.3 Error state

- **Kernel's reason verbatim.** No translation, no truncation. The error block in the chat flow and the error banner in the console both show the kernel's reason, with a one-line "what to do" and a deep link to the relevant console screen.
- **No generic toasts.** A toast is reserved for mutating-action confirmation only. Errors are inline, in context.

### 9.4 Success state

- **Reads do not celebrate.** A read that succeeds renders its data; there is no "loaded!" toast.
- **Mutations celebrate via the audit log.** The success state of a destructive mutation is the **audit-log entry appearing in real time** (PRD ID-6). The operator sees the change land before they have a chance to navigate away.
- **A confirmation toast** appears for non-destructive mutations (toggle, apply tag), and disappears after 3 s. The toast name-checks the action: "Granted `terminal_tool` to `analyst`."

### 9.5 Audit

- Every mutating action produces an audit entry. The audit entry is a first-class UI object: a card with actor, target, before, after, timestamp, reason.
- The audit entry is **streamed in real time** to the audit list (when the list is visible) and to the relevant console screen's "recent activity" list. The entry is the success state of the mutation.
- The audit list is filterable, exportable, and deep-linkable to its target.

---

## 10. Keyboard

The V1 keyboard map. Single keys, mnemonic where possible. The command palette (`Cmd/Ctrl-K`) is the discoverability layer for everything not on this map.

| Shortcut | Action | Scope |
|---|---|---|
| `g s` | Go to Sessions | global |
| `g p` | Go to Plans in Flight | global |
| `g a` | Go to Agents | global |
| `g t` | Go to Tools & Skills | global |
| `g m` | Go to MCP | global |
| `g y` | Go to Memory | global |
| `g o` | Go to Scope | global |
| `g w` | Go to Watch & Reactive | global |
| `g l` | Go to Lifecycle | global |
| `g v` | Go to Verifier Pool | global |
| `g c` | Go to Cost & Energy | global |
| `g u` | Go to Audit | global |
| `g x` | Go to Settings | global |
| `c` | Focus the chat input | when on a session |
| `i` | Focus the inject-into-plan input | when a plan is running |
| `a` | Approve the highlighted HITL intervention | when an intervention is highlighted |
| `r` | Reject the highlighted HITL intervention | when an intervention is highlighted |
| `e` | Edit the highlighted HITL intervention | when an intervention is highlighted |
| `j` / `k` | Next / previous item in the current list | when a list is focused |
| `Enter` | Open the focused item | when an item is focused |
| `Esc` | Close the current panel / popover / dialog | when a panel is open |
| `?` | Show the shortcut palette | global |
| `Cmd/Ctrl-K` | Command palette | global |
| `1`…`9` | Jump to the nth plan in the Plans in Flight view | when on Plans in Flight |
| `t` | Cycle theme (dark / light) | global |
| `/` | Focus the filter bar | when on a list screen |
| `n` | New (session, memory tag, etc., contextual) | contextual |
| `[` / `]` | Collapse / expand the left rail | global |
| `{` / `}` | Collapse / expand the right inspector | global |

**Discoverability.** A `?` shortcut opens the shortcut palette: a search-over-shortcuts modal. The command palette (`Cmd/Ctrl-K`) is the universal entry point for actions not on this map and for navigation by free text.

**Refinement.** The map is a V1 commitment, subject to refinement after first real use. The technical document does not need to lock it; the product PRD (story 45) requires it.

---

## 11. Configuration surface (in-app, full)

The UI is the **sole** end-to-end interface for an operator. Setup, deploy, run, interact, monitor — all of it lives in the UI. The Settings surface is the operator's primary workspace for setup and configuration; it is also reachable from drill-downs inside the rest of the app.

### 11.1 Areas

- **Connection (instances).** List of configured Cambrian instances. For each: label, colour tag, host, port, UDS path, auth method, namespace, last-seen, last health. The operator can add, edit, remove an instance. The current instance is highlighted with the colour tag and the accent border. The instance switcher lives in the navigation rail footer; the instance list lives in Settings.
- **Runtime settings.** The subset of `config.json` keys the kernel publishes as operator-editable. The UI is a **form over the published schema** — the kernel is the source of truth for what is editable. Each field has a description, a default, a current value, a "reset to default" affordance, and a "what this does" tooltip. Destructive changes (e.g. "disable the audit log") require a confirm-with-consequence bar and a mandatory reason.
- **UI control-plane settings.** Density (compact / default / spacious), theme (dark; light is a follow-on), shortcut map (the V1 map + the user's overrides), default landing (last screen vs pinned screen), panel sizes (left rail width, right inspector width), telemetry opt-in (deep-link to Langfuse/OTel; the UI does not collect telemetry unless the operator opts in).
- **Instance profiles.** A named bundle of (connection + UI + published runtime settings). Save, load, export, import. Profiles are the operator's "I run a development kernel and a production kernel" answer.
- **Telemetry & audit of config.** Every config change is audited with actor, target, before, after, timestamp, mandatory reason. The audit list is the same surface as the main audit list. Config changes are tagged `kind=config` for filtering.

### 11.2 First-run flow

The first time the operator opens the app:

- If no instance is configured, the app lands on the **Instance Setup** screen (a Settings sub-screen). The operator adds the first instance (host, port, auth, label, colour tag). The UI connects; on success, the operator lands on the **Sessions** screen.
- The first-run flow is skippable for developers (an "advanced" toggle shows the connection form on every launch until the operator turns it off).

### 11.3 Drill-downs

Every "configure this X" affordance in the rest of the app opens the relevant Settings sub-screen with the relevant field focused. Examples:

- From the instance switcher: "Configure this instance" → Settings → Connection.
- From the agent detail: "Configure scope" → Settings → Scope (the operator can also edit scope in the agent detail; Settings is for global view).
- From the audit entry of a config change: deep link to the relevant Settings sub-screen.
- From the status strip's "circuit-breaker" field: deep link to Settings → Runtime → LLM provider.

### 11.4 What the design system forbids in config

- **No free-form JSON editor** for runtime config. The UI is a form over the published schema. If the operator needs a free-form editor, the technical document can propose it as a follow-on; the V1 product decision is "no."
- **No silent config changes.** Every change is audited and announced.
- **No "advanced" features in the default path.** Destructive settings are clearly marked and require a confirm-with-consequence bar.

---

## 12. Accessibility

Accessibility is a product requirement, not a polish step.

- **Keyboard.** Every action is reachable by keyboard. The keyboard map (§10) is the contract.
- **Focus order.** Logical, predictable, visible focus rings (the brand accent, 2 px, offset 2 px, never removed). Focus is never lost on rerender; the UI restores focus to the element that had it.
- **Screen reader.** Every interactive element has an accessible name and a role. Live regions (`aria-live`) for the realtime event stream and for the status strip. The plan graph has a screen-reader equivalent (the step-list view is the canonical accessible representation; the graph view is decorative).
- **Contrast.** WCAG AA in dark mode at minimum; AAA preferred. The status colours (ok / warn / err / info) meet AA against the canvas; AAA preferred.
- **Motion.** The `prefers-reduced-motion` media query disables the pulse, the trail, and the in/out animations. The realtime state is still communicated (via status pills, text, and live regions) — only the visual motion is reduced.
- **Density.** The density toggle is a user preference, persisted. The default is compact; the operator can move to default or spacious.
- **Text size.** The type scale supports browser zoom up to 200 % without breaking layout.

---

## 13. Build order

The product PRD names "vertical slice first, then parallel packages" (story ID-11) but defers the order. This PRD proposes the order.

### 13.1 Vertical slice — the demo path

The vertical slice is the V1 demo path: **Operator authenticates → creates a session → types a prompt → watches the plan form, sees bids, sees output → injects a mid-plan correction → resolves a HITL intervention → opens the memory explorer and tags a document → opens the audit log and sees every mutation.** All in one app, all in realtime.

The slice is **thin in features but real in behaviour**. It exercises every subsystem in the data-surface list (PRD §7). It is the canary. If the demo path works, the rest of the console is a composition of the same primitives. If the demo path is broken, no other feature compensates.

The slice ships with:

- The design system (tokens, primitive components, layout, the customised shadcn/ui).
- The shell (three columns, navigation rail, status strip, role gating, density toggle).
- The chat surface (chat input, inject input, plan stack, PlanCard, BidPanel, AgentOutputStream, HITLInline, ToolCall, ArtifactCard, MemoryReference, SystemNote, ErrorBlock).
- The chat-only flows: session create / open / list, chat send, inject, HITL approve / reject / edit.
- The **Settings → Connection** sub-screen (instance list, instance add, current instance).
- The **Audit** screen (read-only at the slice; mutations are added in P4).
- The **Memory** screen at a minimal level: list + filter + open + tag (with blast-radius preview). Compare / graph are added in P3.
- The realtime engine (event subscription, pulse-and-trail, status pills, status strip).
- The keyboard map (the 17 V1 shortcuts + the command palette).
- The accessibility pass for the slice (keyboard, focus, contrast, motion-reduce).

The slice does **not** ship with: most of the operator console (P1, P2), the full memory explorer (P3), the audit mutations (P4), polish (P5), theming & full a11y (P6).

### 13.2 Parallel packages (after the slice)

| Package | Scope | Dependencies |
|---|---|---|
| **P1. Subsystems read views** | Agents, Tools, Skills, MCP, Scope. Read-only detail pages with the resource context shape. | Slice. |
| **P2. Subsystems read + mutate** | Watch & Reactive, Lifecycle, Verifier Pool, Cost & Energy. Detail pages with the lifecycle / verifier / cost shapes; lifecycle and watch support mutations. | Slice; P1. |
| **P3. Memory explorer** | Compare, graph view, bulk select, bulk tag / supersede, advanced filters, episodic memory cards, procedural template cards. | Slice. |
| **P4. Audit & export** | Audit mutations, CSV / JSON export, deep-link back to the target from any audit entry. | Slice. |
| **P5. Configuration** | Settings → Runtime, Settings → UI, Settings → Profiles, drill-downs from the rest of the app, first-run flow, blast-radius preview for non-memory resources. | Slice; P1 (for agent-scope drill-downs). |
| **P6. Polish & a11y** | Density toggle polish, shortcut palette refinement, empty / loading / error pass, full screen-reader pass, AAA contrast pass, light mode (if V1). | All of the above. |

### 13.3 Dependency notes

- **P1 and P3 can run in parallel** with each other and with P2, because they consume the same primitives (resource context shape, list + filter + detail) and the slice already has those primitives.
- **P5 is partially sequential on P1** (agent-scope drill-downs). The Connection half of P5 can run with the slice; the full Settings surface waits on P1.
- **P6 is last.** It is polish, not a feature, and a polish pass over a partial product is wasted work.
- **Hidden dependencies** (e.g. the kernel-side contract for what runtime config is published, the realtime transport's actual latency budget) are the technical document's job. The UX PRD's dependency graph is the product dependency graph.

### 13.4 Acceptance gate for V1

The product PRD's success criteria (PRD §8) are the V1 acceptance gate. The slice is not V1; the slice is the tracer bullet that proves the architecture. V1 is the slice + P1–P6, against the success criteria.

---

## 14. Open questions for the technical document

These are the questions the **technical document** must answer, deliberately left open here. Every question is a constraint the product PRD and this UX PRD already imply; the technical document picks the answer.

1. **Transport.** gRPC-Web / Connect / sidecar / WebSocket-only / … The chat surface's realtime blocks, the operator console's realtime updates, the settings surface's mutations, the audit surface's stream — all of it is a single contract.
2. **Realtime protocol.** WS / SSE / streaming / hybrid. The latency budget per event class (PRD ID-5 promise: "no manual refresh, ever").
3. **Auth provider and role model implementation.** The product PRD (ID-7) requires two roles; the technical document picks the provider, the session storage, and the server-side enforcement.
4. **Deployment shape.** Single binary, sidecar, browser-only, embedded assets. Remote reach (PRD §2.8) is a constraint; the technical document picks the shape.
5. **Build target, packaging, CI/CD.** Web app only? Tauri shell? Both? Static export + embedded assets?
6. **The kernel-side contract for operator-editable runtime config.** Which keys are published, in what schema, with what validation. The product PRD requires the UI to be the sole interface; the technical document defines the contract.
7. **The kernel-side contract for the realtime event stream the UI subscribes to.** Which events, in what shape, with what ordering and delivery guarantees. The product PRD requires no manual refresh; the technical document defines the contract.
8. **Performance, observability, and testing approach for the UI itself.** End-to-end test stack, visual regression, component tests, performance budget enforcement.
9. **Hidden dependencies in the build order.** The package-dependency graph in §13.3 is the product graph. The technical document will surface technical dependencies (e.g. the realtime transport must be settled before P5 can land).
10. **Concrete file layout inside the UI codebase.** `./ui/design-system/` is committed; the rest of the layout (`./ui/app/`, `./ui/protocol/`, etc.) is the technical document's call.

---

## 15. Glossary (UI-side, for the record)

The UI uses Cambrian's terms. Definitions live in `CONTEXT.md` §7. The terms the UI surfaces most are:

- Substrate, Handoff, Payload
- ExecutionPlan, Step, Plan, Plan stack
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
- Pulse, Trail, Status pill, Status strip, Inject input, Chat input, Plan stack, Plan card, Bid panel, Agent output stream, HITL inline
- Instance, Instance profile, Runtime settings, UI control-plane settings, Blast radius
