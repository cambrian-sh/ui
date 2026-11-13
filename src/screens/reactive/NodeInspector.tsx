import { NodeItems } from "./NodeItems";
import { Button, ScrollArea } from "@/design-system/components";
import { cn } from "@/design-system/lib/utils";
import type {
  GraphNode,
  GraphScope,
  NodeFields,
  PipelineNodeExample,
  PipelineRefusal,
} from "@/ipc/types";
import { configLines } from "./nodeConfig";
import { NodeEditor, FieldPicker } from "./NodeEditor";
import { StepFlow } from "./StepFlow";
import { ItemHistory } from "./ItemHistory";
import {
  FAMILY_LABEL,
  FAMILY_TONE,
  SPEC_BY_KIND,
  outputPorts,
  portTone,
} from "./nodeVocabulary";

/**
 * The node inspector — data-driven from the selected node.
 *
 * Its most valuable element is the last one: what this node is telling you.
 * Everything above describes the node; that panel says what the node's own
 * numbers imply, which is the part an operator cannot derive by reading the
 * graph.
 */
export function NodeInspector({
  node,
  scope,
  refusals,
  counts,
  countsAreDryRun,
  reads,
  pipelineID,
  selectedItem = null,
  onSelectItem,
  onSelectNode,
  seenHere = null,
  editing = false,
  fields,
  fieldsUnchecked = true,
  onConfig,
  onRename,
  onFollowField,
  examples = [],
  exampleSource = "",
}: {
  node: GraphNode | null;
  scope: GraphScope | null;
  refusals: PipelineRefusal[];
  counts: Record<string, number>;
  countsAreDryRun: boolean;
  reads: string[];
  pipelineID: string;
  /** When set, the panel shows this item's journey instead of the node. */
  selectedItem?: string | null;
  onSelectItem?: (itemKey: string | null) => void;
  onSelectNode?: (nodeID: string) => void;
  /** How many items the live counters have seen at the selected node. */
  seenHere?: number | null;
  /** When true the panel edits the node rather than describing it. */
  editing?: boolean;
  /** The kernel's field projection AT this node (contract 0091). */
  fields?: NodeFields;
  /** True when no projection exists at all — rendered as "unchecked". */
  fieldsUnchecked?: boolean;
  onConfig?: (nodeID: string, key: string, value: unknown) => void;
  onRename?: (nodeID: string, name: string) => void;
  /** Follow a field across the graph (lineage). */
  onFollowField?: (path: string) => void;
  /** Real items this node received, from the dry run (contract 0092). */
  examples?: PipelineNodeExample[];
  /** What the dry run replayed — archived deliveries or redacted captures. */
  exampleSource?: string;
}) {
  return (
    <aside className="hidden w-[400px] shrink-0 border-l border-[var(--border-subtle)] xl:block">
      <ScrollArea className="h-full">
        <div className="p-4 pb-10">
          {/* An ITEM outranks a node when one is selected. Following a specific
              delivery is a narrower question than inspecting a node, and
              somebody who asked it does not want the answer buried under a
              description of where it happened to be. */}
          {selectedItem ? (
            <ItemHistory
              pipelineID={pipelineID}
              itemKey={selectedItem}
              onClear={() => onSelectItem?.(null)}
              onSelectNode={onSelectNode}
            />
          ) : node === null ? (
            <p className="text-[12px] leading-[1.6] text-[var(--fg-muted)]">
              Select a node to inspect it. Counts are per port, not per node — a
              node that ran 52 times and sent 47 one way tells you far more than
              a node that ran 52 times.
            </p>
          ) : (
            <Detail
              node={node}
              scope={scope}
              refusals={refusals.filter((r) => r.node === node.id)}
              counts={counts}
              countsAreDryRun={countsAreDryRun}
              reads={reads}
              pipelineID={pipelineID}
              onSelectItem={onSelectItem}
              seenHere={seenHere}
              editing={editing}
              fields={fields}
              fieldsUnchecked={fieldsUnchecked}
              onConfig={onConfig}
              onRename={onRename}
              onFollowField={onFollowField}
              examples={examples}
              exampleSource={exampleSource}
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function Detail({
  node,
  scope,
  refusals,
  counts,
  countsAreDryRun,
  reads,
  pipelineID,
  onSelectItem,
  seenHere = null,
  editing = false,
  fields,
  fieldsUnchecked = true,
  onConfig,
  onRename,
  onFollowField,
  examples = [],
  exampleSource = "",
}: {
  node: GraphNode;
  scope: GraphScope | null;
  refusals: PipelineRefusal[];
  counts: Record<string, number>;
  countsAreDryRun: boolean;
  reads: string[];
  pipelineID: string;
  onSelectItem?: (itemKey: string | null) => void;
  /** How many items the live counters have seen at this node. */
  seenHere?: number | null;
  editing?: boolean;
  fields?: NodeFields;
  fieldsUnchecked?: boolean;
  onConfig?: (nodeID: string, key: string, value: unknown) => void;
  onRename?: (nodeID: string, name: string) => void;
  onFollowField?: (path: string) => void;
  examples?: PipelineNodeExample[];
  exampleSource?: string;
}) {
  const spec = SPEC_BY_KIND[node.kind];
  const family = spec?.family ?? "transform";
  const ports = outputPorts(node);
  // A REAL item this node received, parsed once — the picker's example values
  // and the data panel both read it.
  const exampleItem = (() => {
    for (const ex of examples) {
      if (ex.value_json === "") continue;
      try {
        const parsed = JSON.parse(ex.value_json) as unknown;
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // fall through to the next example
      }
    }
    return null;
  })();
  // Whether the table has anything at all, and where it came from. The footer
  // used to say "run a dry run to get them" beside a column full of live
  // numbers, because it only ever considered the dry run.
  const hasCounts = ports.some(
    (p) => counts[`${node.id}.${p}`] !== undefined,
  );
  const countsAreLive = hasCounts && !countsAreDryRun;
  const destinations = new Map<string, string>();
  const terminated = new Map<string, string>();
  if (scope) {
    for (const e of scope.edges) {
      if (e.from === node.id) destinations.set(e.from_port, e.to);
    }
    for (const t of scope.terminations ?? []) {
      if (t.node === node.id) terminated.set(t.port, t.reason);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="type-section-title">{node.name || node.id}</h2>
          <span
            className="type-label"
            style={{ color: FAMILY_TONE[family] }}
          >
            {FAMILY_LABEL[family]}
          </span>
        </div>
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
          {node.kind} · {node.id}
        </span>
        {spec && (
          <p className="mt-2 text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
            {spec.lead}
          </p>
        )}
      </div>

      {/* 1. The refusal block, shown only when there is one. */}
      {refusals.length > 0 && (
        <section
          className="rounded-[var(--radius-lg)] p-3 tint-wash tint-ring"
          style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
        >
          <h3 className="text-[12px] font-medium text-[var(--status-err)]">
            {refusals.length === 1 ? "This node is refused" : "This node has refusals"}
          </h3>
          <ul className="mt-1 flex flex-col gap-1.5">
            {refusals.map((r, i) => (
              <li key={i} className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
                <span className="font-mono text-[10px] text-[var(--status-err)]">
                  {r.constraint}
                  {r.port && ` · ${r.port}`}
                </span>{" "}
                {r.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* WHAT HAS ACTUALLY PASSED THROUGH, first.
          It was at the bottom, below the fold, which put the only MOVING thing
          on the screen where an operator had to scroll to find it. Everything
          under it — the config, the ports, the policy — is static and will
          still be there in a minute; this will not. The refusal outranks it
          only because a refused node has not run at all. */}
      {pipelineID !== "" && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[12px] font-medium">What has passed through</h3>
          <StepFlow
            pipelineID={pipelineID}
            nodeID={node.id}
            onSelectItem={onSelectItem ? (k) => onSelectItem(k) : undefined}
            seen={seenHere}
          />
        </section>
      )}

      {/* THE DATA ITSELF. Counts say how much; this says WHAT — the item as
          this node received it, from replaying what actually arrived. It is
          the panel that turns "a choice is here" into "a choice deciding on
          magnitude 5.3, '62 km W of Tobelo, Indonesia'". */}
      {examples.length > 0 && (
        <DataThrough examples={examples} source={exampleSource} />
      )}

      {/* What it does to the data.
          Read mode shows every configured value verbatim — reviewing a
          pipeline means reading the expressions, not counting the nodes.
          Edit mode replaces the verbatim view with the same values as inputs,
          the arriving fields one click away. The compiler still rules: every
          keystroke lands in the draft and refusals render above. */}
      {editing && onConfig && onRename ? (
        <NodeEditor
          node={node}
          fields={fields}
          fieldsUnchecked={fieldsUnchecked}
          onConfig={(key, value) => onConfig(node.id, key, value)}
          onRename={(name) => onRename(node.id, name)}
          onFollowField={onFollowField}
          example={exampleItem}
        />
      ) : (
        <>
          <ConfiguredAs node={node} />
          {/* The same projection the editor's picker reads, here to answer the
              reviewer's question: what exists at this step? Clicking a field
              follows it across the graph. */}
          <FieldPicker
            fields={fields}
            unchecked={fieldsUnchecked}
            hasExpressionTarget={false}
            onPick={() => {}}
            onFollowField={onFollowField}
            example={exampleItem}
          />
        </>
      )}

      {/* The fields this step reaches into, from the compiled AST. The config
          shows the expression; this shows what it touches — which is what gets
          compared against the schema of what arrives. */}
      {reads.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[12px] font-medium">Fields it reads</h3>
          <ul className="flex flex-wrap gap-1">
            {reads.map((p) => (
              <li
                key={p}
                className="rounded-[3px] bg-[var(--bg-base)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--fg-secondary)]"
              >
                {p}
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
            Taken from the compiled expression, not from its text — so a path
            inside a string literal is not listed, and a field reached through an
            index has no static path to list.
          </p>
        </section>
      )}

      {/* 2. Ports table. */}
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[12px] font-medium">Ports</h3>
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="text-left text-[10px] text-[var(--fg-muted)]">
              {/* The gutter is not decoration: without it "refused" and
                  "terminated" ran together as `refusedterminated`, which reads
                  as one unknown word rather than as a port and its fate. */}
              <th className="pb-1 pr-3 font-normal">port</th>
              <th className="pb-1 pr-3 font-normal">where it goes</th>
              <th className="pb-1 text-right font-normal">count</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((port) => {
              const to = destinations.get(port);
              const reason = terminated.get(port);
              const unwired = to === undefined && reason === undefined;
              const n = counts[`${node.id}.${port}`];
              return (
                <tr
                  key={port}
                  className="border-t border-[var(--border-subtle)] align-top"
                >
                  <td className="py-1 pr-3 font-mono">
                    <span style={{ color: portTone(port, { unwired }) }}>
                      {port}
                    </span>
                  </td>
                  <td className="py-1 pr-3 text-[var(--fg-secondary)]">
                    {to !== undefined ? (
                      <span className="font-mono text-[10.5px]">{to}</span>
                    ) : reason !== undefined ? (
                      <span className="text-[var(--fg-muted)]">
                        terminated — “{reason}”
                      </span>
                    ) : (
                      <span className="text-[var(--status-err)]">
                        nowhere — wire it, or terminate it with a reason
                      </span>
                    )}
                  </td>
                  {/* A ZERO IS CONTENT.
                      Once anything is counted for this node, a port with no
                      entry did not carry nothing-we-know-of — it carried
                      nothing, and that is frequently the finding: the branch
                      you built for errors has never once been taken. An em
                      dash there hides it behind "no data". The dash survives
                      only where it is true: nothing has been counted at all. */}
                  <td
                    className={cn(
                      "py-1 text-right font-mono tabular-nums",
                      n === undefined && hasCounts
                        ? "text-[var(--fg-muted)] opacity-60"
                        : "text-[var(--fg-muted)]",
                    )}
                  >
                    {n ?? (hasCounts ? 0 : "—")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
          Counts are per port, not per node. A node that ran 52 times and sent 47
          one way tells you far more than a node that ran 52 times.
          {hasCounts
            ? countsAreLive
              ? " These are live counts, from traffic since the kernel started."
              : " These are dry-run counts over the deliveries captured now, not live traffic."
            : " No counts yet — nothing has run through this node, and no dry run has been done."}
        </p>
      </section>

      {/* 3. Policy, for the node that reads text it did not write. */}
      {node.kind === "decide" && <ReadPolicy node={node} />}

      {/* 4. What this node is telling you. */}
      <Telling node={node} counts={counts} terminated={terminated} />

      {/* 5. Actions.
          Each one carries ITS OWN reason. They rendered as two bare ghost
          buttons over a single paragraph, so the text looked like a caption for
          both and neither read as a control at all — the operator could not
          tell what was disabled or which explanation belonged to what. */}
      <section className="flex flex-col gap-2">
        <UnavailableAction
          label="Test this node on a pinned input"
          reason={
            SPEC_BY_KIND[node.kind]?.family === "effect"
              ? "Disabled on an effect node deliberately: a test that silently faked the save would be the most misleading result this product could give. Use a dry run, which records every effect and performs none."
              : "Node tests arrive with the authoring turn — nothing in this kernel runs a single node against a pinned input yet."
          }
        />
        {/* The other half of inspecting a node: not what it would do, but what
            actually reached it. This was a disabled button explaining that the
            kernel did not project the list — it does now, and the answer an
            operator wants ("what did it write?") leads. */}
        <NodeItems pipelineID={pipelineID} nodeID={node.id} />
      </section>
    </div>
  );
}

/**
 * Real items this node received, from replaying what actually arrived.
 *
 * The value leads and the JSON is secondary: `magnitude 5.3 · place "62 km W
 * of Tobelo, Indonesia"` is readable by anyone; the raw envelope is there for
 * the minority case where the summary is not enough. The source line matters
 * as much as the data — over redacted captures every value is a type token,
 * and a reader must know they are looking at shapes rather than facts.
 */
function DataThrough({
  examples,
  source,
}: {
  examples: PipelineNodeExample[];
  source: string;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[12px] font-medium">The data through this step</h3>
      <ul className="flex flex-col gap-1.5">
        {examples.map((ex, i) => (
          <li
            key={`${ex.item_key}-${i}`}
            className="rounded-[var(--radius-md)] bg-[var(--bg-base)] px-2.5 py-1.5"
          >
            <ExampleSummary ex={ex} />
          </li>
        ))}
      </ul>
      {source !== "" && (
        <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
          From a rehearsal over {source} — the same material the live pipeline
          receives, with every effect shadowed.
        </p>
      )}
    </section>
  );
}

function ExampleSummary({ ex }: { ex: PipelineNodeExample }) {
  const parsed = (() => {
    try {
      return ex.value_json !== "" ? (JSON.parse(ex.value_json) as unknown) : null;
    } catch {
      return null;
    }
  })();

  // The leading line: up to four scalar fields, in the operator's terms.
  const facts: string[] = [];
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (facts.length >= 4) break;
      if (v === null || typeof v === "object") continue;
      const s = JSON.stringify(v) ?? "";
      facts.push(`${k} ${s.length > 32 ? s.slice(0, 31) + "…" : s}`);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {facts.length > 0 ? (
        <span className="text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">
          {facts.join(" · ")}
        </span>
      ) : (
        <span className="text-[11px] text-[var(--fg-muted)]">
          {ex.value_json !== "" ? "structured item" : "receipt only"}
        </span>
      )}
      {ex.value_json !== "" && (
        <details>
          <summary className="cursor-pointer text-[10px] text-[var(--fg-muted)]">
            the whole item
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-[3px] bg-[var(--bg-surface)] p-1.5 font-mono text-[9.5px] leading-[1.5] text-[var(--fg-secondary)]">
            {prettyJSON(ex.value_json)}
          </pre>
        </details>
      )}
      {ex.result_json !== "" && (
        <details>
          <summary className="cursor-pointer text-[10px] text-[var(--fg-muted)]">
            what this step reported back
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-[3px] bg-[var(--bg-surface)] p-1.5 font-mono text-[9.5px] leading-[1.5] text-[var(--fg-secondary)]">
            {prettyJSON(ex.result_json)}
          </pre>
        </details>
      )}
    </div>
  );
}

function prettyJSON(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * An action that exists in the design but not yet in the kernel.
 *
 * Rendered as a real, visibly disabled control with its reason attached rather
 * than as ghost text: an operator has to be able to tell the difference between
 * "this is a button you cannot press yet, and here is why" and "this is a label".
 * The reason sits under the control it explains, because two reasons under two
 * buttons is the only arrangement where neither is ambiguous.
 */
function UnavailableAction({
  label,
  reason,
}: {
  label: string;
  reason: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled
        className="w-fit border border-dashed border-[var(--border-strong)] opacity-70"
      >
        {label}
      </Button>
      <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
        {reason}
      </p>
    </div>
  );
}

/**
 * Every configured value on the node, verbatim.
 *
 * Verbatim matters: these are source text in a closed expression language, and
 * a console that pretty-printed or paraphrased them would be showing something
 * the compiler never sees.
 */
function ConfiguredAs({ node }: { node: GraphNode }) {
  const lines = configLines(node);
  if (lines.length === 0) {
    return (
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[12px] font-medium">What it does</h3>
        <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
          Nothing is configured on this node. For most kinds that is a refusal
          waiting to happen — the validator below says which.
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[12px] font-medium">What it does</h3>
      <dl className="flex flex-col divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-base)]">
        {lines.map((l, i) => (
          <div key={`${l.label}-${i}`} className="flex flex-col gap-0.5 px-2.5 py-1.5">
            <dt className="type-label text-[var(--fg-muted)]">
              {l.label}
            </dt>
            <dd
              className={
                l.expression
                  ? "font-mono text-[11px] break-all text-[var(--color-accent-400)]"
                  : "font-mono text-[11px] break-all text-[var(--fg-secondary)]"
              }
            >
              {l.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * What the LLM gate may read, and what it may not.
 *
 * The reset is the part most likely to be skipped and the part that matters
 * most: an approval that survived a prompt edit would be an approval of a
 * different prompt.
 */
function ReadPolicy({ node }: { node: GraphNode }) {
  const allowed = Array.isArray(node.config?.read_fields)
    ? (node.config!.read_fields as string[])
    : [];
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[12px] font-medium">What it may read</h3>
      {allowed.length === 0 ? (
        <p className="text-[11.5px] leading-[1.6] text-[var(--fg-muted)]">
          This node declares no field allowlist, so the payload reaches it as
          data behind a nonce fence rather than as instructions. The narrower the
          allowlist, the smaller the surface.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {allowed.map((f) => (
            <li
              key={f}
              className="rounded-[3px] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px]"
            >
              {f}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10.5px] leading-[1.5] text-[var(--fg-muted)]">
        Approval resets on any prompt edit — an approval that survived one would
        be an approval of a different prompt.
      </p>
    </section>
  );
}

/**
 * The panel that argues from the node's own numbers.
 *
 * On the LLM gate it argues against itself when it can, which is the point: a
 * deterministic gate that expresses the same rule costs nothing per item and
 * removes the injection surface completely.
 */
function Telling({
  node,
  counts,
  terminated,
}: {
  node: GraphNode;
  counts: Record<string, number>;
  terminated: Map<string, string>;
}) {
  const text = tellingFor(node, counts, terminated);
  if (text === null) return null;
  return (
    <section
      className="rounded-[var(--radius-lg)] p-3 tint-wash"
      style={{ "--tint": "var(--accent-bg)" } as React.CSSProperties}
    >
      <h3 className="text-[12px] font-medium text-[var(--color-accent-400)]">
        What this node is telling you
      </h3>
      <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
        {text}
      </p>
    </section>
  );
}

function tellingFor(
  node: GraphNode,
  counts: Record<string, number>,
  terminated: Map<string, string>,
): string | null {
  switch (node.kind) {
    case "decide": {
      const condition =
        typeof node.config?.condition === "string"
          ? (node.config.condition as string)
          : "";
      // The argument-against-itself, made only when the rule actually is one a
      // choice node could express. Claiming it otherwise would be advice that
      // does not survive being followed.
      if (/^[\w.]+\s*[<>=!]=?\s*[\d.]+$/.test(condition.trim())) {
        return `The rule here is a numeric comparison on one field. A choice node would express it exactly, cost nothing per item, and remove the injection surface completely — this node reads third-party text to answer a question arithmetic already answers.`;
      }
      return "This node reads text it did not write. Every field in its allowlist is a field an author of that text can use to talk to it, which is why the allowlist is worth keeping narrow.";
    }
    case "save_to_memory": {
      const refusedCount = counts[`${node.id}.error`];
      if (refusedCount === 0) {
        return "Its error port has carried nothing. Worth knowing rather than assuming — an error path that has never fired is untested, not proven.";
      }
      return "Saves are idempotent on a derived key. If two items derive the same key, the second replaces the first and nothing afterwards says there were ever two — which is what a dry run checks.";
    }
    case "notify":
      return "Most builders fold `ambiguous` into `error`. It is not an error: it means the send may have landed. Reporting it as failure invites someone to send again by hand, which is the actual damage.";
    case "repeat_until":
      return "A loop needs a stated end. The cap is not a safety net bolted on afterwards — it is what makes the work this pipeline can do a number the compiler can compute before it runs.";
    case "split":
      return "This is the fan-out point. Whatever key the saves downstream derive has to separate the pieces this produces, or they collapse into one record.";
    case "choice": {
      const falseReason = terminated.get("false");
      if (falseReason) {
        return `Items taking the false port are discarded on purpose, as “${falseReason}”. That wording is what the run summary and the dry run will say, so it is operator-facing copy rather than a note.`;
      }
      return null;
    }
    default:
      return null;
  }
}
