# Cambrian Web UI — Thematic PRDs

This directory decomposes the parent UX PRD ([`../../prd/web-ui-ux-prd.md`](../../prd/web-ui-ux-prd.md)) into **7 thematic PRDs**, each scoped to a coherent UI area, with **17 companion ADRs** (Nygard format, `UI-NNN` numbering) recording the engineering decisions that fall out of the open questions. The split is normative: every screen and component the implementation phase will build traces to one of the 7 PRDs, and every engineering decision traces to one of the 17 ADRs.

**Status as of this index:** All 7 PRDs are **Frozen v1.0** and all 17 ADRs are **Accepted** (Nygard). The lock-in pass is complete (2026-06-22). The status transitions used were: PRDs Draft → Final → Frozen; ADRs Proposed → Accepted (Nygard standard). Two ADRs were amended during the lock-in: **UI-001 v0.2** (Tailwind v4 + shadcn/ui component library, supersedes the original vanilla-extract recommendation) and **UI-009 v0.2** (localStorage, supersedes the original tauri-plugin-store recommendation). The changes are reflected in the table below.

---

## 1. The 7 PRDs

| # | File | Title | Inherited decisions | Status |
|:--|:-----|:------|:--------------------|:-------|
| 01 | [01-foundation.md](01-foundation.md) | Foundation: Design System, Density, Theme, A11y, Realtime Grammar | LD-2, LD-3, LD-7 (re-stated in full); EC-1…EC-5; sub-decisions (light mode V1, theme-as-token, nav-rail footer, plan view two places, settings scope cut) | **Frozen v1.0** |
| 02 | [02-shell-and-layout.md](02-shell-and-layout.md) | Shell & Layout | LD-1, LD-8, LD-11; EC-1…EC-5 | **Frozen v1.0** |
| 03 | [03-chat-surface.md](03-chat-surface.md) | Chat Surface | LD-6, LD-10, Linear-convention sub-decision; EC-1…EC-5 | **Frozen v1.0** |
| 04 | [04-plan-work-surface.md](04-plan-work-surface.md) | Plan Work Surface | LD-4, LD-6, LD-10; EC-1…EC-5 | **Frozen v1.0** |
| 05 | [05-memory-explorer.md](05-memory-explorer.md) | Memory Explorer | LD-5, LD-8, LD-11; EC-1…EC-5 | **Frozen v1.0** |
| 06 | [06-operator-console.md](06-operator-console.md) | Operator Console | LD-1, LD-8, LD-11, V1 settings scope cut; EC-1…EC-5 | **Frozen v1.0** |
| 07 | [07-configuration-and-audit.md](07-configuration-and-audit.md) | Configuration & Audit | LD-1, LD-8, LD-11, V1 settings scope cut; EC-1…EC-5 | **Frozen v1.0** |

**Locked decisions are cited by number (`LD-N`) in each PRD.** PRD-01 re-states LD-2, LD-3, LD-7 in full (the rule for self-containment); PRDs 02–07 cite by number. The decision numbers are the same as the parent UX PRD's `web-ui-ux-prd.md` §2 (LD-1…LD-11).

**Engineering constraints (`EC-1`…`EC-5`)** are inherited from `ui/CONTEXT.md` and re-stated in PRD-01 §2.5 in full. PRDs 02–07 cite by number.

---

## 2. The 17 ADRs

