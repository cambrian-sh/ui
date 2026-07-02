# 03 — Design System

**Location:** `./ui/design-system/` (inside the UI codebase, not the runtime repo).
**Foundation:** Tailwind CSS + shadcn/ui.
**Tokens:** TypeScript code-as-stylesheet (vanilla-extract or a thin in-house equivalent), emitted to CSS variables at build time, consumed by Tailwind.
**The design system *is* the customised shadcn/ui.**

Everything below is **locked** under decision log 7.

## Token taxonomy (four layers, no skipping)

| Layer | Purpose | Examples |
|:------|:-------|:---------|
| **Primitive** | Raw values. | Colour ramp (12-step neutral, 9-step brand, 8-step semantic, 6-step status: ok/warn/err/info/pulse/muted), type scale (6 sizes), spacing (8-step), radius (4 steps), elevation (3 steps), motion (4 easings + 4 durations). |
| **Semantic** | What a value means. | `bg/canvas`, `bg/surface`, `bg/elevated`, `fg/primary`, `fg/secondary`, `fg/muted`, `border/subtle`, `border/strong`, `status/ok`, `status/warn`, `status/err`, `status/info`, `status/pulse`, `accent/brand`. |
| **Component** | What a value means inside a specific component. | `button/primary/bg`, `button/primary/fg`, `list/row/h`, `list/row/padding-x`, `card/padding`, `inspector/w`. |
| **Density** | What a value means under a density mode. | `density/row/h`, `density/padding/x`, `density/text/size`. |

Each layer is consumed by the layer above it. **No layer skips a level.** A
component reads `density/row/h`, which resolves to a primitive row height
through the semantic tokens. Components do not branch on a prop; they
consume density tokens.

## Colour (decision log 2 + 3)

- **Dark and light mode both ship in V1.** Dark is the default; light is a toggle. Both share the same components and token names; only the token values differ per theme.
- **Background layers are 1–3% lightness apart, not 10%.** The UI is dense; contrast comes from borders, type weight, and a single accent, not from background jumps.
- **One accent.** The brand accent is the only saturated colour. Everything else is neutral or status-tinted. Accent is reserved for: focus rings, the active state, the foreground plan in the plan stack, the foreground plan in the inject input selector, the operator's cursor in a list.
- **Status colours** (ok / warn / err / info) are reserved for status pills, destructive confirmations, and the realtime pulse. They do not appear in branding.
- **Contrast in both modes** must meet WCAG AA minimum; AAA preferred. Status colours are tuned per mode to meet AA against that mode's canvas.
- **No neon, no glow, no gradient mesh.** "Professional instrument," not "marketing site."

## Type

