import type { GraphNode } from "@/ipc/types";

/**
 * What is EDITABLE on each node kind, and as what.
 *
 * The mirror discipline of `nodeVocabulary.ts` applies: this file names keys
 * and input shapes so a form can render before any kernel call returns, and it
 * decides NOTHING — every rule about a value lives in the compiler, which the
 * canvas asks on each change. A key listed here that the compiler refuses
 * still lands in the draft; the refusal names the constraint and the fix.
 *
 * What is deliberately NOT here is as load-bearing as what is:
 *
 * - `save_to_memory`'s `ingress_id` and `mapping_revision` name WHICH mapping
 *   the save applies — the identity of the transform, pinned at arm time. A
 *   free-text box over them would let a typo silently apply a different
 *   transform to live data. They stay visible in the inspector and change
 *   through the studio's lifecycle, not through a form.
 * - `decide`'s prompt edits reset approval kernel-side; the form carries the
 *   key anyway because authoring it IS the point — the reset is the kernel's
 *   rule to enforce, not this file's to pre-empt.
 */

export type EditorFieldKind =
  /** One CEL expression. Gets the field picker. */
  | "expression"
  /** Plain text: a channel, a stream name, a worker id. */
  | "string"
  /** A number: caps, limits. */
  | "number"
  /** One of a closed set the runtime defines. */
  | "select"
  /** A list of plain strings: drops, tags, an allowlist. */
  | "stringList"
  /** A list of CEL expressions: switch cases. Each gets the picker. */
  | "exprList"
  /** field → CEL expression: a map's `set`. Values get the picker. */
  | "exprRecord";

export interface EditorField {
  key: string;
  label: string;
  kind: EditorFieldKind;
  /** For `select`: the closed set, verbatim from the runtime. */
  options?: string[];
  /** One sentence of guidance, in the operator's terms. */
  hint?: string;
  /**
   * A boolean expression — a CONDITION. These get the row builder
   * (field · comparison · value) with the raw expression one toggle away;
   * non-boolean expressions (a template, a URL, a computed field) are prose
   * with holes in it, which rows cannot say, so they stay textual.
   */
  boolean?: boolean;
}

/**
 * The editable surface of one kind, in reading order: the field that IS the
 * node first, footnotes after — the same ranking `configLines` renders by.
 */
export function editorFields(kind: string): EditorField[] {
  switch (kind) {
    case "choice":
      return [
        {
          key: "condition",
          label: "when",
          kind: "expression",
          boolean: true,
          hint: "True goes down `true`, everything else down `false`. Both ports must be wired or terminated with a reason.",
        },
      ];
    case "switch":
      return [
        {
          key: "cases",
          label: "cases",
          kind: "exprList",
          hint: "First match wins, in this order; no match falls to `default`. A switch with no cases is refused.",
        },
      ];
    case "map":
      return [
        {
          key: "set",
          label: "set",
          kind: "exprRecord",
          hint: "Each field is computed, then drops are removed — fixed order, so a set may read a field a drop removes.",
        },
        {
          key: "drop",
          label: "drop",
          kind: "stringList",
          hint: "Top-level fields to remove, with everything under them.",
        },
      ];
    case "split":
      return [
        {
          key: "over",
          label: "over",
          kind: "expression",
          hint: "One item becomes one per member of this list. Downstream, `item` is the member.",
        },
        { key: "max_items", label: "max items", kind: "number" },
      ];
    case "foreach":
      return [
        { key: "over", label: "over", kind: "expression" },
        { key: "max_iterations", label: "max iterations", kind: "number" },
      ];
    case "repeat_until":
      return [
        {
          key: "until",
          label: "until",
          kind: "expression",
          boolean: true,
          hint: "The stated end. The cap below is what makes this pipeline's work computable before it runs.",
        },
        { key: "max_iterations", label: "cap", kind: "number" },
        { key: "next_state_from", label: "next state from", kind: "string" },
      ];
    case "aggregate":
      return [
        {
          key: "mode",
          label: "mode",
          kind: "select",
          // The runtime's own vocabulary (applyAggregate). `count` is the
          // default when unset.
          options: ["count", "collect", "sum", "min", "max", "avg"],
        },
        {
          key: "field",
          label: "field",
          kind: "string",
          hint: "For sum/min/max/avg: the numeric field to fold. Items missing it contribute nothing.",
        },
      ];
    case "save_to_memory":
      return [
        { key: "stream", label: "stream", kind: "string" },
        {
          key: "key",
          label: "key",
          kind: "expression",
          hint: "Saves are idempotent on this. Two items deriving the same key collapse into one record — the collision a dry run checks.",
        },
        { key: "tags", label: "tags", kind: "stringList" },
      ];
    case "notify":
      return [
        { key: "channel", label: "to", kind: "string" },
        { key: "template", label: "says", kind: "expression" },
        {
          key: "delivery_mode",
          label: "delivery",
          kind: "select",
          options: ["at_least_once", "at_most_once"],
          hint: "at_least_once: duplicates possible, nothing lost. at_most_once: no duplicates, work can be lost. There is no safe default.",
        },
      ];
    case "emit_event":
      return [{ key: "event_type", label: "event", kind: "string" }];
    case "dispatch_agent":
      return [
        { key: "agent_id", label: "agent", kind: "string" },
        { key: "capability", label: "capability", kind: "string" },
        {
          key: "delivery_mode",
          label: "delivery",
          kind: "select",
          options: ["at_least_once", "at_most_once"],
        },
      ];
    case "start_plan":
      return [{ key: "goal", label: "goal", kind: "expression" }];
    case "decide":
      return [
        {
          key: "prompt",
          label: "asks",
          kind: "expression",
          hint: "Editing this resets any approval — an approval that survived a prompt edit would approve a different prompt.",
        },
        {
          key: "read_fields",
          label: "may read",
          kind: "stringList",
          hint: "The allowlist. Every field here is a field an author of the payload can use to talk to the model — narrower is safer.",
        },
        { key: "model", label: "model", kind: "string" },
      ];
    case "fetch":
      return [
        { key: "url", label: "url", kind: "expression" },
        { key: "method", label: "method", kind: "string" },
      ];
    case "run_turn":
      return [{ key: "worker", label: "worker", kind: "string" }];
    default:
      return [];
  }
}

/** Read a config value in the shape the editor for it expects. */
export function editorValue(node: GraphNode, field: EditorField): unknown {
  const raw = node.config?.[field.key];
  switch (field.kind) {
    case "stringList":
    case "exprList":
      return Array.isArray(raw) ? raw : [];
    case "exprRecord":
      return typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? raw
        : {};
    case "number":
      return typeof raw === "number" ? raw : "";
    default:
      return typeof raw === "string" ? raw : "";
  }
}