| # | File | Title | Parent PRD | Status |
|:--|:-----|:------|:------------|:-------|
| UI-001 | [../adr/UI-001-design-system-tooling.md](../adr/UI-001-design-system-tooling.md) | Design System Tooling (Tailwind v4 + shadcn/ui component library) — v0.2 | PRD-01 | **Accepted** |
| UI-002 | [../adr/UI-002-i18n-externalization.md](../adr/UI-002-i18n-externalization.md) | i18n Externalization (Lingui) | PRD-01 | **Accepted** |
| UI-003 | [../adr/UI-003-router.md](../adr/UI-003-router.md) | Router (TanStack Router) | PRD-02 | **Accepted** |
| UI-004 | [../adr/UI-004-state-management.md](../adr/UI-004-state-management.md) | State Management (Zustand + TanStack Query) | PRD-02 | **Accepted** |
| UI-005 | [../adr/UI-005-realtime-sync.md](../adr/UI-005-realtime-sync.md) | Realtime Sync Strategy (replace-on-event) | PRD-02 | **Accepted** |
| UI-006 | [../adr/UI-006-motion-library.md](../adr/UI-006-motion-library.md) | Motion Library (CSS-only) | PRD-02 | **Accepted** |
| UI-007 | [../adr/UI-007-keyboard-library.md](../adr/UI-007-keyboard-library.md) | Keyboard Library (react-hotkeys-hook) | PRD-02 | **Accepted** |
| UI-008 | [../adr/UI-008-test-stack.md](../adr/UI-008-test-stack.md) | Test Stack (Vitest + Playwright + axe) | PRD-02 | **Accepted** |
| UI-009 | [../adr/UI-009-chat-draft-persistence.md](../adr/UI-009-chat-draft-persistence.md) | Chat Draft Persistence (localStorage) — v0.2 | PRD-03 | **Accepted** |
| UI-010 | [../adr/UI-010-embedded-artifact-contract.md](../adr/UI-010-embedded-artifact-contract.md) | Embedded Artifact Contract (TS union + Zod) | PRD-03 | **Accepted** |
| UI-011 | [../adr/UI-011-plan-graph-layout.md](../adr/UI-011-plan-graph-layout.md) | Plan Graph Layout Library (React Flow + elkjs) | PRD-04 | **Accepted** |
| UI-012 | [../adr/UI-012-memory-graph-viz.md](../adr/UI-012-memory-graph-viz.md) | Memory Graph Visualisation (React Flow) | PRD-05 | **Accepted** |
| UI-013 | [../adr/UI-013-blast-radius-computation.md](../adr/UI-013-blast-radius-computation.md) | Blast-Radius Computation Seam (kernel-driven via Tauri command) | PRD-05 | **Accepted** |
| UI-014 | [../adr/UI-014-cost-panel.md](../adr/UI-014-cost-panel.md) | Cost Panel vs Metrics Explorer (lightweight + link-out + CSS-only Sparkline) | PRD-06 | **Accepted** |
| UI-015 | [../adr/UI-015-config-schema.md](../adr/UI-015-config-schema.md) | Config Schema Contract (JSON Schema + TS codegen) | PRD-07 | **Accepted** |
| UI-016 | [../adr/UI-016-audit-export-format.md](../adr/UI-016-audit-export-format.md) | Audit Export Format (CSV + JSON, streamed) | PRD-07 | **Accepted** |
| UI-017 | [../adr/UI-017-auth-provider.md](../adr/UI-017-auth-provider.md) | Auth Provider (Operator + Viewer; extensible) | PRD-07 | **Accepted** |

**Note on status terminology:** PRDs use **Draft → Final → Frozen**. ADRs use the Nygard standard **Proposed → Accepted → Rejected → Superseded → Deprecated**. The two lifecycles are independent; the V1 freeze pass moves each artefact to its terminal state on operator sign-off.

---

## 3. Locked-decision → PRD traceability matrix

The 11 locked decisions from the parent UX PRD (`web-ui-ux-prd.md` §2) and where each is consumed:

| LD | Title | Re-stated in | Cited in |
|:---|:------|:-------------|:---------|
| LD-1 | Shell shape | — | PRD-02 §2, PRD-06 §2, PRD-07 §2 |
| LD-2 | Realtime visual grammar | **PRD-01 §2.1** (full) | PRD-01 §3, §4.4, §7; PRD-02 §7; PRD-03 §2, §13; PRD-04 §2, §13; PRD-05 §2, §12; PRD-06 §2, §17 |
| LD-3 | Density and theme | **PRD-01 §2.2** (full) | PRD-01 §3, §4.1, §4.3; PRD-02 §3.2, §4.7; PRD-03 §2; PRD-07 §3.1 |
| LD-4 | Plan view (DAG-as-graph + step-list) | — | PRD-04 §2, §3, §3.1, §4, §5 |
| LD-5 | Memory explorer | — | PRD-05 §2, §3, §8 |
| LD-6 | Chat surface composition | — | PRD-03 §2; PRD-04 §2, §3, §10; PRD-07 §2 |
| LD-7 | Design system | **PRD-01 §2.3** (full) | PRD-01 §3–§11; PRD-02 §3.2; PRD-03 §2; PRD-04 §2; PRD-05 §2; PRD-06 §2; PRD-07 §2 |
| LD-8 | States (empty / loading / error / success / audit) | — | PRD-01 §10; PRD-02 §2, §6.2, §5.1; PRD-03 §13; PRD-04 §11; PRD-05 §13; PRD-06 §2, §18; PRD-07 §2, §12 |
| LD-9 | Keyboard (17 V1 shortcuts) | — | PRD-01 §9; PRD-02 §8; PRD-03 §2, §12; PRD-04 §12; PRD-05 §11; PRD-06 §16; PRD-07 §10 |
| LD-10 | Multiple active plans per session | — | PRD-03 §2, §5.2, §6, §7.3, §8.1; PRD-04 §2, §10 |
| LD-11 | In-app configuration | — | PRD-02 §2, §7; PRD-05 §2; PRD-06 §2, §3; PRD-07 §2, §3 |

**Sub-decisions (from the session index `../ui-session/02-decisions-summary.md`):**

| Sub-decision | Where locked | Where consumed |
|:-------------|:-------------|:---------------|
| Light mode ships in V1 (was "follow-on") | PRD-01 §2.2 (LD-3) | PRD-01 §4.1; PRD-07 §3.1 |
| Theme is a token-level switch | PRD-01 §2.2 (LD-3) | PRD-01 §3; PRD-02 §3.2; PRD-07 §3.1 |
| Nav-rail footer carries theme + density toggles | PRD-01 §2.4 (sub-decisions) | PRD-02 §4.2 |
| Plan view lives in two places (chat PlanCard + right inspector) | PRD-01 §2.4 (sub-decisions) | PRD-03 §5.3, §6; PRD-04 §2, §3, §10 |
| Settings V1 scope cut (no free-form JSON editor) | PRD-01 §2.4 (sub-decisions) | PRD-06 §2; PRD-07 §2, §3.1, §13; UI-015 |
| Linear convention (newest at bottom) | PRD-03 §2 (sub-decision) | PRD-03 §3, §3.1, §13 |
| Role gating is server-side authoritative; Viewer mutating actions are not rendered, not just disabled | PRD-01 §2.4 (sub-decisions) | PRD-02 §7; PRD-07 §3.4, §9 |
| Status strip is the first read when something is wrong | PRD-01 §2.4 (sub-decisions) | PRD-02 §6; PRD-06 §14 |
| A11y is built in, not a follow-on | PRD-01 §2.4 (sub-decisions) | PRD-01 §8; every PRD's a11y section |
| No `#hex` literals in component code | PRD-01 §2.4 (sub-decisions) | PRD-01 §3, §11; lint rule |

---

## 4. Engineering-constraint → PRD traceability

The 5 frozen engineering constraints from `ui/CONTEXT.md` are re-stated in **PRD-01 §2.5** in full and cited by number throughout:

| EC | Title | Cited in |
|:---|:------|:---------|
| EC-1 | Tauri 2 desktop shell | Every PRD's §2; PRD-02 §3, §5; PRD-07 §8, §9 |
| EC-2 | React 19 + TypeScript + Vite | Every PRD's §2; UI-001 (Tailwind v4 + shadcn/ui), UI-003 (TanStack Router), UI-004 (Zustand+Query) |
| EC-3 | Bun for JS package management and dev/build | Every PRD's §2; UI-001 (`bunx shadcn@latest`); UI-008 (Vitest on Bun); PRD-07 §6 (file picker) |
| EC-4 | gRPC in Rust core only | Every PRD's §2; UI-005 (Realtime Sync — the fold loop reads from `kernel://state`); UI-013 (Blast-Radius — `op_blast_radius_preview` is a Tauri command); PRD-07 §9 (auth provider) |
| EC-5 | Vendored `ui/proto/operator.proto` at contract 0047 | Every PRD's §2; PRD-02 §5 (hydration contract); PRD-04 §7.3 (live-only token lane); PRD-07 §5.3 (audit events); UI-016 (audit export schema) |