- **Two families.** A proportional UI family (operator's reading) and a monospace family (numbers, code, IDs, paths, scores, timestamps). System stacks; no remote font fetch on first paint.
- **Scale:** 12 / 13 / 14 / 16 / 20 / 28. Body is 13 in compact density, 14 in default.
- **Weight:** 400 regular, 500 medium, 600 semibold. **No bold (700)** except in rare emphasis.
- **Tracking:** Default; tightened (-0.01em) on display sizes 20 and 28.

## Spacing, radius, elevation

- **Spacing:** 4-step base. Padding inside a card: 12 (compact) / 16 (default) / 20 (spacious). Row height: 28 (compact) / 36 (default) / 44 (spacious).
- **Radius:** 4 (inputs, list rows), 6 (cards, popovers), 8 (modals), 12 (large surfaces). **No pill shapes** except for status pills.
- **Elevation:** Three levels, expressed as a 1 px border + a subtle, low-opacity background tint. **No drop shadows** in dark mode. Drop shadows are reserved for floating elements (popovers, menus, dialogs) — 24 px blur, 8% opacity, brand-tinted.

## Motion

- **Motion budget per event:** ≤250 ms in, ≤600 ms out. Easings: `cubic-bezier(0.2, 0, 0, 1)` (deceleration) in; `cubic-bezier(0.4, 0, 1, 1)` (acceleration) out.
- **Pulse.** 250 ms background tint from `bg/surface` to `bg/pulse` and back, with a 1 px border in `border/pulse`. **No scale, no glow, no rotation.**
- **Trail.** 2 px vertical bar in the right margin of a list, in `fg/pulse`, fades in 250 ms, holds until the next event on the same row, then fades out 600 ms.
- **No motion** for state changes that are not realtime. Status pill colour changes are instantaneous.

## Iconography

- **One icon family.** Single line-icon set, 16 px base, 1.5 px stroke, rounded caps and joins. Used everywhere — navigation, status pills, list rows, inspector headers.
- **No filled icons, no two-tone icons, no emoji.**
- Icons are tokens; they can be recoloured by token swap.

## Accessibility (built in, not a follow-on)

- Keyboard, contrast (AA min, AAA preferred), screen reader, focus order.
- Status colours tuned per mode to meet AA against that mode's canvas.
- Skeleton / loading state is announced to screen readers.
- A `Cmd/Ctrl-K` command palette is the discoverability layer for everything not on the keyboard map.

## What the design system forbids (UX PRD §3.9)

These are hard rules. Violations require a design-system amendment, not a per-screen override.

- **Bespoke styles per screen.** New screens use existing components or propose a new component to the inventory.
- **Colours, radii, spacings, or motion values that are not tokens.** Hard rule: no `#hex` literals in component code.
- **Two visual languages in the same app.** The chat surface and the operator console are the same design system.
- **AI-generated slop.** The aesthetic guardrail in decision log 2 is enforced by the design system: the pulse is subtle, the pills use status tokens, the icons are line and consistent, the typography is two families, the motion is bounded.

## Component inventory (the design system *is* this list)

The UX PRD enumerates the component inventory. New screens compose from
this list. Anything new goes through the inventory as a new component.

**Surface & layout.** AppShell, ThreeColumnLayout, StatusStrip, Drawer, Modal, Popover, Tooltip, HoverCard, Toast (mutating-action confirmation only), Dialog (confirm-with-consequence).

**Navigation.** NavRail, NavRailGroup, NavRailItem, NavRailFooter, CommandPalette, Breadcrumb.

**Lists & tables.** List, ListRow, ListRowMeta, Table, TableRow, EmptyState, LoadingSkeleton, ErrorState, AuditEntry.

**Chat.** ChatMessage, ChatMessageList, ChatInput, ChatComposer, EmbeddedArtifact, EmbeddedPlanCard, EmbeddedBidPanel, EmbeddedHITLInline, ChatDraftRecovery.

**Plan.** PlanGraph, PlanGraphNode, PlanGraphEdge, PlanStepList, PlanStepRow, StepDetail, BidCard, BidOverlay, AgentOutputStream, AgentOutputLine, ConfidenceBar, TrustScorePill.

**Memory.** MemoryList, MemoryListRow, MemoryDetail, MemoryFACT, MemorySCENE, MemoryGraph, MemoryCompareSideBySide, MemoryTagEditor, MemoryBlastRadius.

**Resource (Agent / Tool / Skill / MCP).** ResourceCard, ResourceHeader, ResourceManifest, ResourceSchemaView, ResourceInvocationList, MCPConnectionCard, MCPHealthBadge.

**Scope.** ScopeEditor, EffectiveScopeView, DefaultWriteTagsEditor, CallerScopeView, ScopeHistoryList, PromotionLog.

**Lifecycle / Watch / Verifier.** LifecycleDashboard, WatchConfigList, WatchConfigEditor, VerifierPoolCard, VerifierRoundList.

**Cost.** CostPanel, CircuitBreakerPill, PriceLedger, AcquireOutcomeList.

**Audit.** AuditList, AuditEntry, AuditDiff, AuditReasonField, AuditExport.

**Status / realtime.** StatusPanel, StatusPill, PulseHighlight, TrailMark, EventBacklogIndicator, ConnectionBadge.

**HITL.** HITLInline, HITLEditor, HITLDecisionBar.

**Form primitives.** Input, TextArea, Select, Combobox, Checkbox, Radio, Switch, Slider, NumberInput, DateRange, FileDrop, TagInput, VocabularyPicker.

**Feedback.** Toast (mutating-action confirmation only; never for reads), Dialog (confirm-with-consequence), Drawer, Popover, Tooltip, HoverCard.

**Configuration.** InstanceSwitcher, InstanceList, InstanceProfileEditor, RuntimeSettingsForm, UIControlPlaneSettings, DiffView, AuditEntry.
