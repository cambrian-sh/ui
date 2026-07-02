# PRD-01 — Foundation: Design System, Density, Theme, Accessibility, Realtime Grammar

**Status:** Frozen v1.0 — locked 2026-06-22.
**Parent PRD:** `web-ui-ux-prd.md` v0.1.
**Sibling PRDs:** [PRD-02](02-shell-and-layout.md) Shell & Layout · [PRD-03](03-chat-surface.md) Chat Surface · [PRD-04](04-plan-work-surface.md) Plan Work Surface · [PRD-05](05-memory-explorer.md) Memory Explorer · [PRD-06](06-operator-console.md) Operator Console · [PRD-07](07-configuration-and-audit.md) Configuration & Audit.
**Source requirements:** `../requirements/web-ui-requirements.md` §2.7 (Design system), §2.5 (Realtime), §2.6 (Auth → a11y overlap), §6 (UX principles 2, 9, 10).
**Source PRD:** `web-ui-prd.md` ID-2 (vocabulary), ID-8 (design system as single source of visual truth), ID-5 (realtime default).
**Story coverage:** Story 43 (realtime), Story 45 (keyboard), Story 46 (keyboard-alone), Story 47 (dark-mode-first), Story 48 (no generic toasts), Story 11 (a11y contract).
**Companion ADRs (Frozen):** [UI-001](../adr/UI-001-design-system-tooling.md) Design System Tooling (Tailwind v4 + shadcn/ui) · [UI-002](../adr/UI-002-i18n-externalization.md) i18n Externalization (Lingui).

---

## 1. Scope

**In scope.** The 4-layer token taxonomy (primitive, semantic, component, density); the visual tokens (colour, type, spacing, radius, elevation, motion, iconography) for dark + light; the component inventory (the customised shadcn/ui); the realtime visual grammar (pulse, trail, status pills, motion budget); the accessibility contract (keyboard, contrast, screen reader, focus, motion-reduce, density preference); the keyboard foundation (the 17 V1 shortcuts + the command palette contract); the cross-cutting state vocabulary (empty, loading, error, success, audit); what the design system forbids.

**Out of scope.** The three-column shell and role gating (PRD-02). The chat, plan, memory, operator, configuration surfaces (PRDs 03–07). Technical decisions (transport, framework, deployment, auth, state-management library) — these are ADRs, not PRDs. The product PRD's ID-7 (Operator vs Viewer) and ID-9 (data plane) are inherited, not re-decided here.

---

## 2. Inherited locked decisions (from UX PRD §2)

The following decisions are **normative** for this PRD and for every UI screen. They are restated here in full so this PRD is self-contained and can be read without the parent open. Subsequent PRDs (PRD-02…07) cite these by number.

### 2.1 Locked Decision 2 — Realtime visual grammar (UX PRD §2.2)

> Pulse-and-trail for the moment of change. Live status pills for the durable state. Aesthetic guardrail (anti-slop): no gratuitous particle effects, no neon glow, no default-shadcn styling, no motion-for-motion's-sake. The pulse is a soft, brief, low-saturation highlight (subtle background tint, 1 px border, no glow). The trail is a 2 px vertical mark in the right margin of a list, in a brand-tinted neutral. The pills use the same colour tokens as the rest of the system. Motion budget per event: ≤250 ms in, ≤600 ms out.

### 2.2 Locked Decision 3 — Density and theme (UX PRD §2.3)

> **Density.** Default density for the operator console: compact. Default density for the chat surface: default. Operator-tunable. Global toggle (compact / default / spacious). The toggle persists per operator and per device. Density is a token-level switch (a CSS variable), not a per-component fork. Components consume density tokens; they do not branch on a prop.
>
> **Theme.** Global toggle (dark / light). **Both ship in V1.** Dark is the default. The theme is a token-level switch; only the token values differ between modes. Components consume theme tokens, they do not branch.
>
> The shell is theme-aware and density-aware (see PRD-02 §4.7).

