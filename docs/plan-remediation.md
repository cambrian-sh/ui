# Cambrian UI — Remediation Plan

**Derived from:** Full codebase audit (all P1+P2 screens, IPC layer, store, Rust core, design system)
**Date:** 2026-07-07
**Status:** Ready for agent execution

---

## Phase 1 — Safety Net (3 tickets)

### T1.1: Add `ErrorBoundary` wrapping `<Outlet/>`

**Why:** Zero error boundaries in the codebase. Any render crash (e.g. malformed ISO from kernel, undefined field access) unmounts the entire route. The shared `ErrorState` component (`design-system/components/cambrian/error-state.tsx`) exists but is unused.

**What:**
- Create `src/components/ErrorBoundary.tsx` (class component with `getDerivedStateFromError` / `componentDidCatch`)
- On error, render `<ErrorState reason={error.message} whatToDo="Reload the window to re-hydrate from the core." />`
- Wrap `<Outlet />` in `Shell.tsx:102`
- Add a "Reload" button in the error state that calls `window.location.reload()`

**Acceptance:**
- Typecheck clean
- 1 test: throw in a child component → `ErrorState` renders

---

### T1.2: Extract + harden `formatRelativeTime` / `relativeTime`

**Why:** 4 copies of the same logic (3× `formatRelativeTime` in Lifecycle/Verifier/Cost, 1× `relativeTime` in `src/lib/relativeTime.ts`). None guard against `NaN`, `undefined`, future dates, or epoch=0. A kernel migration glitch renders `"NaNs ago"` literally in the UI.

**What:**
- Create `src/lib/format.ts` with a single `formatRelativeTime(iso: string | null | undefined): string`
- Guard: `if (!iso) return '—'; const then = new Date(iso).getTime(); if (!Number.isFinite(then)) return '—';`
- Handle future dates: `if (diff < 0) return 'just now';`
- Normalize capitalization: use lowercase `'just now'` everywhere
- Replace all 4 local copies with imports from `src/lib/format.ts`
- Delete the old local functions
- Add 10 unit tests: now, 1s, 59m, 1h, 23h, 1d, 30d, undefined, null, malformed, future, epoch=0

**Acceptance:**
- Typecheck clean
- All existing 80 tests still pass (updated for new import)
- 10 new unit tests pass
- Grep confirms `formatRelativeTime` exists only in `src/lib/format.ts`

---

### T1.3: Add selector API to `useStore`

**Why:** `useStore(projectionStore)` returns the entire store — every `kernel://state` event re-renders every subscribed component. The CONTEXT.md note "selectors on the consumer side use shallow equality to skip re-renders" is not implemented.

**What:**
- Add overload: `useStore<T, U>(store: StoreApi<T>, selector: (state: T) => U, equals?: (a: U, b: U) => boolean): U`
- Default equals to `Object.is` (strict equality), provide a `shallow` import from a tiny utility
- Update every screen to use selectors — example:
  ```ts
  const role = useStore(projectionStore, s => s.state?.role ?? null);
  const lifecycle = useStore(projectionStore, s => s.state?.lifecycle);
  ```
- Do NOT change behavior — just replace `const projection = useStore(projectionStore); const role = projection.state?.role ?? null;` with the selector form

**Acceptance:**
- Typecheck clean
- All 80 tests pass
- No visual regression (same render output, just fewer re-renders)

---

## Phase 2 — Mutation Integrity (5 tickets)

### T2.1: Wire ChatSurface role gate

**Why:** A Viewer can type and click Send — the draft is cleared, the kernel rejects, the user sees their text vanish with zero feedback. Violates "reflect role + capabilities from the core: hide/disable mutating controls for Viewers."

**What:**
- Read `role` from `projectionStore` (using selector from T1.3)
- If `role !== 'operator'`, disable `ChatInput` and `InjectInput` AND show "Operator role required" footer (same pattern as `LifecycleConsole.tsx:180-187`)
- Replace hardcoded reasons `'chat-send'` and `'mid-plan-inject'` with a small inline reason input (optional for chat — the kernel accepts "chat-send" as audit trail; mandatory for inject)

**Acceptance:**
- 1 test: Viewer sees disabled inputs + "Operator role required" message
- 1 test: Operator can still send/inject

---

### T2.2: Build `useMutation` hook with error feedback

**Why:** Every mutation in the codebase is fire-and-forget. No toast, no banner, no error state. The shared `ErrorState` component exists but mutations never render it.

**What:**
- Create `src/lib/useMutation.ts`
- Signature: `useMutation((...args) => Promise<T>)` returns `{ mutate, isLoading, error, resetError }`
- On rejection, set `error` state
- Each consumer renders a local `<ErrorState>` / banner near the button on error
- Port `SessionDetail.handleMutation` first, then `LifecycleConsole.handleTriggerConsolidation`

**Acceptance:**
- Typecheck clean
- 3 unit tests: success path (error=nil), failure path (error set), resetError clears

---

### T2.3: Wire SessionDetail error handling through `useMutation`

