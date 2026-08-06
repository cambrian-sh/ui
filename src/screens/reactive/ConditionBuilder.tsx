import { useRef, useState } from "react";
import { Input } from "@/design-system/components";
import { cn } from "@/design-system/lib/utils";
import type { NodeFields } from "@/ipc/types";
import {
  CONDITION_OPS,
  celToRows,
  rowsToCEL,
  type Combine,
  type ConditionRow,
} from "./conditionRows";
import { directlyReadable, exampleValueAt, pickerFields } from "./fieldSchema";

/**
 * A condition as rows: field · comparison · value.
 *
 * "magnitude is greater than 5" should be three clicks, not a line of syntax.
 * The rows GENERATE the expression — the raw form stays one toggle away, and
 * the compiler stays the only authority on what it means. A condition written
 * by hand that the rows cannot represent is shown as written, never
 * flattened: the builder steps aside rather than approximating.
 */
export function ConditionBuilder({
  value,
  fields,
  example,
  onChange,
  renderRaw,
}: {
  /** The CEL source of truth, from the node's config. */
  value: string;
  /** The kernel's projection at this node — the field dropdown's options. */
  fields: NodeFields | undefined;
  /** A real item, for example values as placeholders. */
  example?: Record<string, unknown> | null;
  onChange: (cel: string) => void;
  /** The advanced editor, rendered by the caller so inserts keep working. */
  renderRaw: () => React.ReactNode;
}) {
  const parsed = celToRows(value);
  // Raw mode is sticky once chosen; a hand-written condition starts there.
  const [rawMode, setRawMode] = useState(false);
  // Local rows so a half-typed value does not fight the round trip; re-derived
  // whenever the outside value moves away from what these rows produced.
  const [state, setState] = useState<{ rows: ConditionRow[]; combine: Combine }>(
    parsed ?? { rows: [], combine: "all" },
  );
  const lastEmitted = useRef(value);
  if (value !== lastEmitted.current) {
    // The value changed under us — a discard, an undo, another editor.
    lastEmitted.current = value;
    const again = celToRows(value);
    if (again) setState(again);
  }

  if (rawMode || parsed === null) {
    return (
      <div className="flex flex-col gap-1">
        {renderRaw()}
        {parsed === null ? (
          <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
            This condition is written as an expression the simple rows cannot
            show without changing it, so it is shown as written.
          </p>
        ) : (
          <button
            type="button"
            className="w-fit text-[10.5px] text-[var(--fg-muted)] underline underline-offset-2"
            onClick={() => setRawMode(false)}
          >
            back to the simple rows
          </button>
        )}
      </div>
    );
  }

  function emit(next: { rows: ConditionRow[]; combine: Combine }) {
    setState(next);
    const cel = rowsToCEL(next.rows, next.combine);
    lastEmitted.current = cel;
    onChange(cel);
  }

  const options = pickerFields(fields).filter((f) => directlyReadable(f.path));
  const { rows, combine } = state;

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const spec = CONDITION_OPS.find((o) => o.op === row.op) ?? CONDITION_OPS[0];
        const hint = example != null && row.path !== "" ? exampleValueAt(example, row.path) : null;
        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            {/* Field. A dropdown when the kernel knows what arrives; typed
                when it does not — never a dead control. */}
            {options.length > 0 ? (
              <select
                aria-label={`condition ${i} field`}
                value={row.path}
                onChange={(e) =>
                  emit({
                    combine,
                    rows: rows.map((r, j) => (j === i ? { ...r, path: e.target.value } : r)),
                  })
                }
                className="h-7 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 font-mono text-[11px] text-[var(--fg-secondary)] outline-none focus:border-[var(--color-accent-400)]"
              >
                <option value="">choose a field…</option>
                {options.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                    {f.types && f.types.length > 0 ? ` (${f.types.join("|")})` : ""}
                  </option>
                ))}
                {row.path !== "" && !options.some((f) => f.path === row.path) && (
                  <option value={row.path}>{row.path}</option>
                )}
              </select>
            ) : (
              <Input
                aria-label={`condition ${i} field`}
                value={row.path}
                placeholder="field, like properties.mag"
                onChange={(e) =>
                  emit({
                    combine,
                    rows: rows.map((r, j) => (j === i ? { ...r, path: e.target.value } : r)),
                  })
                }
                className="h-7 w-40 font-mono text-[11px]"
              />
            )}

            <select
              aria-label={`condition ${i} comparison`}
              value={row.op}
              onChange={(e) =>
                emit({
                  combine,
                  rows: rows.map((r, j) =>
                    j === i ? { ...r, op: e.target.value as ConditionRow["op"] } : r,
                  ),
                })
              }
              className="h-7 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 text-[11px] text-[var(--fg-secondary)] outline-none focus:border-[var(--color-accent-400)]"
            >
              {CONDITION_OPS.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>

            {spec.needsValue && (
              <Input
                aria-label={`condition ${i} value`}
                value={row.value}
                placeholder={hint !== null ? `e.g. ${hint}` : "value"}
                onChange={(e) =>
                  emit({
                    combine,
                    rows: rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                  })
                }
                className="h-7 w-32 font-mono text-[11px]"
              />
            )}

            <button
              type="button"
              aria-label={`remove condition ${i}`}
              className="text-[12px] text-[var(--fg-muted)] hover:text-[var(--status-err)]"
              onClick={() => emit({ combine, rows: rows.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="w-fit rounded-[4px] border border-dashed border-[var(--border-strong)] px-2 py-0.5 text-[10.5px] text-[var(--fg-secondary)] hover:border-[var(--color-accent-400)]"
          onClick={() =>
            emit({ combine, rows: [...rows, { path: "", op: "gt", value: "" }] })
          }
        >
          {rows.length === 0 ? "Add a condition" : "And also…"}
        </button>
        {rows.length > 1 && (
          <div className="flex items-center gap-1 text-[10.5px] text-[var(--fg-muted)]">
            <CombineButton
              active={combine === "all"}
              label="all must match"
              onClick={() => emit({ combine: "all", rows })}
            />
            <CombineButton
              active={combine === "any"}
              label="any may match"
              onClick={() => emit({ combine: "any", rows })}
            />
          </div>
        )}
      </div>

      {/* The sentence it becomes, verbatim — the source text the compiler
          sees, so nothing is hidden behind the rows. */}
      {value !== "" && (
        <p className="break-all font-mono text-[10px] leading-[1.5] text-[var(--fg-muted)]">
          = {value}
        </p>
      )}
      <button
        type="button"
        className="w-fit text-[10.5px] text-[var(--fg-muted)] underline underline-offset-2"
        onClick={() => setRawMode(true)}
      >
        edit as an expression
      </button>
    </div>
  );
}

function CombineButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[4px] border px-1.5 py-0.5",
        active
          ? "border-[var(--color-accent-400)] text-[var(--color-accent-400)]"
          : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
      )}
    >
      {label}
    </button>
  );
}
