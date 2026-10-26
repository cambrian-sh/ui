import { useEffect, useRef, useState } from "react";
import { Input } from "@/design-system/components";
import { cn } from "@/design-system/lib/utils";
import type { GraphNode, NodeFields } from "@/ipc/types";
import { ConditionBuilder } from "./ConditionBuilder";
import { editorFields, editorValue, type EditorField } from "./nodeEditors";
import {
  celRef,
  directlyReadable,
  exampleValueAt,
  fanOutBase,
  pickerFields,
} from "./fieldSchema";

/**
 * Editing a node's configuration, with the arriving fields in reach.
 *
 * # The shape of the surface
 *
 * One form per kind, from the `nodeEditors` registry, with the field that IS
 * the node first — a choice is its condition, a map is its `set`. Under the
 * form sits the picker: the fields the kernel says exist AT THIS NODE, each a
 * chip that types itself into the focused expression. That ordering is the
 * n8n/Pipeline-Builder lesson in one move — data visible while authoring —
 * done against our own projection instead of a live tap.
 *
 * # What this form never does
 *
 * Validate. Every keystroke lands in the draft and the compiler is asked,
 * debounced, by the canvas; refusals render beside the node. A form that
 * pre-checked expressions would be a second reader of the language, and the
 * first time it disagreed with the compiler the operator would rightly stop
 * trusting one of them.
 */
export function NodeEditor({
  node,
  fields,
  fieldsUnchecked,
  onConfig,
  onRename,
  onFollowField,
  example = null,
}: {
  node: GraphNode;
  /** What the kernel projects at this node. undefined = not in the projection. */
  fields: NodeFields | undefined;
  /** True when no projection exists at all (old kernel, draft not compiling). */
  fieldsUnchecked: boolean;
  onConfig: (key: string, value: unknown) => void;
  onRename: (name: string) => void;
  onFollowField?: (path: string) => void;
  /** A real item this node received, for example values on the picker chips. */
  example?: Record<string, unknown> | null;
}) {
  const spec = editorFields(node.kind);

  // Where a picked field lands: the expression input that last had focus.
  // Falling back to the FIRST expression field means a chip click always does
  // something visible — for a choice that is the condition, which is the case
  // that matters.
  const insertTargets = useRef(new Map<string, (text: string) => void>());
  const lastFocused = useRef<string | null>(null);

  function insert(path: string) {
    const key =
      lastFocused.current !== null && insertTargets.current.has(lastFocused.current)
        ? lastFocused.current
        : [...insertTargets.current.keys()][0];
    if (key === undefined) {
      // No expression input is open — the condition builder's rows pick their
      // own fields. A chip click still does something visible: it follows the
      // field across the graph, because a control that silently does nothing
      // teaches people to stop clicking.
      onFollowField?.(path);
      return;
    }
    insertTargets.current.get(key)?.(celRef(path));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="type-label text-[var(--fg-muted)]">
          Name
        </label>
        <Input
          value={node.name ?? ""}
          placeholder={node.id}
          onChange={(e) => onRename(e.target.value)}
          className="h-7 text-[12px]"
        />
      </div>

      {spec.length === 0 ? (
        <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
          Nothing on this kind is configured here
          {node.kind === "trigger"
            ? " — a trigger is bound to its source by the studio, not drawn."
            : "."}
        </p>
      ) : (
        spec.map((f) => (
          <EditorRow
            key={f.key}
            node={node}
            field={f}
            fields={fields}
            example={example}
            onConfig={onConfig}
            registerInsert={(k, fn) => {
              if (fn === null) insertTargets.current.delete(k);
              else insertTargets.current.set(k, fn);
            }}
            onFocusExpr={(k) => {
              lastFocused.current = k;
            }}
          />
        ))
      )}

      <FieldPicker
        fields={fields}
        unchecked={fieldsUnchecked}
        hasExpressionTarget={spec.some(
          (f) => f.kind === "expression" || f.kind === "exprList" || f.kind === "exprRecord",
        )}
        onPick={insert}
        onFollowField={onFollowField}
        example={example}
      />
    </section>
  );
}

/* ── One field of the form ─────────────────────────────────────────────── */