**Why:** `handleMutation` has no try/catch. `ConfirmMutationDialog` has try/finally but no catch — on rejection the dialog stays open with stale state and the user has no idea why. Also lift `submitting` state to prevent double-click on parent buttons.

**What:**
- Wrap `ipc.pauseSession`/`resumeSession`/`completeSession` in `useMutation`
- On error, show `<ErrorState>` banner inside the Actions card
- On success, close dialog, clear pending
- Lift `isSubmitting` to `SessionDetail` — disable parent buttons while mutation is in flight
- Keep the `ConfirmMutationDialog` pattern (reason is mandatory, dialog confirms)

**Acceptance:**
- 2 tests: mutation resolves → dialog closes, button re-enables
- 1 test: mutation rejects → error banner appears, dialog stays, button re-enables
- 1 test: parent button disabled during mutation

---

### T2.4: Fix `triggerConsolidation` handler

**Why:** Uses `window.confirm` + `alert` (native dialogs, unstyled, blocks renderer). Hardcoded audit reason `'Manual trigger from UI'`. Double-click race can fire two distinct `command_id`s.

**What:**
- Replace `window.confirm` with a custom `<ConfirmDialog>` (use existing `Dialog` primitive from design system)
- Dialog collects a user-supplied `reason` (mandatory — disable confirm button when empty)
- Replace `alert` with `<ErrorState>` banner rendered inline
- Use `useRef<boolean>(false)` as a synchronous guard against double-clicks (set before first `await`, reset in `finally`)
- Surface success via the mutation hook (`CommandAck{deduped}` → brief success message)
- Hide the entire Actions card when `!isOperator` (not just disable)

**Acceptance:**
- 2 tests: confirm dialog opens with reason field, confirm calls IPC with user reason
- 1 test: cancel path (dialog closes, no IPC call)
- 1 test: IPC rejects → error banner appears, button re-enables
- 1 test: Viewer → Actions card not rendered

---

### T2.5: Fix `MemoryDetail` reason handling + `PlanWorkSurface` default reason

**Why:** `MemoryDetail` silently substitutes empty reason with `'tag from memory explorer'` — audit log useless. Promote/Supersede have no reason input at all. `PlanWorkSurface` defaults to `'pause from work surface'` — same problem.

**What:**
- `MemoryDetail`: Remove `|| '...'` fallback. Disable Confirm button when reason is empty/whitespace.
- `MemoryDetail`: Add reason input for Promote/Supersede (open ConfirmMutationDialog pattern)
- `PlanWorkSurface`: Remove default string. Disable Pause/Resume buttons when reason is empty. Change placeholder to "Reason (required)".

**Acceptance:**
- 2 tests: empty reason → confirm button disabled
- 1 test: PlanWorkSurface pause/resume buttons disabled when reason is empty

---

## Phase 3 — Unwired Actions (4 tickets)

### T3.1: Wire ToolDetail + SkillDetail Actions tab

**Why:** The Actions tab has disabled buttons with NO `onClick`. `ipc.setToolGrant` exists in `client.ts` but is never called from these screens. PRD-19: "grant or revoke a tool for an agent and see the blast radius before I commit."

**What:**
- Add `onClick` to "Adjust grants" button → opens `ConfirmMutationDialog` with mandatory reason
- On confirm: call `ipc.getBlastRadiusPreview({ kind: 'set_tool_grant', tool_name, agent_id, granted })` and render the result
- After preview acknowledged: call `ipc.setToolGrant({ tool_name, agent_id, granted, reason })`
- Show a per-agent grant/revoke toggle (read `ToolDetail.granted_agents: string[]`)
- Wire `useMutation` for error handling
- Hide Actions card when `!isOperator`

**Acceptance:**
- 2 tests: confirm+reason flow, blast-radius preview is shown
- 1 test: Viewer → Actions card hidden

---

### T3.2: Wire MCPDetail Actions tab

**Why:** Same pattern as T3.1. "Register MCP server" button is decorative.

**What:**
- Add `onClick` → ConfirmMutationDialog with mandatory reason
- On confirm: call `ipc.blastRadiusPreview` (if applicable for MCP registration), then the appropriate mutation
- Use `ipc.registerMCP` if exists in the contract, or wire whatever the kernel expects
- Hide when `!isOperator`

**Acceptance:**
- Same test pattern as T3.1

---

### T3.3: Wire ScopeDetail Actions tab

**Why:** "Adjust scope" and "Adjust write tags" buttons are decorative. PRD-20: "adjust scope and see the blast radius before I commit."

**What:**
- Same confirm+reason+blast-radius+mutate pattern as T3.1
- Use `ipc.setScope` or equivalent IPC method
- Hide when `!isOperator`

**Acceptance:**
- Same test pattern as T3.1

---

### T3.4: Implement HITL resolution UI

**Why:** `resolveHITL` IPC exists in `client.ts:44-45`. `HITLInline` component exists in the design system and is referenced from `BlockRenderer`. But `ChatSurface` never produces `hitl_inline` blocks — HITL events are invisible. This is the most security-critical mutation path.

