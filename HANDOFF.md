# Cambrian Web UI — Handoff (2026-07-03)

> **Audience.** A fresh agent (or human) picking up the Web UI repo with no prior context. Read this file first, then `CONTEXT.md`, then the layer `CONTEXT.md`s.
>
> **Author.** The previous agent (Sisyphus / Minimax-M3). The work in scope: UI-IMPL-01…20, plus the AGPL-3.0 license, the 42-file docs migration, and the repo split.

---

## 1. What this repo is

**Location:** `~/Code/cambrian/ui/` — a separate repo (NOT a subtree of `cambrian-runtime`).
**What it is:** A **Tauri 2** desktop app: Rust core (`src-tauri/`, gRPC client to the Cambrian runtime-core) + React 19 / TypeScript / Vite / Bun webview (`src/`).
**Kernel counterpart:** `~/Code/cambrian-runtime/` — the Go agent runtime. The UI talks to it via gRPC through the Rust core. **Never import from cambrian-runtime. The boundary is the `proto/operator.proto` contract at version `0047`.**

**Split history (read this to understand why the repo exists):**
- Originally `cambrian-runtime` was a monorepo containing the kernel + a Tauri UI.
- The UI was extracted into its own repo at `~/Code/cambrian/ui/` on **2026-07-02** (commit `7d046f2` "initial commit" of the new repo; commit `67e2c35` "Move all UI-related non-code docs from cambrian-runtime" on **2026-07-03**).
- The corresponding removal commits in `cambrian-runtime` are `e8adc92b` (docs removal) and earlier `feature/ui` branch work.
- **Git history was NOT transferred.** The UI repo started fresh; the `cambrian-runtime` history of UI work is on the `feature/ui` branch in the old repo if needed.

---

## 2. License

**AGPL-3.0** (full text at `LICENSE`). The kernel is **Elastic License 2.0**. The divergence is deliberate and meaningful:
- Kernel = source-available, restricts commercial use.
- UI = fully copyleft, including the AGPL §13 network-use clause (anyone hosting the UI as a network service must provide source).
- Anyone embedding both repos gets the union of obligations.

Copyright: 2026, Doruk Eray and Hakan Afşin (matches kernel `MAINTAINERS.md`).

---

## 3. Architecture in one paragraph

Two hops, three layers:
```
Go kernel ──gRPC/HTTP2 (tonic, ONE conn)──> Rust core (src-tauri) ──Tauri IPC──> Webview (src)
 [runtime-core]      [the transport client]      [state of record]        [a projection/cache]
```

- **Rust core = state of record.** Holds the gRPC client, folds the `StreamEvents` feed into typed state, handles auth + recovery + reconnect. Exposes Tauri commands and events to the webview.
- **Webview = projection.** Zustand store hydrated from Tauri events. Screens consume the store; they never speak gRPC and never open sockets.
- **Vendored contract = `proto/operator.proto`** (pinned to `0047`). Re-vendor from kernel `api/proto/operator.proto` when the contract bumps.

Full detail in `CONTEXT.md`, `src-tauri/CONTEXT.md`, `src/CONTEXT.md`.

---

## 4. Where things live (canonical map)

| Path | Role |
|---|---|
| `CONTEXT.md` | Project source of truth. Read first. |
| `src-tauri/` | Rust core: gRPC client, feed-fold, auth, recovery, Tauri bridge. Detail in `src-tauri/CONTEXT.md`. |
| `src-tauri/src/lib.rs` | Tauri command surface (9 `op_*` commands). One TODO marker: `op_complete_session` is stubbed; wire to kernel in next proto bump. |
| `src-tauri/proto/` | Vendored `operator.proto` (pinned to `0047`). DO NOT EDIT. |
| `src/` | Webview (React 19 + TS + Vite + Bun). Detail in `src/CONTEXT.md`. |
| `src/ipc/` | Tauri IPC client + mock. `client.ts` for prod, `mock.ts` for tests. Same shape. |
| `src/ipc/types.ts` | The IPC contract (mirrors kernel ADR-0047). |
| `src/store/` | `projection.ts` (Zustand vanilla store, hydrate/fold/reset), `shell.ts` (panel widths, theme, density), `useStore.ts` (React hook). |
| `src/design-system/` | The custom shadcn/ui + Cambrian components. Tokens, primitives, Cambrian-specific (nav-rail, status-strip, plan-card, etc.). |
| `src/components/Shell.tsx` | The 3-column shell: nav-rail (left) + route outlet (centre) + right inspector (always renders `PlanWorkSurface`). |
| `src/routes/` | File-based TanStack Router. 14 routes (1 root + 13 console surfaces). Auto-generated route tree in `routeTree.gen.ts`. |
| `src/screens/` | One folder per PRD surface. Each folder has the main component(s) + tests. |
| `src/lib/` | Shared utilities: `relativeTime`, `keyboard`, `useFocusedPlan`, `env`. |
| `docs/` | All UI spec: 7 thematic PRDs, 17 ADRs, tech doc, requirements, design session. See `docs/README.md`. |
| `docs/README.md` | Documentation index — start here for the spec. |
| `docs/prd/01-foundation.md` | **Read first** among PRDs: the design system, token taxonomy, keyboard map, state vocabulary. |
| `docs/tech/web-ui-tech-doc.md` | The implementation contract. §12 has the ticket breakdown (UI-IMPL-01…37). |
| `proto/operator.proto` | Vendored contract at version `0047`. |