function EditorRow({
  node,
  field,
  fields,
  example,
  onConfig,
  registerInsert,
  onFocusExpr,
}: {
  node: GraphNode;
  field: EditorField;
  fields: NodeFields | undefined;
  example: Record<string, unknown> | null;
  onConfig: (key: string, value: unknown) => void;
  registerInsert: (key: string, fn: ((text: string) => void) | null) => void;
  onFocusExpr: (key: string) => void;
}) {
  const value = editorValue(node, field);

  return (
    <div className="flex flex-col gap-1">
      <label className="type-label text-[var(--fg-muted)]">
        {field.label}
      </label>

      {field.kind === "expression" &&
        (field.boolean ? (
          // A CONDITION gets rows: field · comparison · value. The raw
          // expression stays one toggle away and is what actually lands in
          // the draft — the rows only generate it.
          <ConditionBuilder
            key={node.id}
            value={value as string}
            fields={fields}
            example={example}
            onChange={(cel) => onConfig(field.key, cel)}
            renderRaw={() => (
              <ExprInput
                id={field.key}
                value={value as string}
                onChange={(v) => onConfig(field.key, v)}
                registerInsert={registerInsert}
                onFocus={onFocusExpr}
              />
            )}
          />
        ) : (
          <ExprInput
            id={field.key}
            value={value as string}
            onChange={(v) => onConfig(field.key, v)}
            registerInsert={registerInsert}
            onFocus={onFocusExpr}
          />
        ))}

      {field.kind === "string" && (
        <Input
          value={value as string}
          onChange={(e) => onConfig(field.key, e.target.value)}
          className="h-7 font-mono text-[11.5px]"
        />
      )}

      {field.kind === "number" && (
        <Input
          type="number"
          value={value as number | ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            // An emptied cap is REMOVED, not zeroed: zero means "unset" to the
            // budget hierarchy, but storing it would make the choice look made.
            onConfig(field.key, e.target.value === "" || Number.isNaN(n) ? undefined : n);
          }}
          className="h-7 w-28 font-mono text-[11.5px] tabular-nums"
        />
      )}

      {field.kind === "select" && (
        <div className="flex flex-wrap gap-1">
          {(field.options ?? []).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onConfig(field.key, opt)}
              className={cn(
                "rounded-[4px] border px-2 py-0.5 font-mono text-[10.5px]",
                value === opt
                  ? "border-[var(--color-accent-400)] text-[var(--color-accent-400)]"
                  : "border-[var(--border-subtle)] text-[var(--fg-secondary)] hover:border-[var(--border-strong)]",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {field.kind === "stringList" && (
        <StringListInput
          value={value as string[]}
          onChange={(v) => onConfig(field.key, v)}
        />
      )}

      {field.kind === "exprList" && (
        <ExprListInput
          fieldKey={field.key}
          value={value as string[]}
          onChange={(v) => onConfig(field.key, v)}
          registerInsert={registerInsert}
          onFocus={onFocusExpr}
        />
      )}

      {field.kind === "exprRecord" && (
        <ExprRecordInput
          fieldKey={field.key}
          value={value as Record<string, unknown>}
          onChange={(v) => onConfig(field.key, v)}
          registerInsert={registerInsert}
          onFocus={onFocusExpr}
        />
      )}

      {field.hint && (
        <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">{field.hint}</p>
      )}
    </div>
  );
}

/* ── Expression input, insertable ──────────────────────────────────────── */

function ExprInput({
  id,
  value,
  onChange,
  registerInsert,
  onFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  registerInsert: (key: string, fn: ((text: string) => void) | null) => void;
  onFocus: (key: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    registerInsert(id, (text) => {
      const el = ref.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + text + el.value.slice(end);
      onChange(next);
      // Restore the caret after React re-renders the controlled value.
      requestAnimationFrame(() => {
        el.focus();
        const at = start + text.length;
        el.setSelectionRange(at, at);
      });
    });
    return () => registerInsert(id, null);
  });

  return (
    <textarea
      ref={ref}
      value={value}
      rows={Math.max(1, Math.min(5, value.split("\n").length))}
      spellCheck={false}
      onFocus={() => onFocus(id)}
      onChange={(e) => onChange(e.target.value)}
      aria-label={id}
      className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 font-mono text-[11.5px] leading-[1.5] text-[var(--color-accent-400)] outline-none focus:border-[var(--color-accent-400)]"
    />
  );
}

/* ── Lists and records ─────────────────────────────────────────────────── */

function StringListInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [pending, setPending] = useState("");
  function add() {
    const v = pending.trim();
    if (v === "" || value.includes(v)) return;
    onChange([...value, v]);
    setPending("");
  }
  return (
    <div className="flex flex-col gap-1">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {value.map((v) => (
            <li
              key={v}
              className="flex items-center gap-1 rounded-[3px] bg-[var(--bg-base)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--fg-secondary)]"
            >
              {v}
              <button
                type="button"
                aria-label={`remove ${v}`}
                className="text-[var(--fg-muted)] hover:text-[var(--status-err)]"
                onClick={() => onChange(value.filter((x) => x !== v))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        value={pending}
        placeholder="add, then Enter"
        onChange={(e) => setPending(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        className="h-7 font-mono text-[11px]"
      />
    </div>
  );
}

function ExprListInput({
  fieldKey,
  value,
  onChange,
  registerInsert,
  onFocus,
}: {
  fieldKey: string;
  value: string[];
  onChange: (v: string[]) => void;
  registerInsert: (key: string, fn: ((text: string) => void) | null) => void;
  onFocus: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {value.map((expr, i) => (
        <div key={i} className="flex items-start gap-1.5">
          {/* The index IS the port: case:0 routes where this row matches. */}
          <span className="mt-1.5 shrink-0 font-mono text-[10px] text-[var(--fg-muted)]">
            case:{i}
          </span>
          <div className="min-w-0 flex-1">
            <ExprInput
              id={`${fieldKey}:${i}`}
              value={typeof expr === "string" ? expr : ""}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
              registerInsert={registerInsert}
              onFocus={onFocus}
            />
          </div>
          <button
            type="button"
            aria-label={`remove case ${i}`}
            className="mt-1.5 text-[12px] text-[var(--fg-muted)] hover:text-[var(--status-err)]"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="w-fit rounded-[4px] border border-dashed border-[var(--border-strong)] px-2 py-0.5 text-[10.5px] text-[var(--fg-secondary)] hover:border-[var(--color-accent-400)]"
        onClick={() => onChange([...value, ""])}
      >
        Add a case
      </button>
      {/* Removing a case renumbers the ones after it, and case:N is a PORT —
          the wiring behind it moves too. Said here because nothing else on the
          screen would say it before the compiler does. */}
      {value.length > 1 && (
        <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
          Order is evaluation order, and each row is its own port — removing a
          case renumbers the ports after it, so their wiring needs re-checking.
        </p>
      )}
    </div>
  );
}

function ExprRecordInput({
  fieldKey,
  value,
  onChange,
  registerInsert,
  onFocus,
}: {
  fieldKey: string;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  registerInsert: (key: string, fn: ((text: string) => void) | null) => void;
  onFocus: (key: string) => void;
}) {
  // Rows are local state so renaming a field mid-keystroke does not re-sort
  // the form under the cursor; the record is emitted on every change.
  const [rows, setRows] = useState<{ k: string; v: string }[]>(() =>
    Object.entries(value).map(([k, v]) => ({ k, v: typeof v === "string" ? v : "" })),
  );

  function emit(next: { k: string; v: string }[]) {
    setRows(next);
    const rec: Record<string, unknown> = {};
    for (const r of next) {
      if (r.k.trim() !== "") rec[r.k.trim()] = r.v;
    }
    onChange(rec);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <Input
            value={row.k}
            placeholder="field"
            aria-label={`set field ${i}`}
            onChange={(e) =>
              emit(rows.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))
            }
            className="h-7 w-32 shrink-0 font-mono text-[11px]"
          />
          <div className="min-w-0 flex-1">
            <ExprInput
              id={`${fieldKey}:${i}`}
              value={row.v}
              onChange={(v) => emit(rows.map((r, j) => (j === i ? { ...r, v } : r)))}
              registerInsert={registerInsert}
              onFocus={onFocus}
            />
          </div>
          <button
            type="button"
            aria-label={`remove set ${row.k || i}`}
            className="mt-1.5 text-[12px] text-[var(--fg-muted)] hover:text-[var(--status-err)]"
            onClick={() => emit(rows.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="w-fit rounded-[4px] border border-dashed border-[var(--border-strong)] px-2 py-0.5 text-[10.5px] text-[var(--fg-secondary)] hover:border-[var(--color-accent-400)]"
        onClick={() => emit([...rows, { k: "", v: "" }])}
      >
        Add a field
      </button>
    </div>
  );
}

/* ── The picker ────────────────────────────────────────────────────────── */

/**
 * The fields the kernel says exist at this node.
 *
 * Three honest states, never conflated:
 * - known: chips, typed; direct ones insert, member (`*`) ones explain the
 *   fan-out that reaches them instead of inserting something that cannot
 *   compile;
 * - unknown WITH a reason: the kernel's own sentence, verbatim;
 * - unchecked: no projection at all — said as "unchecked", because rendering
 *   it as "no fields" would make an unprofiled trigger look like a fieldless
 *   payload.
 */
export function FieldPicker({
  fields,
  unchecked,
  hasExpressionTarget,
  onPick,
  onFollowField,
  example = null,
}: {
  fields: NodeFields | undefined;
  unchecked: boolean;
  hasExpressionTarget: boolean;
  onPick: (path: string) => void;
  onFollowField?: (path: string) => void;
  /**
   * A REAL item this node received (from the dry run over archived
   * deliveries), so each field can show the value it actually held. null when
   * no example exists — the chips then show path and type alone.
   */
  example?: Record<string, unknown> | null;
}) {
  const specs = pickerFields(fields);

  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-[var(--bg-base)] p-2.5">
      <h4 className="text-[11px] font-medium text-[var(--fg-secondary)]">
        Fields that arrive here
      </h4>

      {unchecked ? (
        <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
          Unchecked — the kernel has not projected this graph's fields (it may
          predate the field schema, or the draft does not compile yet). Not the
          same as "no fields".
        </p>
      ) : fields?.unknown ? (
        <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">{fields.unknown}</p>
      ) : specs.length === 0 ? (
        <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
          Nothing arrives here yet — the trigger has captured no deliveries to
          profile.
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1">
            {specs.map((f) => {
              const direct = directlyReadable(f.path);
              const base = fanOutBase(f.path);
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    title={
                      direct
                        ? hasExpressionTarget
                          ? `insert ${celRef(f.path)}`
                          : f.path
                        : `a member field — fan out over item.${base} to reach it`
                    }
                    onClick={() => {
                      // In an editor, a direct chip types itself; everywhere
                      // else — and always for member fields — clicking means
                      // "follow this field across the graph".
                      if (direct && hasExpressionTarget) onPick(f.path);
                      else onFollowField?.(f.path);
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 font-mono text-[10.5px]",
                      direct
                        ? "bg-[var(--bg-surface)] text-[var(--fg-secondary)] hover:text-[var(--color-accent-400)]"
                        : "bg-[var(--bg-surface)] text-[var(--fg-muted)] opacity-70",
                    )}
                  >
                    {f.path}
                    {f.types && f.types.length > 0 && (
                      <span className="type-label text-[var(--fg-muted)]">
                        {f.types.join("|")}
                      </span>
                    )}
                    {example !== null &&
                      (() => {
                        // The value this field held in a real delivery — the
                        // difference between authoring against a schema and
                        // authoring against the data.
                        const v = exampleValueAt(example, f.path);
                        return v !== null ? (
                          <span className="text-[9.5px] normal-case text-[var(--color-accent-400)] opacity-80">
                            = {v}
                          </span>
                        ) : null;
                      })()}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
            {hasExpressionTarget
              ? "Click a field to type it into the focused expression. "
              : ""}
            Dimmed fields are array members — reachable after a fan-out, not
            directly. Projected by the kernel from what this trigger has
            actually received, walked through every step above this one.
          </p>
        </>
      )}
    </div>
  );
}
