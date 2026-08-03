import type { GraphNode } from "@/ipc/types";

/**
 * What a node actually does to the data.
 *
 * The canvas without this is a list of verbs: it says a choice is there, not
 * what it tests; that a map runs, not which fields it rewrites. Every one of
 * those answers is already in `node.config` — the graph document carries the
 * whole authored configuration — so not rendering it was the difference between
 * a diagram of the shape and a diagram of the pipeline.
 *
 * These read the config; they never interpret it. The expression language is the
 * compiler's, and a console that started evaluating CEL to "explain" a condition
 * would be a second implementation of the thing that decides.
 */

/** One configured fact about a node: a label and the authored value. */
export interface ConfigLine {
  label: string;
  /** The authored value, verbatim. Rendered monospace — it is source text. */
  value: string;
  /** True when the value is an expression rather than a literal or a path. */
  expression?: boolean;
}

/**
 * The lines worth showing for a node, in the order they are read.
 *
 * Per kind rather than generic key/value dumping, because the keys are not
 * equally interesting: a choice's `condition` is the node, and its
 * `on_missing` is a footnote. A dump gives them the same weight and buries the
 * one an operator came to read.
 */
export function configLines(node: GraphNode): ConfigLine[] {
  const c = node.config ?? {};
  const str = (k: string): string | null =>
    typeof c[k] === "string" ? (c[k] as string) : null;
  const num = (k: string): string | null =>
    typeof c[k] === "number" ? String(c[k]) : null;

  const out: ConfigLine[] = [];
  const push = (label: string, value: string | null, expression = false) => {
    if (value !== null && value !== "") out.push({ label, value, expression });
  };

  switch (node.kind) {
    case "choice":
      push("when", str("condition"), true);
      break;

    case "switch": {
      const cases = Array.isArray(c.cases) ? (c.cases as unknown[]) : [];
      cases.forEach((expr, i) => {
        push(`case ${i}`, typeof expr === "string" ? expr : JSON.stringify(expr), true);
      });
      break;
    }

    case "map": {
      const set = isRecord(c.set) ? c.set : {};
      for (const [field, expr] of Object.entries(set)) {
        push(field, typeof expr === "string" ? expr : JSON.stringify(expr), true);
      }
      const drop = Array.isArray(c.drop) ? (c.drop as unknown[]) : [];
      if (drop.length > 0) push("drops", drop.join(", "));
      break;
    }

    case "split":
    case "foreach":
      push("over", str("over"), true);
      push("max items", num("max_items") ?? num("max_iterations"));
      break;

    case "repeat_until":
      push("until", str("until"), true);
      // The cap is the thing a loop is refused without, so it reads as a line
      // rather than being left to the refusal to mention.
      push("cap", num("max_iterations"));
      push("next state from", str("next_state_from"));
      break;

    case "aggregate":
      push("group by", str("group_by") ?? str("by"), true);
      push("window", str("window"));
      break;

    case "save_to_memory":
      push("stream", str("stream"));
      push("key", str("key") ?? str("projection_key"), true);
      push("tags", joinList(c.tags));
      break;

    case "notify":
      push("to", str("channel") ?? str("to") ?? str("target"));
      push("says", str("template") ?? str("message"), true);
      break;

    case "emit_event":
      push("event", str("event_type") ?? str("type"));
      break;

    case "dispatch_agent":
      push("agent", str("agent_id") ?? str("agent"));
      push("capability", str("capability"));
      break;

    case "start_plan":
      push("goal", str("goal") ?? str("objective"), true);
      break;

    case "decide":
      push("asks", str("prompt") ?? str("condition"), true);
      push("may read", joinList(c.read_fields));
      push("model", str("model"));
      break;

    case "fetch":
      push("url", str("url"), true);
      push("method", str("method"));
      break;

    case "run_turn":
      push("worker", str("worker"));
      break;

    case "trigger":
      break;
  }

  // Anything configured that the cases above do not name still shows, at the
  // bottom. A key nobody rendered is a key an operator cannot review, and the
  // whole point of this surface is that nothing about a pipeline is invisible.
  const named = new Set(namedKeys(node.kind));
  for (const [k, v] of Object.entries(c)) {
    if (named.has(k)) continue;
    push(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  return out;
}

/** A one-line summary for the node card, where there is room for one thing. */
export function configSummary(node: GraphNode): ConfigLine | null {
  const lines = configLines(node);
  return lines.length > 0 ? lines[0] : null;
}

function namedKeys(kind: string): string[] {
  switch (kind) {
    case "choice":
      return ["condition"];
    case "switch":
      return ["cases"];
    case "map":
      return ["set", "drop"];
    case "split":
      return ["over", "max_items", "max_iterations"];
    case "foreach":
      return ["over", "max_items", "max_iterations"];
    case "repeat_until":
      return ["until", "max_iterations", "next_state_from", "initial_state"];
    case "aggregate":
      return ["group_by", "by", "window"];
    case "save_to_memory":
      return ["stream", "key", "projection_key", "tags"];
    case "notify":
      return ["channel", "to", "target", "template", "message"];
    case "emit_event":
      return ["event_type", "type"];
    case "dispatch_agent":
      return ["agent_id", "agent", "capability"];
    case "start_plan":
      return ["goal", "objective"];
    case "decide":
      return ["prompt", "condition", "read_fields", "model"];
    case "fetch":
      return ["url", "method"];
    case "run_turn":
      return ["worker"];
    default:
      return [];
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function joinList(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ");
}