---

## 5. Build & verify (the four commands)

```bash
cd ~/Code/cambrian/ui
bun install                                    # one-time, ~2s
bun run typecheck                              # tsc --noEmit, must be 0 errors
bunx vitest run                                # 29/29 tests, ~2.5s
bun run build                                  # vite build, must stay under 200 kB gzip main
```

Tauri build (full desktop binary):
```bash
cd ~/Code/cambrian/ui
bun run tauri dev                              # dev mode
bun run tauri build                            # release binary
```

Tauri build prerequisites: `protoc` with Google well-known types (vendored via `protoc-bin-vendored = "3"` in `src-tauri/Cargo.toml`); `build.rs` sets `PROTOC` env var to the vendored path. Already configured.

**Performance budget:** main JS bundle < 200 kB gzip. Current: **145.11 kB gzip**. Plans chunk (code-split, lazy): **2.41 kB gzip**.

---

## 6. Implementation status (as of 2026-07-03)

| Range | Status |
|---|---|
| UI-IMPL-01…18 | **Done.** Vertical slice (demo path end-to-end). |
| UI-IMPL-19 (Console Sessions, PRD-06 §4) | **Done.** 12/12 tests. |
| UI-IMPL-20 (Console Plans in Flight, PRD-06 §5) | **Done.** 8 plans tests + 5 plan-filters tests + 4 useFocusedPlan tests = 17 new tests; 29/29 total. |
| UI-IMPL-21…24 (P1 subsystems read — Agents, Tools & Skills, MCP, Scope) | **Next.** Read-only. |
| UI-IMPL-25…28 (P2 subsystems read+mutate — Watch, Lifecycle, Verifier, Cost) | After P1. |
| UI-IMPL-29 | **Kernel-side.** Add `op_blast_radius_preview` Tauri command + gRPC method to proto. Blocks P3. |
| UI-IMPL-31…35 (P3 Memory Explorer — compare, graph, bulk) | After P2. |
| UI-IMPL-36…37 (P4 Audit & export — mutations, CSV/JSON) | After P3. |

Full ticket breakdown: `docs/tech/web-ui-tech-doc.md` §12.

---

## 7. Key conventions (must follow)

From the project `AGENTS.md` and `CLAUDE.md`:
- **Step by step, ask the user for sign-off between tickets.** Don't auto-chain.
- **No comments unless the design intent is non-obvious.** Section headers like `/* === Component: Card === */` are fine; explanatory paragraphs are not.
- **No `#hex` literals in component code.** Use semantic tokens (`--accent-bg`, `--fg-primary`, etc.).
- **No comments that restate the code.** The code IS the documentation.
- **Use the design-system components.** Never write raw `<button>`, `<input>`, etc. Import from `@/design-system/components`.
- **Use semantic tokens, never literal values.** `bg-[var(--bg-canvas)]`, not `bg-[#0a0a0a]`.
- **No `as any`, `@ts-ignore`, `@ts-expect-error`.** Fix the types.
- **No empty catch blocks.** No swallowing errors.
- **Don't expand scope beyond what was asked.** If something seems off, raise it; don't silently "fix" it.
- **After any refactor/implementation, update `CONTEXT.md` and `CURRENT_CODEBASE_STATE.md`.**

