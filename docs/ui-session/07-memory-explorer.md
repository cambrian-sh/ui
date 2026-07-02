# 07 — Memory Explorer

**Bound by decision log 5 (memory explorer).**

The Memory Explorer is one of the Console entries in the nav rail. It is
the operator's workspace for inspecting, editing, and auditing the
runtime's long-term memory (`pgvector`) and procedural templates
(`Hippocampus`).

## Layout

- **Filter bar at the top** (compact; "more filters" popover for the long tail).
- **List in the centre** of the screen (or the centre column, depending on density).
- **Selection details in the right inspector** (resource-context shape — see `04-shell-and-layout.md`).
- **Graph view inline next to the open document** — a smaller pane, collapsible. Shows the open document's neighbourhood in the memory graph (FACT, SCENE, related plans).

## Filter bar

Compact by default. The "more filters" popover opens for the long tail of
filters. Filters include:

- **Type.** Document, AgentProfile, ProceduralTemplate, JudicialRecord.
- **Importance score.** 1–10 scale; slider.
- **Source.** Plan completion, manual ingest, memory worker consolidation.
- **Time range.** Created / last-accessed.
- **Tags.** Operator-applied labels; vocabulary picker.
- **Search.** Semantic (vector similarity) and lexical (full-text). The two combine.

## Document types

The runtime stores several kinds of memory documents. The explorer
adapts its view to the type:

| Type | What it is | What the explorer shows |
|:-----|:-----------|:------------------------|
| **Document** | Semantic knowledge, free text. | Body, importance, tags, related plans, access history. |
| **AgentProfile** | Genotype-level agent record (success rate, TrustScore, manifest, fingerprint). | Identity, status pill, key fields, recent activity, related plans, mutating actions. |
| **ProceduralTemplate** | Hippocampus prior plan. | Plan body, success rate, similarity to recent plans, "use as hint" action. |
| **JudicialRecord** | Verifier critique. | Verdict, confidence, cross-verification status, source plan. |

## The graph view

Inline next to the open document. Smaller pane; collapsible. Shows the
open document's neighbourhood in the memory graph:

- **FACT nodes** — atomic facts, clustered by semantic proximity.
- **SCENE nodes** — composite episodic context.
- **Edges** — semantic similarity (cosine), temporal co-occurrence, plan reference.

The graph is **read-only** in V1. Editing happens through the document
detail, not by manipulating the graph.

## Selection details (right inspector)

The right inspector's resource-context shape (see
`04-shell-and-layout.md`) carries:

- Resource header (id, trait / type, status pill)
- Key fields
- Recent activity
- Related plans
- Mutating actions

For documents specifically:

- **Body** (with the ability to read in full)
- **Importance** (read + override; the override is audited)
- **Tags** (TagEditor — vocabulary picker)
- **Blast radius** (MemoryBlastRadius) — what plans and agents would be affected if this document were deleted or modified. Computed from the related-plans graph.
- **Compare side-by-side** (MemoryCompareSideBySide) — for the operator to diff two documents (e.g. before and after a manual edit).

## Mutating actions on memory

All mutating actions are audited (see `09-configuration-and-profiles.md`).
For memory specifically:

- **Edit body.** Audit entry records the before/after and a mandatory reason.
- **Override importance.** Audit entry records the new score and a mandatory reason.
- **Add / remove tag.** Audit entry records the change.
- **Delete.** Confirm-with-consequence bar + mandatory reason. Blast radius is shown in the bar.
- **Promote to procedural template** (for documents that look like plan patterns). The operator can promote; the runtime can also auto-promote at the MemoryWorker consolidation step.

## Server-side authority

The memory explorer is a **form over the published schema**. The
runtime is the source of truth for what is editable; the UI is a form
over the published schema, never a free-form editor (same rule as
runtime settings — see `09-configuration-and-profiles.md`).

## What the memory explorer is NOT

- **Not a search engine.** Search is one filter among many. The primary verb is *browse and inspect*, not *find and jump*.
- **Not a knowledge base editor.** Edits are surgical, not free-form authoring. The operator can correct, tag, or delete; the runtime is responsible for ingestion.
- **Not a verifier dashboard.** Judicial records appear here for inspection; the verifier pool and verifier rounds are separate screens (Console — Verifier Pool).