### 2.3 Locked Decision 7 — Design system (UX PRD §2.7)

> **Location.** Inside the UI codebase, `./ui/design-system/`. Not in the runtime repo.
>
> **Foundation.** Tailwind CSS + shadcn/ui.
>
> **Tokens.** TypeScript code-as-stylesheet (vanilla-extract or a thin in-house equivalent). Tokens are consumed by Tailwind via CSS variables emitted at build time.
>
> **Components.** shadcn/ui customised to the design system tokens. The design system **is** the customised shadcn/ui.
>
> **Accessibility.** Built in. Keyboard, contrast, screen reader, focus order. Not a follow-on.

### 2.4 Inherited sub-decisions (from `../ui-session/02-decisions-summary.md`)

- **Light mode ships in V1.** (Was originally "follow-on"; promoted in the lock-in pass.)
- **Theme is a token-level switch.** §4.7 covers theme alongside density.
- **Nav-rail footer carries theme + density toggles.** (Consumed by PRD-02 §4.2.)
- **Plan view lives in two places** (chat PlanCard + right inspector). (Consumed by PRD-03 + PRD-04.)
- **Settings V1 scope cut.** Free-form JSON editor is out of V1. (Consumed by PRD-07.)

### 2.5 Inherited engineering constraints (from `ui/CONTEXT.md` "Frozen decisions")

The following engineering decisions are **already frozen** in the UI codebase (`ui/CONTEXT.md`, "Frozen decisions" section + `ui/src-tauri/CONTEXT.md` transport contract). They are not open questions for this PRD series; PRDs 02–07 cite these by number where they apply. Inherited verbatim from the in-repo `ui/CONTEXT.md` so the PRD series is self-contained.

- **EC-1 — Tauri 2 desktop shell.** The webview is packaged inside a Tauri 2 desktop application. Not a browser-only app, not a sidecar. The desktop shell is the deployment target; the kernel and the webview run on the same machine (the kernel separately, the webview inside the shell).
- **EC-2 — React 19 + TypeScript + Vite.** Frontend stack is React 19 with TypeScript and Vite. No Svelte, Solid, Vue. The component model is React's; the build is Vite's.
- **EC-3 — Bun for JS package management and dev/build.** Not npm, not pnpm, not yarn. The `bun.lock` is the source of truth; `bun run dev` / `bun run build` are the canonical commands.
- **EC-4 — gRPC in Rust core only.** All gRPC traffic to the kernel's `OperatorConsole` service happens **exclusively** in `ui/src-tauri/`. The webview touches only Tauri IPC (`invoke` + `listen`). The Rust core is the **state of record**; the webview is a **projection/cache**. This is a hard rule, not a guideline. UI-005 (now: Realtime Sync Strategy) is about how the projection folds, not whether gRPC is in scope of the webview.
- **EC-5 — Vendored `ui/proto/operator.proto`, pinned to kernel contract 0047.** The proto file is vendored and **DO NOT EDIT BY HAND**. Kernel `api/proto/` is the source of truth; a re-vendor happens at every contract bump (tracked in `ui/src-tauri/CONTEXT.md`). The webview's TypeScript types derive from the vendored proto via `tonic` codegen on the Rust side; the webview consumes the gRPC surface through Tauri commands, not directly.

**Why these are not ADRs.** An ADR records a decision. These are decisions that have already been recorded and frozen in the codebase. Locking them again in our UI-NNN ADR numbering would be paperwork for paperwork's sake. PRDs 02–07 reference them by number (EC-1…EC-5) and proceed.

---

## 3. Token taxonomy (4 layers, no skipping)

Each layer is consumed by the layer above it. **No layer skips a level.** A component reads `density/row/h`, which resolves to a primitive row height through the semantic tokens. Components do not branch on a prop; they consume density tokens.

