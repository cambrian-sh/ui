import type { GraphDocument, GraphNode, GraphScope } from "@/ipc/types";
import { outputPorts } from "./nodeVocabulary";

/**
 * Editing a graph, as pure functions over the document.
 *
 * No React here on purpose: these are the operations an operator performs, and
 * they are worth testing without a renderer. Everything returns a new document —
 * the canvas holds one piece of state and replaces it.
 *
 * # What this file is allowed to decide
 *
 * Almost nothing. The compiler owns the rules, and the console asks it. What
 * lives here is the small set of facts about the DOCUMENT that need no rule to
 * derive — which scope a node is in, whether a port is already terminated — plus
 * the mechanics of adding and removing.
 *
 * Cycles, the merge/arity rule, expression problems: all of those are the
 * compiler's, and a wire that breaks one is allowed to land. A drop that lands
 * and then explains itself is better than a drag that silently will not, because
 * the refusal names the constraint and the action, and a dead drag names
 * nothing.
 */

/** Where a wire may land, in three tiers. */
export type WireVerdict =
  | { kind: "ok" }
  /** Not a connection point at all. Dim it; say nothing — there is nothing to explain. */
  | { kind: "not-a-target" }
  /** Refused, with the reason to show. */
  | { kind: "refused"; reason: string };

/**
 * Whether a wire from `fromNode.fromPort` may land on `toID`.
 *
 * Deliberately short. Every rule added here is a rule reimplemented client-side,
 * and the handoff forbids that outright — so this covers only what needs no rule:
 * scope membership, the trigger having no input, and the wired-XOR-terminated
 * rule, all of which are readable straight off the document.
 */
export function canWire(
  doc: GraphDocument,
  fromID: string,
  fromPort: string,
  toID: string,
): WireVerdict {
  if (fromID === toID) return { kind: "not-a-target" };

  const scope = scopeContaining(doc.scope, fromID);
  if (!scope) return { kind: "not-a-target" };

  // A loop body is a separate scope, and an edge across one compiles to
  // "unknown target node". Locally knowable, so it is simply not offered.
  const target = scope.nodes.find((n) => n.id === toID);
  if (!target) return { kind: "not-a-target" };

  // A trigger has no input.
  if (target.kind === "trigger") return { kind: "not-a-target" };

  // The one rule worth refusing mid-wire: a port is wired or terminated, never
  // both. Note this is NOT "already wired" — a port fans out freely, and
  // blocking a second edge from one port would invent a limit the kernel
  // does not have.
  const terminated = (scope.terminations ?? []).some(
    (t) => t.node === fromID && t.port === fromPort,
  );
  if (terminated) {
    return {
      kind: "refused",
      reason: `${fromPort} is declared terminated — a port is wired or terminated, never both. Remove the termination to wire it.`,
    };
  }

  return { kind: "ok" };
}

