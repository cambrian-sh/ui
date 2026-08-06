import type { FieldSchema, FieldSpec, NodeFields } from "@/ipc/types";

/**
 * The per-node field schema (kernel contract 0091), and the reads over it.
 *
 * Everything here is presentation over a projection the KERNEL computed — the
 * compiler walked the trigger's capture profile through every transform and
 * reported, per node, what exists, what is read, written and dropped. Nothing
 * in this file derives a schema fact of its own; deriving one client-side
 * would be a second reader of the language, and the two would disagree the
 * first time the runtime changed.
 */

/** Parse the wire form. "" means UNCHECKED — never "no fields". */
export function parseFieldSchema(json: string | undefined | null): FieldSchema | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as FieldSchema;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Whether a field path is directly readable in an expression at this node.
 *
 * A path with a `*` segment is a MEMBER path: `features.*.properties.mag`
 * exists in the document, but an expression cannot reach through the array —
 * the graph reaches it by fanning out over `features` first. The picker still
 * shows these, dimmed, with that explanation: hiding them would make the most
 * common question ("where did the per-quake fields go?") unanswerable.
 */
export function directlyReadable(path: string): boolean {
  return !path.split(".").includes("*");
}

/** The CEL spelling of a field reference, matching the kernel's own rendering. */
export function celRef(path: string): string {
  return (
    "item." +
    path
      .split(".")
      .map((seg) => (/^\d+$/.test(seg) ? `[${seg}]` : seg))
      .join(".")
      .replace(/\.\[/g, "[")
  );
}

/**
 * For a member path, the fan-out that makes it reachable: the longest prefix
 * ending at the first `*`. `features.*.properties.mag` → `features`.
 */
export function fanOutBase(path: string): string | null {
  const segments = path.split(".");
  const star = segments.indexOf("*");
  if (star <= 0) return null;
  return segments.slice(0, star).join(".");
}

/** How one node relates to a followed field. */
export type LineageRole = "reads" | "writes" | "drops" | "routes on";

/**
 * Which nodes touch a field, and how — the join that makes lineage clickable.
 *
 * All inputs are kernel facts: reads from the compiled AST (D36), writes and
 * drops from the projection. "Routes on" is a read on a gate — separated
 * because an operator following a field wants "this DECIDES with it" lit
 * differently from "this copies it".
 */
export function lineageOf(
  schema: FieldSchema,
  path: string,
  gateNodes: ReadonlySet<string>,
): Map<string, LineageRole> {
  const out = new Map<string, LineageRole>();
  for (const [nodeID, nf] of Object.entries(schema)) {
    // Order matters: a node that both reads and drops a field is doing the
    // drop ON the read, and the destructive fact is the one to surface.
    if (touches(nf.drops, path)) {
      out.set(nodeID, "drops");
      continue;
    }
    if (touches(nf.writes, path)) {
      out.set(nodeID, "writes");
      continue;
    }
    if (touches(nf.reads, path)) {
      out.set(nodeID, gateNodes.has(nodeID) ? "routes on" : "reads");
    }
  }
  return out;
}

/**
 * Whether a declared path touches the followed one. Prefix-aware in both
 * directions: dropping `features` drops `features.*.properties.mag`, and
 * reading `properties.mag` is reading under `properties`.
 */
function touches(declared: string[] | undefined, path: string): boolean {
  if (!declared) return false;
  return declared.some(
    (d) =>
      d === path ||
      d === "*" ||
      path.startsWith(d + ".") ||
      d.startsWith(path + "."),
  );
}

/**
 * One sentence of tallies for the banner: "2 read · 1 routes on · 1 drops".
 * A zero is content only when SOMETHING touches the field; when nothing does,
 * that absence is the finding and it is said as itself.
 */
export function lineageSummary(lineage: Map<string, LineageRole>): string {
  if (lineage.size === 0) return "nothing in this graph touches it";
  const tally = new Map<LineageRole, number>();
  for (const role of lineage.values()) {
    tally.set(role, (tally.get(role) ?? 0) + 1);
  }
  const one: Record<LineageRole, string> = {
    "routes on": "routes on it",
    reads: "reads it",
    writes: "writes it",
    drops: "drops it",
  };
  const many: Record<LineageRole, string> = {
    "routes on": "route on it",
    reads: "read it",
    writes: "write it",
    drops: "drop it",
  };
  const order: LineageRole[] = ["routes on", "reads", "writes", "drops"];
  return order
    .filter((r) => tally.has(r))
    .map((r) => `${tally.get(r)} ${tally.get(r) === 1 ? one[r] : many[r]}`)
    .join(" · ");
}

/**
 * The value a field held in a real example item, rendered for a chip.
 *
 * `*` segments read the FIRST member — an example is an illustration, not a
 * report, and the first member illustrates. null when the path is absent,
 * which the chip renders as nothing rather than as a claim.
 */
export function exampleValueAt(obj: unknown, path: string): string | null {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined) return null;
    if (seg === "*") {
      if (!Array.isArray(cur) || cur.length === 0) return null;
      cur = cur[0];
      continue;
    }
    if (Array.isArray(cur) && /^\d+$/.test(seg)) {
      cur = cur[Number(seg)];
      continue;
    }
    if (typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (cur === undefined) return null;
  if (typeof cur === "object" && cur !== null) {
    return Array.isArray(cur) ? `[${cur.length} items]` : "{…}";
  }
  const s = JSON.stringify(cur) ?? "null";
  return s.length > 28 ? s.slice(0, 27) + "…" : s;
}

/** Fields available at a node, sorted with directly-readable ones first. */
export function pickerFields(nf: NodeFields | undefined): FieldSpec[] {
  const available = nf?.available ?? [];
  return [...available].sort((a, b) => {
    const da = directlyReadable(a.path) ? 0 : 1;
    const db = directlyReadable(b.path) ? 0 : 1;
    if (da !== db) return da - db;
    return a.path.localeCompare(b.path);
  });
}