| Layer | Purpose | Examples |
|:------|:--------|:---------|
| **Primitive** | Raw values. | Colour ramp (12-step neutral, 9-step brand, 8-step semantic, 6-step status: ok / warn / err / info / pulse / muted), type scale (6 sizes), spacing (8-step), radius (4 steps), elevation (3 steps), motion (4 easings + 4 durations). |
| **Semantic** | What a value means. | `bg/canvas`, `bg/surface`, `bg/elevated`, `fg/primary`, `fg/secondary`, `fg/muted`, `border/subtle`, `border/strong`, `status/ok`, `status/warn`, `status/err`, `status/info`, `status/pulse`, `accent/brand`. |
| **Component** | What a value means inside a specific component. | `button/primary/bg`, `button/primary/fg`, `list/row/h`, `list/row/padding-x`, `card/padding`, `inspector/w`. |
| **Density** | What a value means under a density mode. | `density/row/h`, `density/padding/x`, `density/text/size`. |

**Rule.** If a component needs a value, it reads the corresponding component token, which reads a semantic token, which reads a primitive. **Hard rule: no `#hex`, no `rem(12)`, no `rgba(0,0,0,0.5)` literals in component code** (LD-7, §14 below).

### 3.1 Implementation: Tailwind v4 `@theme` + CSS variables

The 4 layers are **declared in CSS** via **Tailwind v4's `@theme` directive** and emitted as CSS variables at build time. A thin **TypeScript `tokens.ts` file** provides typed references to the CSS variables for autocomplete and compile-time safety. **No CSS-in-JS runtime.**

```css
/* tokens.css — the source of truth */
@import "tailwindcss";

@theme {
  /* Primitive layer */
  --color-neutral-50: oklch(0.985 0 0);
  --color-neutral-900: oklch(0.18 0 0);
  --color-accent-brand: oklch(0.65 0.18 250);

  /* Semantic layer (resolved to primitives) */
  --color-bg-canvas: var(--color-neutral-50);
  --color-bg-surface: var(--color-neutral-100);
  --color-fg-primary: var(--color-neutral-900);

  /* Component layer (resolved to semantics) */
  --color-button-primary-bg: var(--color-accent-brand);
  --color-button-primary-fg: var(--color-neutral-50);

  /* Density layer (per density mode) */
  --density-row-h: 36px;
}
```

```typescript
// tokens.ts — typed mirror for developer convenience (no CSS-in-JS)
export const tokens = {
  bg: {
    canvas: 'var(--color-bg-canvas)',
    surface: 'var(--color-bg-surface)',
  },
  fg: {
    primary: 'var(--color-fg-primary)',
  },
  button: {
    primary: {
      bg: 'var(--color-button-primary-bg)',
      fg: 'var(--color-button-primary-fg)',
    },
  },
} as const;
```

The TypeScript file is the **developer's reference**, not the source of truth. The CSS is the source of truth. Tailwind classes consume the CSS variables directly:

```html
<button class="bg-button-primary text-button-primary-fg">Send</button>
```

**Theme switching** is a `data-theme` attribute on `<html>` (or a parent) that flips the semantic tokens. **Density switching** is a `data-density` attribute that flips the density tokens. No JavaScript branching in components; the components consume tokens, the tokens are switched by the data attribute.

### 3.2 The shadcn/ui component library

The design system is **not just tokens** — it is a **reusable, composable component library** that every other Cambrian web-based frontend can import. The library is built on **shadcn/ui** (installed via the official `shadcn` CLI), customized to consume our component tokens instead of shadcn defaults, and extended with new components for the Cambrian-specific surfaces (PlanCard, BidPanel, MemoryListRow, etc.).

**Location.** Inside the UI codebase, `./ui/design-system/`. The library is published as a workspace package; other frontends (which all use Tailwind + shadcn per the org-wide convention) import it and inherit the design system — tokens, components, motion, a11y — without per-frontend re-implementation.

**Composition rules.**
- shadcn/ui components are **copied into the library** (the shadcn pattern) and customised to consume our component tokens.
- New components are **added to the library**, not invented per-screen. A new component goes through the inventory (PRD-01 §6) and is published once.
- The library is **the** source of visual truth. PRD-01 §11 forbids are enforced by lint rules on the library's components.