/** The scope that directly contains a node, searching nested bodies. */
export function scopeContaining(
  scope: GraphScope,
  nodeID: string,
): GraphScope | null {
  if (scope.nodes.some((n) => n.id === nodeID)) return scope;
  for (const n of scope.nodes) {
    if (n.body) {
      const found = scopeContaining(n.body, nodeID);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Add a node, with NO configuration filled in.
 *
 * Deliberately bare. Pre-filling a `repeat_until` with a plausible cap would
 * mean the operator never states an end — which is the exact thing the cap
 * exists to make them state. An added node arrives carrying the refusals that
 * say what it needs, which is the validator doing its job rather than the form
 * hiding it.
 */
export function addNode(
  doc: GraphDocument,
  kind: string,
  newID: () => string = defaultID,
): { doc: GraphDocument; id: string } {
  const id = newID();
  const node: GraphNode = { id, kind, name: "" };
  return {
    doc: { ...doc, scope: { ...doc.scope, nodes: [...doc.scope.nodes, node] } },
    id,
  };
}

/**
 * Add a node INTO the flow, after `afterID`.
 *
 * Adding a bare node is not adding a step. A node with no edge in is not part of
 * the pipeline — it never runs, it makes the graph refuse for a reason that
 * looks unrelated, and the operator has to discover the wiring gesture before
 * anything they added does anything.
 *
 * So this does what "add a step" means: attach it to the port the previous node
 * already leaves by, and re-point whatever that port used to feed at the new
 * node, so the step lands IN the chain rather than beside it.
 */
export function insertAfter(
  doc: GraphDocument,
  afterID: string,
  port: string,
  kind: string,
  newID: () => string = defaultID,
): { doc: GraphDocument; id: string } {
  const { doc: withNode, id } = addNode(doc, kind, newID);
  const scope = scopeContaining(withNode.scope, afterID);
  if (!scope) return { doc: withNode, id };

  // Whatever that port fed goes downstream of the new node instead. Dropping
  // those edges would silently detach the rest of the pipeline, which is a
  // bigger change than the operator asked for.
  const downstream = scope.edges
    .filter((e) => e.from === afterID && e.from_port === port)
    .map((e) => e.to);

  let next = withNode;
  for (const to of downstream) {
    next = unwire(next, afterID, port, to);
  }
  next = wire(next, afterID, port, id);
  // The new node's own primary output picks up what was there before.
  const out = outputPorts({ id, kind })[0];
  if (out) {
    for (const to of downstream) {
      next = wire(next, id, out, to);
    }
  }
  return { doc: next, id };
}

/**
 * The port a step is normally continued from — the one an "add after" follows.
 *
 * `out` where a node has one. For a gate there is no single answer, so there is
 * none: appending to a choice means choosing `true` or `false`, and picking one
 * silently would author a branch the operator did not choose.
 */
export function continuationPort(node: GraphNode): string | null {
  const ports = outputPorts(node);
  if (ports.includes("out")) return "out";
  if (ports.includes("done")) return "done";
  return null;
}

export function wire(
  doc: GraphDocument,
  fromID: string,
  fromPort: string,
  toID: string,
): GraphDocument {
  return mapScope(doc, (s) => {
    if (!s.nodes.some((n) => n.id === fromID)) return s;
    const exists = s.edges.some(
      (e) => e.from === fromID && e.from_port === fromPort && e.to === toID,
    );
    if (exists) return s;
    return {
      ...s,
      edges: [...s.edges, { from: fromID, from_port: fromPort, to: toID }],
    };
  });
}

export function unwire(
  doc: GraphDocument,
  fromID: string,
  fromPort: string,
  toID: string,
): GraphDocument {
  return mapScope(doc, (s) => ({
    ...s,
    edges: s.edges.filter(
      (e) =>
        !(e.from === fromID && e.from_port === fromPort && e.to === toID),
    ),
  }));
}

/**
 * Declare a port terminated, with a reason.
 *
 * The reason is required by the compiler and is operator-facing copy: it appears
 * verbatim in dry-run output and run summaries, which is why the editor previews
 * the sentence it lands in rather than treating it as a form field.
 */
export function terminate(
  doc: GraphDocument,
  nodeID: string,
  port: string,
  reason: string,
): GraphDocument {
  return mapScope(doc, (s) => {
    if (!s.nodes.some((n) => n.id === nodeID)) return s;
    const rest = (s.terminations ?? []).filter(
      (t) => !(t.node === nodeID && t.port === port),
    );
    return {
      ...s,
      // Wiring and terminating are exclusive, so declaring a termination clears
      // any edge from that port. Leaving both would store a document the
      // compiler refuses for a reason the operator did not choose.
      edges: s.edges.filter(
        (e) => !(e.from === nodeID && e.from_port === port),
      ),
      terminations: [...rest, { node: nodeID, port, reason }],
    };
  });
}

export function unterminate(
  doc: GraphDocument,
  nodeID: string,
  port: string,
): GraphDocument {
  return mapScope(doc, (s) => ({
    ...s,
    terminations: (s.terminations ?? []).filter(
      (t) => !(t.node === nodeID && t.port === port),
    ),
  }));
}

/**
 * Remove a node and everything that referred to it.
 *
 * Edges and terminations go with it. Leaving them would produce "unknown node"
 * refusals pointing at something no longer on screen, which is a refusal an
 * operator cannot act on.
 */
export function removeNode(doc: GraphDocument, nodeID: string): GraphDocument {
  return mapScope(doc, (s) => ({
    ...s,
    nodes: s.nodes.filter((n) => n.id !== nodeID),
    edges: s.edges.filter((e) => e.from !== nodeID && e.to !== nodeID),
    terminations: (s.terminations ?? []).filter((t) => t.node !== nodeID),
  }));
}

/** Rename a node. The id never changes — effect keys are derived from it. */
export function renameNode(
  doc: GraphDocument,
  nodeID: string,
  name: string,
): GraphDocument {
  return mapScope(doc, (s) => ({
    ...s,
    nodes: s.nodes.map((n) => (n.id === nodeID ? { ...n, name } : n)),
  }));
}

/** Set one config key on a node. */
export function setConfig(
  doc: GraphDocument,
  nodeID: string,
  key: string,
  value: unknown,
): GraphDocument {
  return mapScope(doc, (s) => ({
    ...s,
    nodes: s.nodes.map((n) =>
      n.id === nodeID ? { ...n, config: { ...(n.config ?? {}), [key]: value } } : n,
    ),
  }));
}

/**
 * Every distinct termination reason already used in this pipeline.
 *
 * The typeahead source. Scoped to this pipeline rather than the deployment
 * because it costs nothing — the graph is already in hand — and it catches the
 * common case, two similar discards in one graph. Cross-deployment convergence
 * would need its own read, for a tidiness benefit nobody has demonstrated yet.
 */
export function reasonsInUse(doc: GraphDocument): string[] {
  const out = new Set<string>();
  const walk = (s: GraphScope) => {
    for (const t of s.terminations ?? []) {
      if (t.reason.trim() !== "") out.add(t.reason);
    }
    for (const n of s.nodes) if (n.body) walk(n.body);
  };
  walk(doc.scope);
  return [...out].sort();
}

/** Ports on a node that are neither wired nor terminated. */
export function unwiredPorts(doc: GraphDocument, nodeID: string): string[] {
  const scope = scopeContaining(doc.scope, nodeID);
  if (!scope) return [];
  const node = scope.nodes.find((n) => n.id === nodeID);
  if (!node) return [];
  const wired = new Set(
    scope.edges.filter((e) => e.from === nodeID).map((e) => e.from_port),
  );
  const term = new Set(
    (scope.terminations ?? [])
      .filter((t) => t.node === nodeID)
      .map((t) => t.port),
  );
  return outputPorts(node).filter((p) => !wired.has(p) && !term.has(p));
}

/** Apply a transform to every scope in the document, outermost first. */
function mapScope(
  doc: GraphDocument,
  fn: (s: GraphScope) => GraphScope,
): GraphDocument {
  const walk = (s: GraphScope): GraphScope => {
    const next = fn(s);
    return {
      ...next,
      nodes: next.nodes.map((n) => (n.body ? { ...n, body: walk(n.body) } : n)),
    };
  };
  return { ...doc, scope: walk(doc.scope) };
}

function defaultID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n-${Math.random().toString(36).slice(2, 10)}`;
}