From the kernel `AGENTS.md` (inherited):
- **Zero-Hardcode Rule.** Routing logic must never appear as Go `if-else`/`switch`; it belongs in the LLM (Awareness) layer. **For the UI**, the parallel rule is: don't hardcode business logic in component code; derive from the projection store + URL state.
- **Hexagonal separation.** `internal/` tree in the kernel. **For the UI**, the parallel rule: the webview never speaks gRPC; the Rust core never renders UI. The boundary is `src/ipc/`.
- **Kernel vocabulary, verbatim.** Use the terms from `CONTEXT.md` §7 (Substrate, Handoff, ExecutionPlan, Step, Planner, Gatekeeper, Auctioneer, Verifier, etc.). Don't invent synonyms.

---

## 8. Test patterns (proven, copy these)

### 8.1 Projection store tests
```ts
import { projectionStore } from '@/store/projection';
projectionStore.getState().reset();
projectionStore.getState().hydrate(makeState([]));
```

### 8.2 Router hook tests (TanStack Router has no MemoryRouter; RouterProvider doesn't take children)
```ts
const searchState: { focus: string | undefined } = { focus: undefined };
const navigateMock = vi.fn((opts: { search?: { focus?: string } }) => {
  if (opts.search?.focus !== undefined) searchState.focus = opts.search.focus;
});
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
}));
```

### 8.3 react-hotkeys-hook test (the library respects `enabled` at runtime)
```ts
type HotkeyHandler = (e: { key: string; preventDefault: () => void }) => void;
let capturedHandler: HotkeyHandler | null = null;
let capturedEnabled: boolean | null = null;
vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: (_keys: string, handler: HotkeyHandler, options?: { enabled?: boolean }) => {
    capturedHandler = (e) => { if (options?.enabled === false) return; handler(e); };
    capturedEnabled = options?.enabled ?? true;
  },
}));
```

### 8.4 Seed the mock IPC for integration tests
The mock IPC is a drop-in replacement for the real client. Use `@/ipc/mock`'s `__seed`, `__addPlan`, `__addSession`, `__addAuditEntry` helpers to set up state.

### 8.5 `navigate` to a route with required search params
Some routes have `validateSearch` with required fields. Pass `search` explicitly:
```ts
navigate({ to: '/sessions', search: { focus: undefined } })
```

---

## 9. Known gotchas

1. **`react-hotkeys-hook` v5 API.** The option is `enableOnFormTags` (not `enableOnFormFields` like v3). The type `OptionsOrDependencyArray = Options | DependencyList` means you can't reliably pass a deps array as a 4th arg — just drop it, the hook re-binds on every render.

2. **`useSearch` works outside the route component.** It's available anywhere in the router context, including the Shell (which is outside the outlet). This is how `PlanWorkSurface` (Shell-mounted) can read `?focus=plan_id`.

3. **The right inspector is always `PlanWorkSurface`.** When on `/plans?focus=plan_x`, the Shell's right inspector shows that plan. When on `/sessions`, it shows `plans[0]`. Don't try to render a second `PlanWorkSurface` inside a route — just use the Shell's.

4. **TanStack Router `Link`/`navigate` requires explicit `search`** when the target route has `validateSearch`. Don't use `asChild` on Button with `Link` — just use `navigate` in an `onClick`.

5. **`@xyflow/react` (React Flow) is lazy-loaded.** It's 275 kB raw / 90 kB gzip. Only loaded when the user opens the DAG view in a plan's work surface. Don't import it eagerly.

6. **`dagre` is the graph layout library.** Used in `PlanGraph.tsx` for the DAG layout. Deterministic and stable.

7. **The projection store is a vanilla Zustand store.** Subscribe via `useStore(store)` from `src/store/useStore.ts` (uses `useSyncExternalStore`). Don't use the `zustand` React hooks — they're not wired in.

8. **The mock IPC is the test IPC.** Tests import from `@/ipc/mock`, not `@/ipc`. The mock has the same shape as the real client.

9. **The nav-rail has 13 entries (11 console + Audit + Settings).** The order is fixed: Sessions, Plans in Flight, Agents, Tools & Skills, MCP, Memory, Scope, Watch, Lifecycle, Verifier, Cost, Audit, Settings.

10. **The `g p` shortcut is "Go to Plans in Flight."** The `1`…`9` hotkey for plans only fires when the plans list has focus (per PRD-01 §9, refined by the user).

---

## 10. What's next (concrete next steps)

