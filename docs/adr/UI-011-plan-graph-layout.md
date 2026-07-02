# UI-011 — Plan Graph Layout Library

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-04 ([../prd/04-plan-work-surface.md](../prd/04-plan-work-surface.md)) §4.3 mandates a graph layout that is **deterministic**, **stable**, **top-down or left-right**, **virtualised**, and **fast** (200-step plan renders in < 100 ms; updates in < 16 ms). LD-4 (PRD-01 §2.1) is explicit: "The graph layout is deterministic and stable across re-renders (steps do not 'jump' on update)."

The graph renders the kernel's `ExecutionPlan` (a DAG of `Step`s with `DependsOn` indices). The webview reads the plan from the projection store (UI-005). The graph is **read-only** in V1 — the operator observes, does not edit (edits are via the Planner's prompt; PRD-03).

### What the library must do

1. **Compute a layout** for a DAG with up to 200 nodes and ~400 edges.
2. **Re-layout incrementally** — when a new step is added, the existing nodes do not move (or move by a bounded amount). This is the "stable" constraint from LD-4.
3. **Render to SVG** (or canvas) with React-friendly primitives.
4. **Support custom node types** — `PlanGraphNode` (PRD-04 §4.1) is not a circle; it carries a status pill, bids badge, output peek, TrustScore.
5. **Pan + zoom** built in.
6. **Virtualisation** for large plans.

### Options

| Option | Layout quality | Stable updates | React 19 fit | Custom node types | Virtualisation | Notes |
|:-------|:---------------|:--------------|:-------------|:------------------|:--------------|:------|
| **React Flow (xyflow)** | ✅ uses dagre or elkjs under the hood | ✅ via stable keys | ✅ | ✅ (React components as nodes) | ✅ (built-in) | The de-facto React graph library. TypeScript-native. |
| **dagre** (layout only) | ⚠️ simple hierarchical | ⚠️ no built-in stability; you diff layouts yourself | ❌ (no React) | n/a | n/a | Layout algorithm only. You'd build the React layer + virtualisation yourself. |
| **elkjs** (layout only) | ✅ sophisticated layered (the "Eclipse Layout Kernel") | ⚠️ same as dagre | ❌ | n/a | n/a | More powerful than dagre; better for complex DAGs. Same "bring your own React" caveat. |
| **cytoscape.js** | ✅ | ⚠️ | ⚠️ imperative | ⚠️ | ⚠️ (cytoscape has its own virtualisation) | Mature; complex API. Overkill for our use case. |
| **vis.js** | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | Older; less idiomatic for React 19. |
| **Custom SVG** | ✅ (you own it) | ✅ (you own it) | ✅ | ✅ | ✅ | Highest control; highest cost. |

## Decision

**Recommended:** **React Flow (xyflow) with elkjs as the layout engine** (or dagre for simpler plans).

Rationale:

1. **React-native and TypeScript-first.** React Flow is built for React 19; the node types are React components. The `PlanGraphNode` (PRD-04 §4.1) is a React component that React Flow renders.
2. **Built-in stable layout via dagre/elkjs.** React Flow integrates with both. The "stable" constraint is met by using the same layout function for the same plan; the layout is deterministic by definition.
3. **Custom node types.** Status pill, bids badge, output peek, TrustScore — all React components rendered inside the node. No SVG primitives; the design system (PRD-01) is consumed directly.
4. **Virtualisation.** React Flow's renderer virtualises by default; off-screen nodes are not in the DOM. The 200-step plan is fine.
5. **Pan + zoom built in.** Plus the keyboard shortcuts `+` / `-` / `0` from PRD-04 §4.4 are trivial to wire.
6. **Performance.** React Flow handles 200 nodes + 400 edges easily; the < 100 ms initial render and < 16 ms update budgets are met.

The deciding factor against dagre-only is the React layer we'd have to build. The deciding factor against elkjs-only is the same. The deciding factor against custom SVG is the cost. The deciding factor against cytoscape is the imperative API and the React 19 mismatch.

## Consequences

**Positive.**

- The graph layer is one library, one mental model. `PlanGraphNode` is a React component; the PRD-01 design system is consumed directly.
- Layout is deterministic by construction (the same plan → the same layout).
- The 200-step plan renders in < 100 ms; updates are bounded.
- Pan + zoom + virtualisation are free; we add the keyboard layer (PRD-04 §4.4).

**Negative / risks.**

- React Flow is a substantial library (~50 KB gzipped). Worth it for the capability; not free.
- Custom node types must follow PRD-01 §11 forbids — no bespoke styles. The component is a PRD-01 component composed from `StatusPill` + `BidCard` + `AgentOutputLine` etc.
- React Flow's API has evolved (xyflow rebranding); pinning to a major version is required.

**Out of scope here** (handled in PRD-04): the work surface's other surfaces (BidCard, AgentOutputStream, ConfidenceBar, TrustScorePill). This ADR records the *graph layer* choice.

**Reversibility.** Medium. Swapping React Flow for cytoscape or a custom SVG is mechanical but loses the React-native ergonomics. Elkjs as the layout engine is portable; the React layer is the cost.