**Cross-frontend composability.** Because the library is built on Tailwind + shadcn, any frontend that already uses Tailwind + shadcn can import the library and get the same design system. CSS-in-JS would have broken this (it doesn't compose with the Tailwind classes other frontends use); the choice of Tailwind-native CSS is what makes the library portable.

---

## 4. Visual tokens

### 4.1 Colour

- **Dark + light both ship in V1** (LD-3). Dark is the default.
- The shadcn/ui + Tailwind foundation means both modes share component code and token names; only the **token values** differ per theme.
- **Background layers are 1–3 % lightness apart, not 10 %.** The UI is dense; contrast comes from borders, type weight, and the single accent, not from background jumps.
- **One accent.** The brand accent is the only saturated colour. Everything else is neutral or status-tinted. The accent is reserved for: focus rings, the active state, the foreground plan in the plan stack, the foreground plan in the inject input selector, and the operator's cursor in a list.
- **Status colours** (`ok / warn / err / info`) are reserved for status pills, destructive confirmations, and the realtime pulse. They do not appear in branding.
- **Contrast in both modes** meets WCAG AA at minimum; AAA is preferred. Status colours are tuned per mode to meet AA against that mode's canvas.
- **No neon, no glow, no gradient mesh.** "Professional instrument," not "marketing site" (LD-2).

### 4.2 Type

- **Two families.** A proportional UI family (operator's reading) and a monospace family (numbers, code, IDs, paths, scores, timestamps). System stacks; no remote font fetch on first paint.
- **Scale:** 12 / 13 / 14 / 16 / 20 / 28. Body is 13 in compact density, 14 in default.
- **Weight:** 400 regular, 500 medium, 600 semibold. No bold (700) except in rare emphasis.
- **Tracking:** default; tightened (-0.01em) on display sizes 20 and 28.

### 4.3 Spacing, radius, elevation

- **Spacing.** 4-step base. Padding inside a card: 12 (compact) / 16 (default) / 20 (spacious). Row height: 28 (compact) / 36 (default) / 44 (spacious).
- **Radius.** 4 (inputs, list rows), 6 (cards, popovers), 8 (modals), 12 (large surfaces). No pill shapes except for status pills.
- **Elevation.** Three levels, expressed as a 1 px border + a subtle, low-opacity background tint. **No drop shadows in dark mode.** Drop shadows are reserved for floating elements (popovers, menus, dialogs) — 24 px blur, 8 % opacity, brand-tinted.

### 4.4 Motion

- **Motion budget per event:** ≤250 ms in, ≤600 ms out (LD-2).
- **Easings:** `cubic-bezier(0.2, 0, 0, 1)` (deceleration) in; `cubic-bezier(0.4, 0, 1, 1)` (acceleration) out.
- **Pulse.** 250 ms background tint from `bg/surface` to `bg/pulse` and back, with a 1 px border in `border/pulse`. **No scale, no glow, no rotation.**
- **Trail.** 2 px vertical bar in the right margin of a list, in `fg/pulse`, fades in 250 ms, holds until the next event on the same row, then fades out 600 ms.
- **No motion** for state changes that are not realtime. Status pill colour changes are instantaneous.
- **Skeletons are the only loop.** A 1.5 s shimmer is the single repeated motion in the app (see §11.1 below).

---

## 5. Iconography

- **One icon family.** A single line-icon set, 16 px base, 1.5 px stroke, rounded caps and joins. Used everywhere — navigation, status pills, list rows, inspector headers.
- No filled icons, no two-tone icons, no emoji.
- Icons are tokens; they can be recoloured by token swap.

---

## 6. Component inventory (the customised shadcn/ui)

The shadcn/ui components are generated, then customised to consume the design system tokens. The full inventory (V1):

- **Surface & layout** — AppShell (PRD-02), ThreeColumnLayout (PRD-02), StatusStrip (PRD-02), Drawer, Modal, Popover, Tooltip, HoverCard, Toast (mutating-action confirmation only), Dialog (confirm-with-consequence).
- **Navigation** — NavRail (PRD-02), NavRailGroup, NavRailItem, NavRailFooter (PRD-02), CommandPalette, Breadcrumb, ShortcutHint.
- **Lists & tables** — List, ListRow, ListRowMeta, Table, TableRow, EmptyState, LoadingSkeleton, ErrorState, AuditEntry.
- **Chat** — ChatMessage, ChatMessageList, ChatInput, ChatComposer, EmbeddedArtifact, EmbeddedPlanCard (PRD-04), EmbeddedBidPanel (PRD-04), EmbeddedHITLInline (PRD-04), ChatDraftRecovery (PRD-03).
- **Plan** — PlanGraph (PRD-04), PlanGraphNode, PlanGraphEdge, PlanStepList (PRD-04), PlanStepRow, StepDetail (PRD-04), BidCard (PRD-04), BidOverlay (PRD-04), AgentOutputStream (PRD-04), AgentOutputLine, ConfidenceBar, TrustScorePill.
- **Memory** — MemoryList (PRD-05), MemoryListRow, MemoryDetail (PRD-05), MemoryFACT, MemorySCENE, MemoryGraph (PRD-05), MemoryCompareSideBySide (PRD-05), MemoryTagEditor (PRD-05), MemoryBlastRadius (PRD-05).
- **Resource (Agent / Tool / Skill / MCP)** — ResourceCard (PRD-06), ResourceHeader, ResourceManifest, ResourceSchemaView, ResourceInvocationList, MCPConnectionCard (PRD-06), MCPHealthBadge.
- **Scope** — ScopeEditor (PRD-06), EffectiveScopeView, DefaultWriteTagsEditor, CallerScopeView, ScopeHistoryList, PromotionLog.
- **Lifecycle / Watch / Verifier** — LifecycleDashboard (PRD-06), WatchConfigList (PRD-06), WatchConfigEditor, VerifierPoolCard (PRD-06), VerifierRoundList.
- **Cost** — CostPanel (PRD-06), CircuitBreakerPill, PriceLedger, AcquireOutcomeList.
- **Audit** — AuditList (PRD-07), AuditEntry, AuditDiff, AuditReasonField, AuditExport (PRD-07).
- **Status / realtime** — StatusPanel, StatusPill, PulseHighlight, TrailMark, EventBacklogIndicator, ConnectionBadge.
- **HITL** — HITLInline (PRD-04), HITLEditor, HITLDecisionBar (PRD-04).
- **Form primitives** — Input, TextArea, Select, Combobox, Checkbox, Radio, Switch, Slider, NumberInput, DateRange, FileDrop, TagInput, VocabularyPicker.
- **Feedback** — Toast (mutating-action confirmation only; never for reads), Dialog (confirm-with-consequence), Drawer, Popover, Tooltip, HoverCard.
- **Configuration** — InstanceSwitcher (PRD-07), InstanceList, InstanceProfileEditor (PRD-07, P5+), RuntimeSettingsForm (PRD-07), UIControlPlaneSettings (PRD-07), DiffView, ConfigFileRevealButton (PRD-07; the power-user "open the .json" affordance).

**Adding a new component.** New screens compose from this list. Anything new goes through the inventory as a new component (see §13 forbids).

---

## 7. Realtime visual grammar (LD-2)

The grammar is the contract between the kernel's event stream and the UI's visual response. Every realtime event is one of three visual primitives:

- **Pulse.** A 250 ms background tint from `bg/surface` to `bg/pulse` and back, with a 1 px border in `border/pulse`. Used on: a row that just received a new event, a PlanCard step that just transitioned, the active bid panel during an auction.
- **Trail.** A 2 px vertical bar in the right margin of a list, in `fg/pulse`, fades in 250 ms, holds until the next event on the same row, then fades out 600 ms. Used on: list rows (sessions, plans, agents, tools, memory) that have just received an event. The trail is the *transient* mark of "I just received new data"; the row's durable state is the status pill (§7.3).
- **Status pill.** A live pill that reflects the durable state (ok / warn / err / info / pulse / muted). No motion. The pill is the *truth*; the pulse and trail are the *change*.

**Anti-slop rules (enforced in the design system, not per-screen):**
- No scale, no rotation, no glow, no neon.
- No particle effects, no sparkles, no "magical" effects.
- No default-shadcn gradient mesh on the body, the shell, or any surface.
- Motion only when the state actually changed, and only on the row that changed.

---

## 8. Accessibility contract (built in, not a follow-on)

- **Keyboard.** Every action is reachable by keyboard. The keyboard map (§9) is the contract.
- **Focus order.** Logical, predictable, visible focus rings (the brand accent, 2 px, offset 2 px, never removed). Focus is never lost on rerender; the UI restores focus to the element that had it.
- **Screen reader.** Every interactive element has an accessible name and a role. Live regions (`aria-live`) for the realtime event stream and for the status strip. The plan graph has a screen-reader equivalent (the step-list view is the canonical accessible representation; the graph view is decorative).
- **Contrast.** WCAG AA in dark mode at minimum; AAA preferred. The status colours (`ok / warn / err / info`) meet AA against the canvas; AAA preferred.
- **Motion.** The `prefers-reduced-motion` media query disables the pulse, the trail, and the in/out animations. The realtime state is still communicated (via status pills, text, and live regions) — only the visual motion is reduced.
- **Density.** The density toggle is a user preference, persisted. The default is compact; the operator can move to default or spacious.
- **Text size.** The type scale supports browser zoom up to 200 % without breaking layout.

---

## 9. Keyboard foundation

The V1 keyboard map. Single keys, mnemonic where possible. The command palette (`Cmd/Ctrl-K`) is the discoverability layer for everything not on this map. **All bindings are subject to refinement after first real use** (LD-9).

| Shortcut | Action | Scope | Consumed by |
|:---|:---|:---|:---|
| `g s` | Go to Sessions | global | PRD-06 |
| `g p` | Go to Plans in Flight | global | PRD-06 |
| `g a` | Go to Agents | global | PRD-06 |
| `g t` | Go to Tools & Skills | global | PRD-06 |
| `g m` | Go to MCP | global | PRD-06 |
| `g y` | Go to Memory | global | PRD-05 |
| `g o` | Go to Scope | global | PRD-06 |
| `g w` | Go to Watch & Reactive | global | PRD-06 |
| `g l` | Go to Lifecycle | global | PRD-06 |
| `g v` | Go to Verifier Pool | global | PRD-06 |
| `g c` | Go to Cost & Energy | global | PRD-06 |
| `g u` | Go to Audit | global | PRD-07 |
| `g x` | Go to Settings | global | PRD-07 |
| `c` | Focus the chat input | when on a session | PRD-03 |
| `i` | Focus the inject-into-plan input | when a plan is running | PRD-03, PRD-04 |
| `a` | Approve the highlighted HITL intervention | when an intervention is highlighted | PRD-04 |
| `r` | Reject the highlighted HITL intervention | when an intervention is highlighted | PRD-04 |
| `e` | Edit the highlighted HITL intervention | when an intervention is highlighted | PRD-04 |
| `j` / `k` | Next / previous item in the current list | when a list is focused | PRD-05, PRD-06 |
| `Enter` | Open the focused item | when an item is focused | PRD-05, PRD-06 |
| `Esc` | Close the current panel / popover / dialog | when a panel is open | global |
| `?` | Show the shortcut palette | global | PRD-01 (this PRD) |
| `Cmd/Ctrl-K` | Command palette | global | PRD-01 (this PRD) |
| `1`…`9` | Jump to the nth plan in the Plans in Flight view | when on Plans in Flight | PRD-06 |
| `t` | Cycle theme (dark / light) | global | PRD-01 (this PRD) |
| `/` | Focus the filter bar | when on a list screen | PRD-05, PRD-06 |
| `n` | New (session, memory tag, etc., contextual) | contextual | PRD-03, PRD-05 |
| `[` / `]` | Collapse / expand the left rail | global | PRD-02 |
| `{` / `}` | Collapse / expand the right inspector | global | PRD-02 |

**Discoverability.** A `?` shortcut opens the shortcut palette: a search-over-shortcuts modal. The command palette (`Cmd/Ctrl-K`) is the universal entry point for actions not on this map and for navigation by free text.

**Refinement.** The map is a V1 commitment, subject to refinement after first real use. PRD-01 owns the map; PRDs 02–07 cite it. A change to the map is a change to this PRD.

---

## 10. State vocabulary (LD-8)

Every list, every page, every panel, every block has **one of these five states** at any moment. The states are the contract between the data plane and the presentation.

### 10.1 Empty

- Small dark illustration using brand motifs, one sentence, one primary action.
- Example: "No agents registered. Register one." with a "Register agent" affordance.
- The illustration is a single line drawing in the brand accent; no other colour.

### 10.2 Loading

- **Skeleton**, Linear-style: 5 px tall bars for text, 32 px tall bars for cards. No spinner. The skeleton uses `bg/skeleton` and a 1.5 s shimmer (the only looped motion in the app; reduced to no-motion under `prefers-reduced-motion`).
- **Max skeleton time: 5 s.** After 5 s, the empty state takes over with a "we couldn't load this; retry" affordance.

### 10.3 Partial (streaming / in-flight)

A block is `partial` when its shape is known but its data is still arriving. Used for:

- **PlanCard** forming (the Planner emits the plan, the steps stream in).
- **BidPanel** mid-auction (bids arrive one at a time).
- **AgentOutputStream** streaming (tokens or tool output arriving).
- **Tool call** running (the call has been dispatched, the result is in flight).
- **Memory write** in flight (the operator just clicked "tag" or "delete," the kernel hasn't acked yet).

**Visual contract.**

- **Skeleton** for the block's shape (the block's outline is rendered; the data slots are skeletons).
- **Pulse** on the streaming parts (PRD-01 §7 grammar) — the arriving data is the change.
- **Status pill** on the durable state (e.g., "forming plan," "auction running," "tool running").
- **No motion** on the skeleton shimmer beyond the standard 1.5 s loop (PRD-01 §4.4).

**Transition to a settled state.** When the data finishes arriving, the block transitions to its settled state (success for a successful streaming block, error for a failed one, audit for a destructive mutation). The skeleton collapses; the pulse stops; the status pill updates.

### 10.4 Error

- **Kernel's reason verbatim.** No translation, no truncation. The error block in the chat flow and the error banner in the console both show the kernel's reason, with a one-line "what to do" and a deep link to the relevant console screen.
- **No generic toasts.** A toast is reserved for mutating-action confirmation only. Errors are inline, in context.

### 10.5 Success

- **Reads do not celebrate.** A read that succeeds renders its data; there is no "loaded!" toast.
- **Mutations celebrate via the audit log.** The success state of a destructive mutation is the **audit-log entry appearing in real time** (product PRD ID-6). The operator sees the change land before they have a chance to navigate away.
- **A confirmation toast** appears for non-destructive mutations (toggle, apply tag), and disappears after 3 s. The toast name-checks the action: "Granted `terminal_tool` to `analyst`."

### 10.6 Audit (a special success state)

- Every mutating action produces an audit entry. The audit entry is a first-class UI object: a card with actor, target, before, after, timestamp, reason.
- The audit entry is **streamed in real time** to the audit list (when the list is visible) and to the relevant console screen's "recent activity" list. The entry is the success state of the mutation (PRD-07).

---

## 11. What the design system forbids

These are hard rules. Violations require a design-system amendment to this PRD, not a per-screen override.

- **Bespoke styles per screen.** New screens use existing components or propose a new component to the inventory.
- **Colours, radii, spacings, or motion values that are not tokens.** Hard rule: no `#hex`, no `rem(12)`, no `rgba(…)` literals in component code.
- **Two visual languages in the same app.** The chat surface (PRD-03) and the operator console (PRD-06) are the same design system. There is no chat "skin."
- **AI-generated slop.** The aesthetic guardrail in LD-2 is enforced by the design system: the pulse is subtle, the pills use status tokens, the icons are line and consistent, the typography is two families, the motion is bounded.
- **Pill shapes outside status pills.** Radius is 4 / 6 / 8 / 12; pill radius is reserved for status pills only.
- **Drop shadows in dark mode.** Elevation in dark mode is a 1 px border + a low-opacity background tint. Drop shadows are reserved for floating elements.
- **Motion on non-realtime state changes.** Status pill colour changes are instantaneous; only pulse, trail, and skeletons move.

---

## 12. Open questions (gaps for ADRs)

These are the open questions this PRD surfaces. Each maps to a Draft ADR.

| # | Question | ADR | Status |
|:--|:---------|:----|:-------|
| 1 | Which TypeScript code-as-stylesheet do we use to build the 4-layer token system? | [UI-001](../adr/UI-001-design-system-tooling.md) | **Draft** |
| 2 | Which string externalization strategy do we adopt so that English-only V1 doesn't paint us into a corner? | [UI-002](../adr/UI-002-i18n-externalization.md) | **Draft** |

**Not yet ADRs (out of this PRD's scope but surfaced for the next PRDs):**
- The realtime transport protocol (gRPC-Web / Connect / WS / SSE) is a PRD-02 question (UI-003-equivalent in that PRD's open-questions block).
- The keyboard library (`react-hotkeys-hook` vs `mousetrap` vs custom) is a PRD-02 question.
- The motion library (CSS-only vs Framer Motion vs Motion One) is a PRD-02 question; LD-2's motion budget still constrains the choice.

---

## 13. Cross-references

- **Parent PRD** — `web-ui-ux-prd.md` §2 (locked decisions), §3 (visual language), §8 (status panel), §9 (states), §10 (keyboard), §12 (accessibility).
- **Sibling PRDs** — PRD-02 §4.2 (nav-rail footer with theme + density toggles), PRD-02 §4.6 (role gating), PRD-02 §4.7 (density and theme on the shell), PRD-03 §3.7 (chat draft recovery), PRD-05 §10 (memory tag blast-radius preview), PRD-07 §11 (settings theme + density controls).
- **Kernel ADRs** — ADR-0019 (OTel Bridge), ADR-0021 (Langfuse) for observability of the design system itself; ADR-0022 (push/pull context) and ADR-0048 (working-memory context hygiene) for the realtime event semantics the UI subscribes to; ADR-0047 (Operator Transport Plane) for the transport-plane gRPC surface the UI will consume.
- **Companion ADRs** — UI-001, UI-002 (both in this PRD's §12).

---

## 14. Glossary

Definitions of the new vocabulary this PRD introduces. For shared kernel terms (Substrate, Handoff, ExecutionPlan, etc.), see `CONTEXT.md` §7.

- **Token** — A named design value. The system has 4 layers of tokens (primitive, semantic, component, density).
- **Pulse** — A 250 ms background tint that marks "this row just received new data." The transient visual.
- **Trail** — A 2 px vertical mark in the right margin of a list that holds until the next event. The transient visual.
- **Status pill** — The durable visual reflection of a row's state. The truth.
- **Density** — One of three operator preferences (compact, default, spacious) that flips the density token layer.
- **Theme** — One of two modes (dark, light) that flips the semantic token values.
- **Skeleton** — A 5 px (text) or 32 px (card) bar that is the only looped motion in the app.
- **Audit entry** — A first-class UI object surfaced as the success state of a mutating action.
- **Customised shadcn/ui** — The design system: shadcn/ui primitives, each customised to consume the design-system tokens instead of the shadcn/ui defaults.
