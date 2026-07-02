# PRD-05 — Memory Explorer

**Status:** Frozen v1.0 — locked 2026-06-22.
**Parent PRD:** `web-ui-ux-prd.md` v0.1 · [PRD-01](01-foundation.md) Foundation · [PRD-02](02-shell-and-layout.md) Shell & Layout.
**Sibling PRDs:** [PRD-03](03-chat-surface.md) Chat Surface · [PRD-04](04-plan-work-surface.md) Plan Work Surface · [PRD-06](06-operator-console.md) Operator Console · [PRD-07](07-configuration-and-audit.md) Configuration & Audit.
**Source requirements:** `../requirements/web-ui-requirements.md` §2.2.6 (Memory), §5.2.11 (UC-11), §7.1 (data surface: documents by DocType, scope, session, time, activation_strength; graph neighbours; provenance), §7.2 (write: tag a memory or resource with a scope / evaluation tag).
**Source PRD:** `web-ui-prd.md` ID-2 (vocabulary: MnemonicFact, MnemonicScene, EpisodicMemory, ProceduralTemplate, NegativeEdge, …), ID-3 (controller over the boundary), ID-9 (data plane = kernel's data plane).
**Story coverage:** Story 22 (memory list + filters), Story 23 (memory document detail: FACT, SCENE, graph, provenance), Story 24 (compare two memory documents side-by-side), Story 30 (tag a memory with a scope / evaluation tag, with blast-radius preview), Story 38 (bulk-tag or bulk-supersede).
**Companion ADRs (all Frozen):** [UI-012](../adr/UI-012-memory-graph-viz.md) Memory Graph (React Flow) · [UI-013](../adr/UI-013-blast-radius-computation.md) Blast-Radius Computation (kernel-driven via Tauri command).

---

## 1. Scope

**In scope.** The Memory console entry — the operator's primary surface for browsing, filtering, inspecting, comparing, and mutating the LTM (Long-Term Memory) store; the filter bar (compact; "more filters" popover for the long tail); the virtualised memory list; the per-row preview (DocType pill, scope tag, activation_strength bar, session, age, content preview); the memory detail (FACT, SCENE, graph neighbours, provenance, mutating actions); the side-by-side compare; the bulk select / tag / supersede; the blast-radius preview panel that gates the mutating action's confirm-with-consequence bar; the inline graph view next to the open document (collapsible, smaller pane); the EpisodicMemory and ProceduralTemplate card variants; the integration with the chat's `MemoryReference` block (PRD-03 §4 type 8); the integration with the audit log (PRD-07) for every mutating action.

**Out of scope.** The MemoryReference block in the chat (PRD-03 §4 type 8). The graph layout algorithm choice (UI-012 — the open question in this PRD's §14). The blast-radius computation's location (UI-013 — the open question in this PRD's §14). The procedural template authoring (PRD-06 / kernel ADR-0027 owns the Hippocampus surface). The memory engine internals (kernel ADR-0015 / 0016 / 0017 / 0025 / 0029 / 0048 — the UI is a controller, not the source of truth, per product PRD ID-3 + ID-9).

---

## 2. Inherited decisions (cited by number)

**From the UX PRD `web-ui-ux-prd.md` §2:**
- **LD-5 — Memory explorer.** Filter bar at the top (compact; "more filters" popover for the long tail). Selection details in the right inspector. Graph view inline next to the open document, smaller pane, collapsible.
- **LD-8 — States.** Empty / loading / error / success / audit (PRD-01 §10) applied to the memory list, the memory detail, the graph view, and the blast-radius panel.
- **LD-11 — In-app configuration.** The memory explorer is a controller over the kernel's `ScopedVectorStore` (kernel ADR-0034). The UI never bypasses the kernel's read scoping; mutating actions are kernel-derived (kernel ADR-0035).

**From PRD-01 (Foundation):**
- §4 (visual tokens; the memory explorer consumes them).
- §6 (component inventory; this PRD composes from `MemoryList`, `MemoryListRow`, `MemoryDetail`, `MemoryFACT`, `MemorySCENE`, `MemoryGraph`, `MemoryCompareSideBySide`, `MemoryTagEditor`, `MemoryBlastRadius`).
- §7 (realtime grammar; pulse on a new memory arriving, trail on a list row whose data changed, status pill on the durable state).
- §8 (a11y contract; the list is a virtualised list with proper aria-rowcount, the graph view is decorative and the list is the canonical accessible representation, the blast-radius panel is a live region).
- §9 (keyboard; `j` / `k` for list nav, `Enter` to open, `Esc` to close, `/` to focus the filter bar, `n` for "new tag").
- §10 (state vocabulary; the memory list, the detail, the graph, the blast-radius panel all have the 5 states).
- §11 (forbids; no bespoke per-row styles).

**From PRD-02 (Shell & Layout):**
- §4.1 (nav rail; the "Memory" entry is the global entry point).
- §4.4 (right inspector; the memory detail is rendered into the inspector when the operator is focused on a document).
- §6 (status strip; the LTM up pill is the at-a-glance read).

**From the in-repo `ui/CONTEXT.md` (PRD-01 §2.5):**
- **EC-1** (Tauri 2), **EC-2** (React 19 + TS + Vite), **EC-3** (Bun), **EC-4** (gRPC in Rust core; the memory explorer reads via the projection store + `memory_query` (kernel ADR-0022's pull mechanism) and mutates via Tauri commands), **EC-5** (vendored proto at 0047).

**From kernel ADRs (cited, not re-decided):**
- **ADR-0015** (Engram engine; the memory model the UI renders).
- **ADR-0016** (WorkspaceStage; the SCENE+FACT pairing the detail page surfaces).
- **ADR-0017** (Spreading activation; the `document_edges` graph the graph view renders).
- **ADR-0022** (Global Workspace push/pull; the memory explorer is the pull side for memory documents).
- **ADR-0025/0027/0029** (Memory reform, Hippocampus procedural templates, EpisodicMemory — the DocTypes the list filters over).
- **ADR-0034/0035** (Tag-based scoping; kernel-derived write classification; the blast-radius semantics).
- **ADR-0048** (Working-memory context hygiene; the recall filter + summary column + content_cid mechanism the detail page surfaces).

---

## 3. The filter bar (LD-5)

The filter bar is at the top of the centre column when the Memory entry is selected from the nav rail. It is **compact** (per LD-5) — the height is the compact-density row height (PRD-01 §4.3). It carries:

- **DocType filter** — a multi-select pill row: `MnemonicFact`, `MnemonicScene`, `EpisodicMemory`, `AgentProfile`, `ProceduralTemplate`, `NegativeEdge`, `Tool`, `Skill`. The first set are the user-facing DocTypes; `Tool` and `Skill` are also memory documents (kernel ADR-0039 / 0046).
- **Scope tag filter** — a single-select dropdown (the vocabulary picker from PRD-01 §6).
- **Session filter** — a single-select dropdown of recent sessions.
- **Time range** — a date range picker (last 24 h / 7 d / 30 d / custom).
- **Activation strength** — a range slider (0.0–1.0).
- **Free text** — a search input that does ANN over the documents.
- **"More filters" popover** — for the long tail: `source_agent`, `session_id`, `metadata.tags` (CNF predicate — kernel ADR-0034), `content_cid` presence (kernel ADR-0048).
- **`/` keyboard shortcut** to focus the filter bar (PRD-01 §9).
- **"Reset"** affordance — clears all filters.

The filter bar is a sticky header. The list scrolls below.

---

## 4. The memory list

A virtualised list of memory documents matching the filter. Each row is a `MemoryListRow` (PRD-01 §6):

- **DocType pill** (left).
- **Scope tag** (mono).
- **Activation strength bar** (the bar's fill is the activation_strength; PRD-01 §6).
- **Session** (if any; mono, truncated id).
- **Age** ("3 min ago" / "2 h ago" / "5 d ago" — relative time, throttled to 1 min refresh).
- **Content preview** (the first ~80 chars; mono).

### 4.1 Realtime

The list is **realtime** (product PRD ID-5). New documents arrive via the projection store fold (UI-005). A new row slides in from below (PRD-01 §7) with a pulse. Updated rows trail-mark in the right margin.

### 4.2 Bulk select

The list supports multi-select via a leading checkbox column. `Shift+click` selects a range; `Cmd/Ctrl+click` toggles. The bulk action bar appears at the bottom of the list when ≥ 1 row is selected. The bar carries: **count** + **bulk-tag** + **bulk-supersede** + **clear selection**. Bulk actions are operator-only; for Viewer the checkbox column is hidden (not just disabled — per PRD-02 §7.2).

### 4.3 Empty / loading / error / success

The list follows the PRD-01 §10 state vocabulary. The empty state is the canonical "no memories match" + a "Reset filters" affordance + a deep link to the memory-pressure trigger in the Lifecycle console (PRD-06 §7.9). The loading state is the PRD-01 §10.2 skeleton (1.5 s shimmer; max 5 s then empty takes over). The error state is the kernel's reason verbatim + a deep link to the LTM health pill in the status strip (PRD-02 §6.1).

---

## 5. The memory detail (right inspector)

Clicking a row opens the detail in the right inspector (PRD-02 §4.4 "resource context" shape, specialised for memory). The detail carries:

- **Header** — id, DocType, scope tags, activation_strength bar, age, session.
- **Body** — the **FACT** and **SCENE** (kernel ADR-0016). The FACT is the structured result/output; the SCENE is the snapshot of the `masterContext` at step-completion. The two are paired; both are surfaced.
- **Graph** — the `document_edges` neighbours (PRD-05 §8, the inline graph view).
- **Provenance** — source_agent, source_hash, SourceHash (kernel ADR terminology), audit history of who read / wrote / mutated this document.
- **Mutating actions** (operator-only):
  - **Tag** — apply / remove a scope tag from the vocabulary. Gates the confirm-with-consequence bar with the blast-radius preview (§7).
  - **Promote** — manually promote a memory to a higher activation_strength (subject to the kernel's k-anonymity floor, kernel ADR-0034 D11).
  - **Supersede** — mark this document as superseded by another (the operator picks the superseding document; PRD-05 §6).
  - **Delete** — destructive. Gates the confirm-with-consequence bar with the blast-radius preview.

All mutating actions are **audited** (PRD-07). The success state of a destructive mutation is the audit-log entry appearing in real time (PRD-01 §10.4 + product PRD ID-6).

---

## 6. Compare (side-by-side)

The Memory explorer supports comparing **two selected documents** side-by-side (Story 24). The compare view is opened from the bulk action bar or from a row's right-click menu ("Compare with…"). The compare view carries:

- Both documents' headers (id, DocType, scope, activation_strength, age, session).
- **Similarity score** — the cosine similarity between the two embeddings. (The kernel exposes this; the UI renders.)
- Both documents' bodies (FACT, SCENE) side by side.
- Both documents' provenance side by side.
- Both documents' `document_edges` neighbours (the union of the two graphs; a Venn visualisation).

The compare view is a "decide whether to keep, merge, or supersede" workspace. The mutating actions in this view: **merge into one** (kernel-side; the operator picks which; the other is marked superseded), **supersede one with the other**, **tag both** (with the blast-radius preview), **close compare** (no mutation).

---

## 7. Blast-radius preview (Story 30)

When the operator tags a memory or resource, the mutation form opens in the inspector (PRD-02 §4.4 "mutation context" shape). Above the confirm-with-consequence bar, a **blast-radius panel** shows: which agents' `EffectiveScope` is now widened or narrowed, and which `EffectiveForCaller` results would change (kernel ADR-0034 / 0035). The panel is a virtualised list, sorted by impact. The operator must read the blast radius before the confirm-with-consequence bar enables.

The bar names the consequence in plain language: "Tagging this memory with `scope:internal` will narrow the EffectiveScope of 3 agents. 2 plans that referenced this memory will be re-evaluated at next step."

### 7.1 Computation

The blast-radius computation is the open question in UI-013: kernel-driven via a gRPC call vs UI-side using the scope data. The recommendation in UI-013 is **kernel-driven** (the kernel has the `EffectiveScope` logic; the UI is a controller, not the source of truth, per product PRD ID-3 + ID-9).

### 7.2 Same blast-radius pattern for non-memory resources

PRD-07 §11 reuses the same blast-radius panel for the Settings surface (scope changes, write-tag changes, tool-grant changes). The component (`MemoryBlastRadius` from PRD-01 §6) is generic; the data source is whatever the mutation targets.

---

## 8. The inline graph view (LD-5)

The memory detail carries an **inline graph view** (LD-5): the `document_edges` neighbours of the open document, rendered as a smaller pane next to the FACT/SCENE body. The graph is **collapsible** (default open; operator can collapse to a one-line summary).

### 8.1 What the graph shows

- The open document (centre).
- Direct neighbours (one hop) — labelled with the edge type (`closes` / `specifies` / `contradicts` / `discussed_in`, per kernel ADR-0017).
- Optional expansion to two hops (per-operator preference; default off).

### 8.2 Layout

The graph layout algorithm is the open question in UI-012. The constraints are similar to UI-011 (PRD-04): deterministic, stable, virtualised, fast. The recommendation in UI-012 is **React Flow** for consistency with the plan graph, with the caveat that for very large graphs (1000+ nodes) a more specialised library may be needed.

### 8.3 Click-through

Clicking a neighbour opens that document in the detail (replaces the current open document). The graph updates around the new centre. The graph is the navigation aid; the detail is the work surface.

---

## 9. EpisodicMemory and ProceduralTemplate cards

When the operator opens an `EpisodicMemory` or `ProceduralTemplate` document, the detail page renders a specialised card instead of the canonical FACT+SCENE shape:

- **EpisodicMemory** — the session-level narrative (Goal, Decisions, ActionItems, … per kernel ADR-0029). The card is pinned to the session that produced it. PRD-03 §4 type 12 references the same shape as a chat block.
- **ProceduralTemplate** — the stored plan, the hit rate, the runs that produced it, the agents it typically uses (kernel ADR-0027). The card is pinned to the plan that used it. PRD-03 §4 type 12 references the same shape.

Both cards follow the PRD-01 design system; no bespoke per-type styles. The mutating actions on these cards are: **supersede** (for EpisodicMemory) and **un-template** (for ProceduralTemplate, with the confirm-with-consequence bar).

---

## 10. Integration with the chat

The chat's `MemoryReference` block (PRD-03 §4 type 8) is a clickable link that opens the referenced document in the memory explorer's detail. The deep link is typed (UI-003 router): `/memory/$docId?type=mnemonic_fact`. The explorer opens with the document focused; the operator can navigate from there.

The reverse direction: the memory explorer's "go to plan" affordance on a `MnemonicFact` opens the plan that produced it (PRD-04 work surface, focused on the producing step). The two surfaces are linked.

---

## 11. Keyboard

The memory explorer consumes the keyboard map from PRD-01 §9:

- `/` — focus the filter bar.
- `j` / `k` — next / previous row in the list.
- `Enter` — open the focused row in the detail.
- `Esc` — close the detail / clear the selection.
- `n` — new tag (opens the tag editor on the focused row; the tag editor is a form in the inspector with the blast-radius preview).
- `Shift+click` / `Cmd/Ctrl+click` — multi-select.
- `Shift+j` / `Shift+k` — extend the multi-select range.

The detail is a destination; it does not own its own keyboard map (it uses the inspector's standard `Esc` to close, `Enter` to commit a form field).

---

## 12. Realtime within the memory explorer

The memory explorer is **realtime** (product PRD ID-5). The fold (UI-005) updates the projection store. The Zustand selectors (UI-004) re-render only the changed rows. The realtime grammar (PRD-01 §7) is applied to:

- A new document arriving (pulse on the new row).
- A document's activation_strength changing (trail on the row + the activation bar re-animates).
- A document being deleted (row collapses with the trail mark; a `SystemNote` lands in the audit log).
- A document being superseded (the old row's status pill turns to "superseded"; the new row's status pill is "active"; both are visible during the transition).

The blast-radius panel is **also realtime** — when the operator types a tag in the tag editor, the panel re-computes the blast radius on every keystroke (throttled to 250 ms; PRD-01 §4.4 motion budget). The computation is kernel-driven (UI-013).

---

## 13. Empty / loading / error / success states (PRD-01 §10)

The memory explorer's five states per surface:

- **Memory list** — empty ("no memories match" + reset filters + deep link to Lifecycle), loading (skeleton), error (kernel's reason verbatim), success (the list is the success), audit (bulk-tag and bulk-supersede are audited).
- **Memory detail** — empty (rare; "no document open"), loading (skeleton), error (kernel's reason), success (the detail is the success), audit (every mutation is audited).
- **Graph view** — empty ("no neighbours"), loading (skeleton), error (kernel's reason), success, audit (n/a).
- **Blast-radius panel** — empty ("no scope impact"), loading (skeleton), error (kernel's reason), success (the panel renders the impact), audit (n/a; the mutation itself is audited).
- **Compare view** — empty (rare; "no document selected"), loading (skeleton), error (kernel's reason), success, audit (merge / supersede / tag-both are audited).

---

## 14. Open questions (gaps for ADRs)

| # | Question | ADR | Status |
|:--|:---------|:----|:-------|
| 1 | Which graph visualisation library do we use for the inline memory graph view? (React Flow / cytoscape / d3 / sigma.js) | [UI-012](../adr/UI-012-memory-graph-viz.md) | **Draft** |
| 2 | Where does the blast-radius computation live? (kernel-driven via gRPC / UI-side using scope data) | [UI-013](../adr/UI-013-blast-radius-computation.md) | **Draft** |

**Not in this PRD's open-questions block:**
- The plan graph layout (PRD-04 → UI-011).
- The cost-panel vs metrics-explorer decision (PRD-06 → UI-014).
- The config schema contract (PRD-07 → UI-015).
- The audit export format (PRD-07 → UI-016).
- The auth provider (PRD-07 → UI-017).

---

## 15. Cross-references

- **Parent PRD** — `web-ui-ux-prd.md` §7.6 (Memory), §2.5 (LD-5), §2.8 (LD-8), §2.11 (LD-11).
- **Sibling PRDs** — PRD-03 (MemoryReference block), PRD-04 (plan work surface; the destination for "go to plan"), PRD-06 (Memory console entry in the nav rail — same surface, same PRD), PRD-07 (audit + role gating + config).
- **Foundation PRD** — PRD-01 §4.4 (motion), §6 (components), §7 (realtime), §8 (a11y), §9 (keyboard), §10 (states), §11 (forbids).
- **In-repo `ui/CONTEXT.md`** — EC-1…EC-5 (Tauri 2, React 19, Bun, gRPC in Rust, vendored proto at 0047).
- **Kernel ADRs** — ADR-0015 (Engram engine), ADR-0016 (WorkspaceStage), ADR-0017 (Spreading activation), ADR-0022 (push/pull), ADR-0025/0027/0029 (memory reform / Hippocampus / Episodic), ADR-0034/0035 (scoping / kernel-derived write classification), ADR-0044 (semantic tool retrieval — the DocTypeTool memory type), ADR-0046 (skills — the DocTypeSkill memory type), ADR-0048 (working-memory context hygiene).
- **Companion ADRs** — UI-012, UI-013 (both in this PRD's §14).

---

## 16. Glossary

Definitions of new vocabulary this PRD introduces. For shared terms (Substrate, Handoff, ExecutionPlan, MnemonicFact, MnemonicScene, EpisodicMemory, ProceduralTemplate, EffectiveScope, DefaultWriteTags, etc.) see `CONTEXT.md` §7. For design-system terms (Pulse, Trail, Status pill, etc.) see PRD-01 §14. For shell terms see PRD-02 §11. For chat terms see PRD-03 §16. For plan terms see PRD-04 §16.

- **Memory document** — A row in the `documents` table (kernel ADR-0015). Carries a `DocType`, a `summary` (per kernel ADR-0048), an `activation_strength`, scope tags, an optional `content_cid`, and provenance.
- **FACT** — `DocTypeMnemonicFact`. The structured result / output ("what happened"). One half of the SCENE+FACT pairing (kernel ADR-0016).
- **SCENE** — `DocTypeMnemonicScene`. The snapshot of the `masterContext` at step-completion ("the situation it happened in"). The other half.
- **Document edges** — The `closes` / `specifies` / `contradicts` / `discussed_in` graph (kernel ADR-0017). The memory explorer's inline graph view renders this graph.
- **Activation strength** — `[0,1]` lifecycle metric per Document (kernel ADR-0015). The effective relevance at read = `cosine × (α + (1−α)·activation) × e^(−λ·age)`. Replaced `ImportanceScore`.
- **Blast radius** — The set of agents / plans whose `EffectiveScope` is affected by a proposed mutation. Rendered in the blast-radius panel above the confirm-with-consequence bar.
- **Compare view** — The side-by-side view of two selected memory documents. Used to decide keep / merge / supersede.
- **Bulk select** — Multi-row selection on the memory list, gated to bulk-tag and bulk-supersede mutating actions.