---

## 5. ADR → PRD traceability

| ADR | Title | Consumed by |
|:----|:------|:------------|
| UI-001 | Design System Tooling (Tailwind v4 + shadcn/ui component library) | Every PRD's design-system consumption; PRD-01 §3, §3.1, §3.2, §4, §6, §11 |
| UI-002 | i18n Externalization (Lingui) | Every PRD's copy strings; PRD-07 §3 (UI control-plane language preference) |
| UI-003 | Router (TanStack Router) | PRD-02 §8 (command palette); PRD-05 §10 (memory deep links); PRD-07 §5.5 (audit deep links) |
| UI-004 | State Management (Zustand + TanStack Query) | Every PRD's projection store; PRD-02 §5.1; PRD-07 §5.4 (audit export as a Query) |
| UI-005 | Realtime Sync (replace-on-event) | Every PRD's realtime behaviour; PRD-02 §5, §6; PRD-07 §11 |
| UI-006 | Motion Library (CSS-only) | Every PRD's motion; PRD-01 §4.4, §7 |
| UI-007 | Keyboard Library (react-hotkeys-hook) | Every PRD's keyboard map consumption; PRD-01 §9; PRD-02 §8 |
| UI-008 | Test Stack (Vitest + Playwright + axe) | Every PRD's test strategy; product PRD "What is tested" |
| UI-009 | Chat Draft Persistence (localStorage) | PRD-03 §11.3; PRD-02 §3.3 (panel widths — follow-on) |
| UI-010 | Embedded Artifact Contract (TS union + Zod) | PRD-03 §4, §12; PRD-04 §7 (AgentOutputStream) |
| UI-011 | Plan Graph Layout (React Flow + elkjs) | PRD-04 §4.3 |
| UI-012 | Memory Graph Visualisation (React Flow) | PRD-05 §8.2 |
| UI-013 | Blast-Radius Computation (kernel-driven via Tauri command) | PRD-05 §7.1; PRD-07 §4.1 (five-part form's blast-radius panel) |
| UI-014 | Cost Panel (lightweight + link-out + CSS-only Sparkline) | PRD-06 §14; PRD-07 §3.1 (Health sub-screen) |
| UI-015 | Config Schema Contract (JSON Schema + TS codegen) | PRD-07 §3.1 (Runtime settings form) |
| UI-016 | Audit Export Format (CSV + JSON, streamed) | PRD-07 §5.4 |
| UI-017 | Auth Provider (Operator + Viewer; extensible) | PRD-07 §9; PRD-02 §7; every PRD's role-gating |

---

## 6. Story coverage matrix (product PRD's 53 stories)

The 53 stories from `web-ui-prd.md` are covered as follows (the full story-by-story mapping is in each PRD's header):

| Story group | Stories | Covered by |
|:------------|:--------|:-----------|
| Auth & first session | 1, 2, 3 | PRD-07 §8 (first-run), §9 (auth) |
| Chat & steer | 4, 5, 6, 7, 8, 9, 10, 12, 13, 53 | PRD-03 (most), PRD-02 §5 (degraded connection) |
| Plans in Flight | 14 | PRD-06 §5 |
| Sessions & checkpoints | 11, 15, 16 | PRD-06 §4 |
| Agents | 17, 18 | PRD-06 §6 |
| Tools & Skills | 19, 20 | PRD-06 §7 |
| MCP | 21 | PRD-06 §8 |
| Memory | 22, 23, 24, 30, 38 | PRD-05 |
| Scope | 25 | PRD-06 §10 |
| Watch & Reactive | 26 | PRD-06 §11 |
| Lifecycle | 27 | PRD-06 §12 |
| Verifier Pool | 28 | PRD-06 §13 |
| Cost & Energy | 29 | PRD-06 §14 |
| Configuration & audit | 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 51 | PRD-07 (most), PRD-02 §6 (status strip) |
| Roles & resilience | 43, 44, 45, 46, 47, 48, 49, 50, 52 | PRD-01 (design system + keyboard), PRD-02 (shell + role gating), PRD-07 §9 (auth) |

Every story traces to one or more PRDs (per product PRD ID-11: "Every screen and every flow in the technical/UX documents must trace back to one or more user stories above. Stories that have no screen are an indicator of a gap; screens that have no story are an indicator of scope creep.").

---

## 7. Build order (from parent UX PRD §13)

The parent UX PRD proposes a vertical slice first, then parallel packages. The 7 thematic PRDs are a decomposition of the surface; the build order is a separate concern. The mapping:

- **Vertical slice (UX PRD §13.1).** The demo path end-to-end. Spans: PRD-01 (foundation), PRD-02 (shell), PRD-03 (chat), PRD-04 (plan work surface), PRD-05 (memory minimal), PRD-07 (audit read-only + settings → connection). The slice ships with the design system, the shell, the chat surface, the chat-only flows, the memory minimal (list + filter + open + tag with blast-radius), the audit read-only, the realtime engine, the keyboard map, the accessibility pass.
- **P1. Subsystems read views** (PRD-06 §4–§8, §10). Agents, Tools, Skills, MCP, Scope. Read-only.
- **P2. Subsystems read + mutate** (PRD-06 §11, §12, §13, §14). Watch & Reactive, Lifecycle, Verifier Pool, Cost & Energy. Lifecycle and watch support mutations.
- **P3. Memory explorer** (PRD-05 §6, §7, §8, §9). Compare, graph view, bulk select, bulk tag / supersede, advanced filters, episodic memory cards, procedural template cards.
- **P4. Audit & export** (PRD-07 §5.3, §5.4). Audit mutations, CSV / JSON export, deep-link back to target.
- **P5. Configuration** (PRD-07 §3, §6, §8, §9). Settings → Runtime, Settings → UI, Settings → Profiles, drill-downs, first-run flow.
- **P6. Polish & a11y** (PRD-01 §8 + the slice / P1–P5 surfaces). Density toggle polish, shortcut palette refinement, empty / loading / error pass, full screen-reader pass, AAA contrast pass, light mode (already V1 per LD-3).

The 7 thematic PRDs are the **what**; the build order is the **when**. A future "build order" document picks the package dependencies in detail; the parent UX PRD §13.3 has the dependency graph.

---

## 8. Source artefacts (read by the implementation phase)

The implementation phase reads from this directory in this order:

1. **This README** — the entry point, the traceability matrices, the build order.
2. **PRD-01** — the foundation. Every implementation phase change references PRD-01's token taxonomy + design system + a11y contract.
3. **PRD-02** — the shell. The first concrete surface; the chrome every other PRD renders into.
4. **PRD-03…07** — the thematic surfaces. Read in any order; each is self-contained given the inherited decisions.
5. **The 17 ADRs** — read alongside the PRD that owns the open question. UI-001 / UI-002 alongside PRD-01; UI-003…UI-008 alongside PRD-02; etc.
6. **Parent artefacts** — `web-ui-prd.md` (product PRD), `web-ui-ux-prd.md` (parent UX PRD), `../requirements/web-ui-requirements.md` (requirements), `CONTEXT.md` (kernel glossary), `CURRENT_CODEBASE_STATE.md` (as-built kernel), `ui/CONTEXT.md` (frozen in-repo decisions), `ui/src-tauri/CONTEXT.md` (transport contract), `ui/proto/operator.proto` (the vendored gRPC surface).

---

## 9. Caveats and known drifts (worth recording before implementation starts)

These are the drifts and gaps the implementation phase should be aware of, surfaced during the drafting pass:

- **`ui/docs/web-ui-prd.md` is a duplicate of `web-ui-prd.md`.** Two sources of truth for the same document. Whichever one we treat as canonical, the other will rot. **Recommendation:** delete `ui/docs/web-ui-prd.md` (or replace with a symlink) before implementation starts.
- **The `t` shortcut ambiguity.** The UX PRD §10 says `t` cycles theme; the session index mentioned `t` was updated to "cycle theme density" in the late-session edits. The on-disk UX PRD may still say "theme"; the agent was mid-edit. **Recommendation:** verify the on-disk UX PRD §10; if it's "theme," it stays. The shortcut map in PRD-01 §9 says `t = Cycle theme` (theme-only); density has no V1 shortcut (the click target in the nav-rail footer is the affordance). The session's mid-edit "theme density" combo did not land.
- **The "P6 light mode (if V1)" qualifier.** The session referenced removing the "(if V1)" qualifier on light mode in the P6 acceptance gate. Per the locked sub-decision, light mode is V1, so the qualifier is gone; P6 is now "polish + AAA + full screen-reader." **Recommendation:** verify the on-disk UX PRD §13.2 P6 row reflects this.
- **The settings V1 scope cut.** The UX PRD §11.1 may still reference the free-form JSON editor. Per the locked sub-decision, the editor is out. **Recommendation:** verify the on-disk UX PRD §11.1 reflects the cut.
- **The 8 paperwork todos from the prior session** (`../ui-session/10-final-todos.md`) are still open. The user picked "Only thematic PRDs + ADRs" as this iteration's scope, so the 8 todos are deferred. The most consequential: updating `CONTEXT.md` and `CURRENT_CODEBASE_STATE.md` per the AGENTS.md rule. **Recommendation:** when the PRDs and ADRs are Frozen, the lock-in pass should include the 8 todos + the `CONTEXT.md` / `CURRENT_CODEBASE_STATE.md` sync.
- **The "ready to develop" checklist.** The parent UX PRD's "open questions for the technical document" (§14) are 10 questions the **technical** document must answer. This thematic-PRD series is the **product** artefact; the technical document is the follow-on. **Recommendation:** the technical document is the next deliverable after this series is Frozen; UI-001…UI-017 are inputs to it.
- **Two ADRs were amended during the lock-in pass** (2026-06-22). **UI-001 v0.2** superseded the original vanilla-extract recommendation with **Tailwind v4 `@theme` + shadcn/ui component library** — the cross-frontend composability constraint (all our other web-based frontends use Tailwind + shadcn) ruled out CSS-in-JS. **UI-009 v0.2** superseded the original `tauri-plugin-store` recommendation with **`localStorage`** — same cross-frontend portability argument (drafts are a per-webview concern; `localStorage` works in any Tauri / Electron / browser frontend without a Tauri-specific Rust plugin). The two original v0.1 recommendations are documented in the revised ADRs' "rejected options" tables.

---

## 10. How to use this folder

- **Adding a new screen?** Find the owning PRD; the PRD's header has the story coverage. Add the screen as a new section in the PRD; trace the screen to one or more product PRD stories; if a new component is needed, add it to PRD-01 §6 (component inventory) and propose a new ADR if the component requires a new library.
- **Adding a new ADR?** Find the PRD that surfaces the open question (the PRD's "Open questions" section). Add a new file `UI-NNN-…md` in `../adr/`. Cite the parent PRD; follow the Nygard template (Date, Status, Context, Decision, Consequences). Update this README's §2 and §5.
- **Changing a locked decision?** Don't. The locked decisions are normative. If a change is needed, amend the parent UX PRD §2's decision log explicitly (with a "supersedes v0.1" note), cascade the change through every screen and component that depends on it, and re-derive the acceptance gate. The new decision takes a new LD number.
- **Changing an engineering constraint?** Don't without a kernel-side change first. The 5 EC-* constraints are frozen in `ui/CONTEXT.md`. Any change here is a kernel + UI change; the technical document records the change.
- **The implementation phase?** Start with PRD-01 (foundation) → PRD-02 (shell) → the slice's chosen PRDs (per §7's vertical slice). The build order in §7 is the recommended path.
