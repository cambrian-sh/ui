import { celRef } from "./fieldSchema";

/**
 * The simple condition dialect: rows of field · comparison · value, combined
 * with all-of or any-of, rendered to CEL.
 *
 * # What this is, and is not
 *
 * It GENERATES the expression; the compiler remains the only thing that
 * decides what an expression means. The read-back (`celToRows`) is not a CEL
 * parser — it recognises exactly the shapes this builder writes, and answers
 * null for everything else, at which point the editor shows the expression as
 * text. A condition an operator wrote by hand in the advanced editor is never
 * mangled into rows that only approximate it: unparseable-to-rows means
 * "shown as written", not "flattened".
 *
 * That keeps the discipline this console holds everywhere: worst case the
 * builder steps aside; it can never disagree with the compiler about what a
 * condition does.
 */

/** One comparison an operator can say without writing an expression. */
export interface ConditionRow {
  /** Dotted item-relative path — `properties.mag`. */
  path: string;
  op: ConditionOp;
  /** The literal, as typed. Ignored for exists/missing. */
  value: string;
}

export type ConditionOp =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "exists"
  | "missing";

export type Combine = "all" | "any";

/** The operator vocabulary, in the operator's language. */
export const CONDITION_OPS: { op: ConditionOp; label: string; needsValue: boolean }[] = [
  { op: "gt", label: "is greater than", needsValue: true },
  { op: "gte", label: "is at least", needsValue: true },
  { op: "lt", label: "is less than", needsValue: true },
  { op: "lte", label: "is at most", needsValue: true },
  { op: "eq", label: "is exactly", needsValue: true },
  { op: "neq", label: "is not", needsValue: true },
  { op: "contains", label: "contains", needsValue: true },
  { op: "not_contains", label: "does not contain", needsValue: true },
  { op: "exists", label: "has a value", needsValue: false },
  { op: "missing", label: "is missing", needsValue: false },
];

const SYMBOL: Record<string, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  eq: "==",
  neq: "!=",
};

/**
 * Render rows as CEL. Rows with no field yet contribute nothing — a
 * half-finished row must not make the whole condition refuse.
 */
export function rowsToCEL(rows: ConditionRow[], combine: Combine): string {
  const parts = rows
    .filter((r) => r.path !== "")
    .map(rowToCEL)
    .filter((s): s is string => s !== null);
  return parts.join(combine === "all" ? " && " : " || ");
}

function rowToCEL(r: ConditionRow): string | null {
  const ref = celRef(r.path);
  switch (r.op) {
    case "exists":
      return hasCheck(r.path);
    case "missing":
      return "!" + hasCheck(r.path);
    case "contains":
      return `${ref}.contains(${literal(r.value, true)})`;
    case "not_contains":
      return `!${ref}.contains(${literal(r.value, true)})`;
    default: {
      if (r.value.trim() === "") return null;
      return `${ref} ${SYMBOL[r.op]} ${literal(r.value, false)}`;
    }
  }
}

/**
 * `has()` needs the parent and the member, so the last segment splits off.
 * Matches the kernel's own rendering (pipeline_generate.go hasCheck).
 */
function hasCheck(path: string): string {
  return `has(${celRef(path)})`;
}

/**
 * A value as a CEL literal. Numeric-looking text becomes a number — with a
 * decimal point, because `item.mag > 5` fails CEL's type check where
 * `item.mag > 5.0` passes, and "type a five" must not require knowing that.
 * `contains` always takes a string: it is a text question.
 */
function literal(v: string, asString: boolean): string {
  const t = v.trim();
  if (!asString && /^-?\d+(\.\d+)?$/.test(t)) {
    return t.includes(".") ? t : t + ".0";
  }
  if (!asString && (t === "true" || t === "false")) return t;
  return JSON.stringify(t);
}

/**
 * Read a condition BACK into rows — only if it is exactly a conjunction (or
 * disjunction) of shapes this builder writes. null means "show it as text".
 */
export function celToRows(
  src: string,
): { rows: ConditionRow[]; combine: Combine } | null {
  const s = src.trim();
  if (s === "") return { rows: [], combine: "all" };
  // Mixed combinators or grouping: not ours. Written by a person, kept as written.
  const hasAnd = s.includes("&&");
  const hasOr = s.includes("||");
  if (hasAnd && hasOr) return null;
  const combine: Combine = hasOr ? "any" : "all";
  const clauses = s.split(hasOr ? "||" : "&&").map((c) => c.trim());
  const rows: ConditionRow[] = [];
  for (const clause of clauses) {
    const row = clauseToRow(clause);
    if (row === null) return null;
    rows.push(row);
  }
  return { rows, combine };
}

const PATH = String.raw`item((?:\.[A-Za-z_][A-Za-z0-9_]*)+)`;
const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const STR = String.raw`"((?:[^"\\]|\\.)*)"`;

function clauseToRow(clause: string): ConditionRow | null {
  let m = clause.match(new RegExp(`^${PATH}\\s*(>=|<=|>|<|==|!=)\\s*(?:${NUM}|${STR})$`));
  if (m) {
    const op = ({ ">": "gt", ">=": "gte", "<": "lt", "<=": "lte", "==": "eq", "!=": "neq" } as const)[
      m[2] as ">" | ">=" | "<" | "<=" | "==" | "!="
    ];
    const value = m[3] !== undefined ? m[3] : unescapeJSON(m[4]);
    return { path: m[1].slice(1), op, value };
  }
  m = clause.match(new RegExp(`^(!?)${PATH}\\.contains\\(${STR}\\)$`));
  if (m) {
    return {
      path: m[2].slice(1),
      op: m[1] === "!" ? "not_contains" : "contains",
      value: unescapeJSON(m[3]),
    };
  }
  m = clause.match(new RegExp(`^(!?)has\\(${PATH}\\)$`));
  if (m) {
    return { path: m[2].slice(1), op: m[1] === "!" ? "missing" : "exists", value: "" };
  }
  return null;
}

function unescapeJSON(inner: string): string {
  try {
    return JSON.parse(`"${inner}"`) as string;
  } catch {
    return inner;
  }
}
