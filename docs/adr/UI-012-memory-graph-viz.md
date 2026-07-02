# UI-012 — Memory Graph Visualisation

**Date:** 2026-06-22
**Status:** Accepted

## Context

PRD-05 ([../prd/05-memory-explorer.md](../prd/05-memory-explorer.md)) §8 requires an **inline graph view** of a memory document's `document_edges` neighbours (kernel ADR-0017). The graph is rendered as a smaller pane next to the FACT/SCENE body in the memory detail. The constraints are similar to UI-011 (PRD-04 plan graph) but with different shape:

- The graph is **smaller** (the memory detail's body, not the full work surface).
- The graph is **collapsible** (default open; operator can collapse).
- The graph's **edge semantics are typed** (`closes` / `specifies` / `contradicts` / `discussed_in` — kernel ADR-0017). The edge type is a visible label.
- The graph is **navigational** — clicking a neighbour opens that document in the detail.
- The graph can grow — 1-hop is the default, 2-hop is a per-operator preference. With the k-anonymity floor (kernel ADR-0034 D11) the graph is bounded, but in a mature LTM the 2-hop neighbourhood can still be 100+ nodes.

### What the library must do

1. Render a graph with up to ~200 nodes (1-hop + selective 2-hop) and ~400 edges.
2. Layout: deterministic, stable, with the centre node prominent.
3. Edge types as visible labels.
4. Click-through: clicking a node navigates to that document in the detail.
5. React-native custom node types.
6. Collapsible (the graph view is a smaller pane; the rest of the detail must remain visible).

### Options

| Option | Layout quality | React 19 fit | Custom node types | Large-graph performance | Notes |
|:-------|:---------------|:-------------|:------------------|:------------------------|:------|
| **React Flow** (xyflow) | ✅ (uses dagre or elkjs) | ✅ | ✅ | ✅ for 100s of nodes; degrades at 1000s | Consistent with UI-011. The de-facto choice for React 19. |
| **cytoscape.js** | ✅ | ⚠️ (imperative API; React 19 idioms require cytoscape-react wrapper) | ⚠️ | ✅ excellent at 1000s of nodes | The best for large graphs. Loses React 19 idioms. |
| **d3-force** | ✅ (force-directed) | ⚠️ (you build the React layer) | ✅ | ✅ | Most flexible; most work. The standard for "I want to own every pixel." |
| **sigma.js** | ✅ | ❌ (WebGL; React 19 idioms limited) | ⚠️ | ✅✅ (10,000+ nodes via WebGL) | Overkill for our use case. |
| **vis.js** | ⚠️ | ❌ | ⚠️ | ⚠️ | Older; less idiomatic. |

## Decision

**Recommended:** **React Flow (xyflow)** for the inline memory graph view, with **cytoscape.js as the fallback** for the (deferred) "memory graph explorer" global view (a follow-on surface for very large graphs).

Rationale:

1. **Consistency with UI-011.** React Flow is also the plan graph library (UI-011). One library, one mental model, one set of design-system composables.
2. **React-native + custom node types.** The memory graph node is a PRD-01 component (`MemoryGraph` / `MemoryListRow` rendered into a node). No SVG primitives; the design system is consumed directly.
3. **Edge types as labels.** React Flow's edge component supports a `label` prop; the edge type is rendered as a small mono label.
4. **Click-through.** React Flow's `onNodeClick` handler triggers a router navigation (UI-003) to `/memory/$docId`.
5. **Collapsible.** The graph view is wrapped in a collapsible container; React Flow is just the inner renderer.
6. **Performance.** React Flow handles 200 nodes + 400 edges easily; the 1-hop default is fine. For the 2-hop case (100+ nodes), React Flow's virtualisation (renderer-level culling) is sufficient.

The deciding factor against cytoscape.js is the React 19 idiom loss. The deciding factor against d3-force is the build cost. Sigma.js is overkill. For a follow-on "global memory graph explorer" (a future PRD), cytoscape.js is the right choice — but for the V1 inline view, React Flow wins on consistency.

## Consequences

**Positive.**

- The memory graph layer is the same library as the plan graph layer. The two graph surfaces in the app share a mental model and a set of components.
- Layout is deterministic by construction (same plan → same layout).
- Edge types are visible labels; the `contradicts` edge can be styled differently (PRD-01 §4 colour tokens).
- The graph is a React component; the design system is consumed directly.

**Negative / risks.**

- React Flow is ~50 KB gzipped. With UI-011 already in the bundle, the marginal cost is small.
- 2-hop with 100+ nodes is the upper bound; a future "global memory graph explorer" may need cytoscape.
- Custom node types must follow PRD-01 §11 forbids — no bespoke styles. The component is a PRD-01 component.

**Out of scope here** (handled in PRD-05): the memory detail's other surfaces (FACT, SCENE, provenance, mutating actions). This ADR records the *graph layer* choice.

**Reversibility.** Medium-high. Swapping React Flow for cytoscape for the inline view is mechanical but loses the React 19 idioms. The deferred "global memory graph explorer" can ship with cytoscape without affecting the inline view.