**What:**
- Read `state.pending_hitl` or look for HITL events in the projection
- Inject `hitl_inline` blocks into `ChatSurface.blocks` when the active session has a pending HITL
- Wire `onApprove`/`onReject` → `ipc.resolveHITL({ intervention_id, resolution, reason })` with mandatory reason (≥16 chars per `HITLInline.REASON_MIN`)
- Render the existing `<HITLInline>` component with real handlers
- Use `useMutation` for error handling

**Acceptance:**
- 2 tests: HITL block renders in chat, approve calls resolveHITL with reason
- 1 test: reject calls resolveHITL with reason

---

## Phase 4 — Test Hardening (2 tickets)

### T4.1: Add Viewer-role + mutation-failure + stale-state tests

**Why:** All 80 tests hardcode `role: 'operator'`. NONE test mutation failure paths. NONE test Viewer rendering. NONE test stale state after mutation. A regression that drops a role gate passes CI.

**What:**
- Add `makeState(..., { role: 'viewer' })` variant
- Add to each screen test:
  - 1 test: Viewer sees disabled controls + "Operator role required" message (where applicable)
  - 1 test: Viewer sees hidden Actions card (where applicable)
- Add to mutating screen tests:
  - 1 test: mutation rejects → error state appears
  - 1 test: mutation succeeds → UI updates from folded state
- Add empty/null field safety tests (missing `agent_mix`, undefined `merit_score`, null `cost`)

**Acceptance:**
- Typecheck clean
- ≥20 new tests pass

---

### T4.2: Add a11y tests on P2 screens

**Why:** `toHaveNoViolations` from `vitest-axe` is registered in `setup.ts` but never used in P2 tests.

**What:**
- Add `it('has no a11y violations', async () => { ... })` to each P2 test file
- Fix any violations found (likely: color-contrast, missing labels, empty buttons)

**Acceptance:**
- All a11y tests pass with 0 violations

---

## Phase 5 — Polish (3 tickets)

### T5.1: Strip remaining comments from P1 files

**Why:** Constraint is "No comments (caveman rules)". P2 was cleaned in the prior session. P1 still has 45 `/*` comment blocks.

**What:**
- Strip `/* ... */` block comments from all P1 source files (NOT auto-generated files, NOT `routeTree.gen.ts`, NOT `vitest-axe.d.ts`, NOT `setup.ts` workaround)
- Do NOT strip comments from test files (test comments are acceptable per convention)

**Files to clean:**
- `src/screens/sessions/*.tsx` (not `.test.tsx`)
- `src/screens/plans/*.tsx`
- `src/screens/agents/*.tsx`
- `src/screens/tools/*.tsx`
- `src/screens/mcp/*.tsx`
- `src/screens/scope/*.tsx`
- `src/screens/chat/*.tsx`
- `src/screens/memory/*.tsx`
- `src/screens/plan/*.tsx`
- `src/screens/palette/*.tsx`
- `src/screens/settings/*.tsx`
- `src/components/*.tsx`
- `src/ipc/*.ts` (not `.test.ts`)
- `src/store/*.ts`
- `src/design-system/**/*.tsx`
- `src/design-system/**/*.ts`
- `src/routes/*.tsx` (excluding `__root.tsx`, `routeTree.gen.ts`)
- `src/router.tsx`
- `src/lib/*.ts`

**Acceptance:**
- Typecheck clean
- All 80 tests pass
- Grep `^\s*/\*` in `src/**/*.{ts,tsx}` excluding test files, auto-generated files returns 0

---

### T5.2: Fix stale `?focus=` URL param + add `replace: true`

**Why:** When a focused entity is removed from the projection, the URL still carries `?focus=ghost-id`. Navigating with `replace: true` prevents back-button spam.

**What:**
- In every list+detail console, when the focused ID is no longer in the list, navigate with `replace: true` to clear `focus`
- Change all row-click navigation from `navigate({ to, search: { focus: id } })` to `navigate({ to, search: { focus: id }, replace: true })`

**Acceptance:**
- 1 test per console: focus param is scrubbed when entity is removed

---

### T5.3: Wire remaining MEDIUM/LOW items from audit

**What:**
- `relativeTime` NaN guard (same as T1.2, ensure it covers `src/lib/relativeTime.ts`)
- `CircuitBreakerPill` unknown-state fallback (treat as "unknown" with neutral gray pill, not green "ok")
- `formatUSD` / `formatDuration` NaN/Infinity guards
- Verifier/Cost loading state (unify with Lifecycle `isHydrating` check)
- Cost array-index keys → content-based keys
- `MCPConnectionPill` unknown-state fallback
- `ConfirmMutationDialog` reason maxLength=1024
- `aria-current="true"` on selected list rows
- `EmptyState` "clear filters" action button when results are filtered out

**Acceptance:**
- Typecheck clean
- All tests pass
- No `NaN`/`Infinity`/`undefined` in rendered output for P2 screens
