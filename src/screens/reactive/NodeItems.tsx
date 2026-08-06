import { useState } from "react";
import { Button } from "@/design-system/components";
import { useMutation } from "@/lib/useMutation";
import { ipc } from "@/ipc";
import type { NodeItem } from "@/ipc/types";

/**
 * What actually reached this node.
 *
 * # Why this replaces a disabled button
 *
 * The inspector could report that a node RAN and never what ran THROUGH it. An
 * operator watching their own data flow saw `save_to_memory → out "effect
 * confirmed"` — a receipt for the runtime, not an answer for a person — and not
 * one value that landed. The data was never missing: every task stores its input
 * envelope, its result and its evidence. Only the read was.
 *
 * # It leads with what was WRITTEN
 *
 * A save's result carries the facts it wrote, so those come first and in plain
 * form: `station/erzincan · temperature 32.4`. The raw envelopes are underneath
 * for when the summary is not enough, which is the minority of the time — and
 * putting them first is how a panel becomes a JSON dump nobody reads.
 */
export function NodeItems({ pipelineID, nodeID }: { pipelineID: string; nodeID: string }) {
  const [items, setItems] = useState<NodeItem[] | null>(null);
  const load = useMutation(ipc.listNodeItems);

  if (items === null) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={load.isLoading}
        onClick={async () => {
          const got = await load.mutate(pipelineID, nodeID, 25);
          setItems(got ?? []);
        }}
      >
        {load.isLoading ? "Reading…" : "Show what reached it"}
      </Button>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
        Nothing has reached this node. On a pipeline that is armed and receiving,
        that means the items are stopping upstream — check the node before it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[var(--fg-muted)]">
          {items.length === 25 ? "Newest 25" : `${items.length} items`}, newest first
        </span>
        <button
          className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
          onClick={() => setItems(null)}
        >
          Hide
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <ItemRow key={`${it.run_id}:${it.item_key}:${i}`} item={it} />
        ))}
      </ul>
    </div>
  );
}

function ItemRow({ item }: { item: NodeItem }) {
  const [open, setOpen] = useState(false);
  const facts = savedFacts(item.result_json);

  return (
    <li className="rounded-md bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11.5px]">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <StateChip state={item.state} />
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">{item.item_key || "root"}</span>
        {item.attempt > 1 && (
          /* Not decoration: a second attempt means the first did not settle, and
             that is the difference between slow and broken. */
          <span className="text-[10.5px] text-[var(--status-warn)]">attempt {item.attempt}</span>
        )}
        <span className="ml-auto text-[10.5px] text-[var(--fg-muted)]">{shortTime(item.updated_at)}</span>
      </div>

      {facts.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {facts.map((f, i) => (
            <li key={i} className="text-[var(--fg-secondary)]">
              <span className="font-mono text-[var(--fg-primary)]">{f.entity}</span>
              {" · "}
              {f.predicate} <span className="font-mono text-[var(--fg-primary)]">{f.value}</span>
              {f.type ? <span className="text-[var(--fg-muted)]"> ({f.type})</span> : null}
            </li>
          ))}
        </ul>
      )}

      {item.error !== "" && (
        <p className="mt-1 leading-[1.5] text-[var(--status-err)]">{item.error}</p>
      )}

      <button
        className="mt-1 text-[10.5px] text-[var(--fg-muted)] underline underline-offset-2"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide the envelope" : "Show the envelope"}
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 overflow-x-auto">
          <Envelope label="in" json={item.input_json} />
          <Envelope label="out" json={item.result_json} />
          {item.evidence_ref !== "" && (
            <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
              from {item.evidence_ref}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Envelope({ label, json }: { label: string; json: string }) {
  if (json === "") return null;
  return (
    <pre className="overflow-x-auto rounded bg-[var(--bg-base)] p-1.5 font-mono text-[10.5px] leading-[1.5]">
      {label}: {pretty(json)}
    </pre>
  );
}

function StateChip({ state }: { state: string }) {
  // Only three readings matter to somebody scanning: it worked, it is still
  // going, or it needs them. Colouring every state equally is how the one that
  // needs attention gets lost.
  const tint =
    state === "succeeded"
      ? "var(--status-ok, var(--color-accent-400))"
      : state === "failed" || state === "refused"
        ? "var(--status-err)"
        : state === "ambiguous"
          ? "var(--status-warn)"
          : "var(--fg-muted)";
  return (
    <span className="rounded-full px-1.5 py-px text-[10.5px] tint-wash" style={{ "--tint": tint } as React.CSSProperties}>
      {state}
    </span>
  );
}

interface SavedFact {
  entity: string;
  predicate: string;
  value: string;
  type?: string;
}

/** The facts a save reported writing. Empty for any other node kind. */
function savedFacts(resultJSON: string): SavedFact[] {
  if (resultJSON === "") return [];
  try {
    const parsed = JSON.parse(resultJSON) as { saved?: unknown };
    if (!Array.isArray(parsed.saved)) return [];
    return parsed.saved.filter(
      (f): f is SavedFact =>
        typeof f === "object" && f !== null && "entity" in f && "predicate" in f,
    );
  } catch {
    return [];
  }
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 1);
  } catch {
    return json;
  }
}

/** Time as a reader scanning a list wants it, not as the wire sends it. */
function shortTime(iso: string): string {
  if (iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