If the user resumes with "continue":
1. **UI-IMPL-21 — Console Agents (PRD-06 §6).** Read-only list + detail. Same pattern as Sessions: filter bar + list + right inspector (uses `useFocusedPlan` if we want to show an agent's recent plans, or a new `useFocusedAgent` hook).
2. **Ask the user for sign-off** between each ticket. Don't auto-chain.

If the user wants a different direction:
- **Polish / a11y pass** (PRD-06 §17, PRD-01 §8) — the vertical slice has a11y, but a full screen-reader + AAA contrast pass is P6 in the build order.
- **Memory explorer compare + graph** (PRD-05 §6, §8) — P3, depends on the blast-radius kernel command (UI-IMPL-29).
- **Tauri release build** — `bun run tauri build` for a production binary. The dev mode works; release needs the protoc fix to be tested on a clean machine.

---

## 11. Files added or modified in this handoff window

**Added (UI-IMPL-20 + cleanup):**
- `src/screens/plans/PlanStatePill.tsx`
- `src/screens/plans/PlanFilters.tsx`
- `src/screens/plans/PlanListRow.tsx`
- `src/screens/plans/PlansInFlight.tsx`
- `src/screens/plans/plan-filters.test.tsx`
- `src/screens/plans/plans.test.tsx`
- `src/lib/useFocusedPlan.ts`
- `src/lib/useFocusedPlan.test.ts`
- `LICENSE` (AGPL-3.0)
- `HANDOFF.md` (this file)

**Modified:**
- `src/routes/plans.tsx` (replaced placeholder; added `validateSearch: focus`)
- `src/screens/plan/PlanWorkSurface.tsx` (uses `useFocusedPlan` instead of `plans[0]`)
- `CONTEXT.md` (Implementation Status table updated)

**Untracked (not committed yet, user manages git):**
- `LICENSE`
- All new files in `src/screens/plans/` and `src/lib/`
- Modified `CONTEXT.md`, `src/routes/plans.tsx`, `src/screens/plan/PlanWorkSurface.tsx`

**User commits** — the git history is user-managed. Don't auto-commit.

---

## 12. Open paperwork (not blocking, but worth knowing)

These are the 8 todos from `docs/ui-session/10-final-todos.md` that were deferred when the user picked "Only thematic PRDs + ADRs" as the scope. The most consequential for the next session:

1. **Update `CONTEXT.md` and `CURRENT_CODEBASE_STATE.md`** after every implementation. (This handoff updates `CONTEXT.md`; `CURRENT_CODEBASE_STATE.md` doesn't exist yet — create it when the project hits its first release.)

2. **Verify the on-disk UX PRD** for the three known drifts from `docs/prd/README.md` §9:
   - The "theme density" shortcut ambiguity (PRD-01 §9 says `t` cycles theme; session had mid-edit on "theme density")
   - The "P6 light mode (if V1)" qualifier (locked decision is "light mode is V1", so the qualifier is gone)
   - The settings V1 scope cut (free-form JSON editor is out)

3. **The "ready to develop" checklist** — the 10 questions for the technical document, per parent UX PRD §14. Mostly answered now by the tech doc itself, but worth a pass.

4. **UX PRD edits** — the parent UX PRD has 11 locked decisions (LD-1…LD-11). Verify each is reflected in the thematic PRDs and the tech doc.

5. **Update the parent product PRD** — the canonical `web-ui-prd.md` is at `docs/prd/web-ui-prd.md` (moved from `cambrian-runtime` on 2026-07-03). The README note about the duplicate at `docs/web-ui-prd.md` was resolved by deleting the duplicate.

6. **Author an index** — `docs/README.md` exists (created in this handoff window). Good.

7. **Lock-in summary** — not needed; the PRDs and ADRs are already Frozen v1.0 / Accepted.

---

## 13. One more thing: the two repos' relationship

The UI repo is `~/Code/cambrian/ui/`. The kernel repo is `~/Code/cambrian-runtime/`. They share:

1. **The contract.** `proto/operator.proto` is vendored into the UI at `~/Code/cambrian/ui/proto/operator.proto` (and also at `src-tauri/proto/`). When the kernel bumps the contract, the UI must re-vendor. Use the `make proto` / `make proto-breaking` workflow in the kernel repo.

2. **The terminology.** Substrate, Handoff, ExecutionPlan, etc. — all from kernel `CONTEXT.md` §7. The UI uses these verbatim.

3. **Nothing else.** No shared code, no shared package, no shared CI. The repos are independent. If you need to look at the kernel, read it in `~/Code/cambrian-runtime/` — don't import from it.

The kernel's `cambrian-cli/` is a separate repo (`~/Code/cambrian/cli/`) and is NOT related to the UI repo. Different scope: CLI vs. desktop GUI.
