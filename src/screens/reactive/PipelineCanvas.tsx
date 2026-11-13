import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { projectionStore } from "@/store/projection";
import { Button, ScrollArea } from "@/design-system/components";
import { ipc } from "@/ipc";
import { useKernelQuery } from "@/lib/useKernelQuery";
import { cn } from "@/design-system/lib/utils";
import type {
  GraphDocument,
  PipelineMeters,
  PipelineNodeMeter,
  GraphNode,
  GraphScope,
  PipelineDryRun,
  PipelineRefusal,
  PipelineSummary,
} from "@/ipc/types";
import { FAMILY_LABEL, refusalAction, touchesWorld } from "./nodeVocabulary";
import { NodePalette } from "./NodePalette";
import { NodeInspector } from "./NodeInspector";
import { TerminateDialog } from "./TerminateDialog";
import { PipelineGraph } from "./PipelineGraph";
import { FlowRail } from "./FlowRail";
import { recentlyMovedPorts } from "./graphLayout";
import {
  addNode,
  canWire,
  continuationPort,
  insertAfter,
  removeNode,
  renameNode,
  setConfig,
  setNodeLayout,
  spliceIntoEdge,
  terminate,
  unterminate,
  unwire,
  wire,
} from "./pipelineEdit";
import { lineageOf, lineageSummary, parseFieldSchema } from "./fieldSchema";
import type { FieldSchema } from "@/ipc/types";

/**
 * 15a — the canvas, read-only.
 *
 * Render, select and inspect an existing graph. Nothing here can write: the two
 * RPCs behind it read a revision and compile a document, and neither can store
 * or transition. That is a property worth stating rather than assuming, because
 * an editor that could accidentally publish is a worse editor.
 *
 * Geometry is layout-driven throughout. Each edge draws its own stub from inside
 * its own row, so a card growing a line of text cannot silently break a
 * connector — the defect a single shared SVG with hardcoded endpoints caused
 * earlier in this project.
 */
export function PipelineCanvas({
  pipeline,
  onClose,
  onDryRun,
  starter = null,
  onCreated,
}: {
  pipeline: PipelineSummary;
  onClose: () => void;
  onDryRun: () => void;
  /**
   * A graph that does not exist yet.
   *
   * When set the canvas opens straight into editing it and reads nothing: there
   * is no stored revision to read, and a failed read would render as a refusal
   * about a pipeline the operator is in the middle of drawing.
   */
  starter?: GraphDocument | null;
  onCreated?: (pipelineID: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  /** The item being followed, if any. Outranks the node in the right panel. */
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  /**
   * Whether the live layer is held (Logs §5).
   *
   * Set BECAUSE the operator did something — moved the canvas, opened a node —
   * never because they found a toggle. A canvas that animates under a cursor
   * while somebody is reading it is unusable, and the pause is what makes the
   * motion tolerable rather than something to switch off permanently.
   */
  const [paused, setPaused] = useState(false);
  /** The edited document. null means reading what the kernel stored. */
  const [draft, setDraft] = useState<GraphDocument | null>(starter);
  /** The port a wire is being drawn from, if any. */
  const [wiring, setWiring] = useState<{ node: string; port: string } | null>(null);
  /** The port a termination reason is being written for, if any. */
  const [terminating, setTerminating] = useState<{ node: string; port: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  /** A lifecycle move in flight (contract 0093). */
  const [transitioning, setTransitioning] = useState(false);
  /** Where the revision IS after a transition — the kernel's answer. */
  const [liveState, setLiveState] = useState<string | null>(null);
  /** The revision a save just created; lifecycle acts on it, not the stale prop. */
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  /** Refusals from validating the DRAFT, which replace the stored ones. */
  const [draftRefusals, setDraftRefusals] = useState<PipelineRefusal[] | null>(null);
  /** The DRAFT's field projection, from the same validate call. */
  const [draftFields, setDraftFields] = useState<FieldSchema | null>(null);
  /** A field being followed across the graph, if any. */
  const [followedField, setFollowedField] = useState<string | null>(null);

  const isNew = starter !== null;
  const graph = useKernelQuery(
    ["pipeline-graph", pipeline.pipeline_id, pipeline.revision],
    () => ipc.getPipeline(pipeline.pipeline_id, pipeline.revision),
    { retry: 0, staleTime: 0, enabled: !isNew },
  );
  // Port counts come from the dry run, not from live traffic.
  //
  // Counts per port are not projected per revision, so a canvas showing "47"
  // beside a port would be claiming something the kernel does not report. The
  // dry run does report them, for the traffic captured now — so that is what is
  // shown, and the header says which.
  // The schema of what actually arrives. A step's expressions name paths; this
  // is the set of paths that exist. Reading one against the other is how an
  // operator sees whether a pipeline touches the data it thinks it does.
  const capture = useKernelQuery(
    ["studio", "capture", pipeline.trigger_ref],
    () => ipc.studioCaptureStatus(pipeline.trigger_ref),
    {
      retry: 0,
      staleTime: 0,
      enabled: pipeline.trigger_type === "ingress" && pipeline.trigger_ref !== "",
    },
  );

  const dry = useKernelQuery(
    ["pipeline-dry-run", pipeline.pipeline_id, pipeline.revision],
    () => ipc.dryRunPipeline(pipeline.pipeline_id, pipeline.revision),
    {
      retry: 0,
      staleTime: 0,
      enabled: !isNew && pipeline.trigger_type === "ingress",
    },
  );

  const stored = useMemo<GraphDocument | null>(() => {
    if (!graph.data?.graph_json) return null;
    try {
      return JSON.parse(graph.data.graph_json) as GraphDocument;
    } catch {
      return null;
    }
  }, [graph.data?.graph_json]);

  // The document on screen: the edit in progress, or what the kernel stored.
  const doc = draft ?? stored;
  const editing = draft !== null;

  // Refusals about what is ON SCREEN. While editing they come from validating
  // the draft; otherwise from the read. Showing the stored revision's refusals
  // over an edited graph would point at problems the operator had just fixed.
  const refusals = draftRefusals ?? graph.data?.refusals ?? [];

  // The per-node field schema — what exists at each node, per the kernel's
  // walk from the trigger's capture profile through every transform (contract
  // 0091). Same source discipline as refusals: while editing, the draft's own
  // projection from the validate call; otherwise the stored revision's. null
  // means UNCHECKED, which the picker says in those words — an old kernel or a
  // non-compiling draft must not read as "no fields".
  const storedFields = useMemo(
    () => parseFieldSchema(graph.data?.field_schema_json),
    [graph.data?.field_schema_json],
  );
  const fieldSchema = editing ? draftFields : storedFields;

  // Which nodes decide with an expression — lineage lights those differently.
  const gateNodes = useMemo(() => {
    const out = new Set<string>();
    const walk = (s: GraphScope) => {
      for (const n of s.nodes) {
        if (n.kind === "choice" || n.kind === "switch") out.add(n.id);
        if (n.body) walk(n.body);
      }
    };
    if (doc) walk(doc.scope);
    return out;
  }, [doc]);

  // Every node that touches the followed field, and how. A pure join over
  // kernel facts — reads from the compiled AST, writes/drops from the
  // projection — so the highlight can never claim something the runtime
  // would not do.
  const lineage = useMemo(
    () =>
      followedField !== null && fieldSchema !== null
        ? lineageOf(fieldSchema, followedField, gateNodes)
        : null,
    [followedField, fieldSchema, gateNodes],
  );
  // Which payload paths each step reads, from the compiled AST.
  const reads = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of graph.data?.reads ?? []) m.set(r.node, r.paths);
    return m;
  }, [graph.data?.reads]);
  // The live reading for this pipeline, off the feed. Where the dry run says
  // what WOULD happen, this says what IS happening — and in-flight is the only
  // figure that shows where items are piling up.
  const projection = useStore(projectionStore);
  const live = projection.state?.pipeline_meters?.[pipeline.pipeline_id];
  const liveByNode = useMemo(() => {
    const m = new Map<string, PipelineNodeMeter>();
    for (const n of live?.nodes ?? []) m.set(n.node, n);
    return m;
  }, [live]);
  // The worst queue right now. A node holding items is only interesting
  // relative to its neighbours — one item in flight everywhere is a pipeline
  // working, and forty in one place is the bottleneck.
  const worstInFlight = useMemo(
    () => Math.max(0, ...(live?.nodes ?? []).map((n) => n.in_flight)),
    [live],
  );

  // Per-port counts, LIVE first.
  //
  // They used to come only from the dry run, which refuses outright for a chat
  // pipeline ("this kernel captures no deliveries") — so every cell in the ports
  // table read "—" while the live meters held the real numbers the whole time.
  // The dry run stays as the fallback: it is the only source for a pipeline
  // nothing has run through yet.
  const counts = useMemo(
    () => ({ ...portCounts(dry.data), ...livePortCounts(live) }),
    [dry.data, live],
  );

  // Where an item ARRIVES. The rail counts arrivals, not steps: one item across
  // five nodes is one arrival, and a rail that marked steps would report a
  // five-node pipeline as five times busier than a one-node pipeline carrying
  // exactly the same traffic.
  const entryNodeID = useMemo(
    () => doc?.scope.nodes.find((n) => n.kind === "trigger")?.id ?? null,
    [doc],
  );

  // Which edges are carrying something right now, for the travelling dot. Only
  // ports touched in the last few seconds animate: an edge that kept animating
  // a minute after the last item would be answering "did this ever run" while
  // appearing to answer "is this running".
  const steps = projection.state?.pipeline_steps;
  // Recency has to be re-evaluated on a clock, not only when a step arrives.
  //
  // Without this tick the last computation stands until the NEXT step, so a
  // pipeline that goes quiet leaves its final edge animating indefinitely —
  // the exact "animated edge with nothing on it" the design argues against,
  // and it would appear only in the idle case nobody tests interactively.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, [paused]);
  const recentlyMoved = useMemo(
    () =>
      paused
        ? new Set<string>()
        : recentlyMovedPorts(steps ?? [], pipeline.pipeline_id, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick IS the input
    [steps, pipeline.pipeline_id, paused, tick],
  );

  // Opening a node pauses the live layer, for the same reason scrolling does:
  // the operator is now reading something specific and motion is in the way.
  useEffect(() => {
    if (selected !== null) setPaused(true);
  }, [selected]);

  // Compiler-on-change, debounced until the graph settles.
  //
  // Debounced rather than per-keystroke because the answer is only worth having
  // once the edit is a whole thought — and because a refusal that flickers while
  // someone is halfway through wiring teaches them to ignore refusals.
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (draft === null) return;
    void 0;
    if (validateTimer.current) clearTimeout(validateTimer.current);
    const json = JSON.stringify(draft);
    validateTimer.current = setTimeout(() => {
      void ipc
        .validatePipeline(json)
        .then((v) => {
          // A document the compiler could not READ is a different problem from a
          // graph that broke rules, and it is reported as itself.
          setDraftRefusals(
            v.refused !== ""
              ? [{ constraint: "", node: "", port: "", message: v.refused }]
              : v.refusals,
          );
          // The projection rides the same answer, so the picker tracks the
          // EDIT — a picker fed the stored revision would offer fields a map
          // the operator just deleted used to write.
          setDraftFields(parseFieldSchema(v.field_schema_json));
        })
        .catch(() => {
          // A validation that could not run must not read as "no refusals" —
          // that is the one wrong answer, because it makes a broken graph look
          // publishable.
          setDraftRefusals([
            {
              constraint: "",
              node: "",
              port: "",
              message:
                "The kernel could not be reached to check this graph, so what you see is unchecked.",
            },
          ]);
          setDraftFields(null);
        });
    }, 250);
    return () => {
      if (validateTimer.current) clearTimeout(validateTimer.current);
    };
  }, [draft]);

  const selectedNode = useMemo(() => {
    if (!doc || !selected) return null;
    return findNode(doc.scope, selected);
  }, [doc, selected]);

  /** Begin editing from whatever is on screen. */
  function edit(next: (d: GraphDocument) => GraphDocument) {
    const base = draft ?? stored;
    if (!base) return;
    setDraft(next(base));
    setNotice("");
  }

  function onPortClick(nodeID: string, port: string) {
    if (!editing) return;
    if (wiring && wiring.node === nodeID && wiring.port === port) {
      setWiring(null);
      return;
    }
    setWiring({ node: nodeID, port });
    setNotice("");
  }

  /** Drag-to-wire and click-to-wire share one verdict path: the compiler's. */
  function wireRequest(from: string, port: string, to: string) {
    if (!doc) return;
    const verdict = canWire(doc, from, port, to);
    if (verdict.kind === "refused") {
      setNotice(verdict.reason);
      return;
    }
    if (verdict.kind === "not-a-target") return;
    edit((d) => wire(d, from, port, to));
    setNotice("");
  }

  /** A grabbed pipe re-routed onto a different step. */
  function rewire(from: string, port: string, oldTo: string, newTo: string) {
    if (!doc) return;
    const verdict = canWire(doc, from, port, newTo);
    if (verdict.kind === "refused") {
      setNotice(verdict.reason);
      return;
    }
    if (verdict.kind === "not-a-target") return;
    edit((d) => wire(unwire(d, from, port, oldTo), from, port, newTo));
    setNotice("");
  }

  /** A pipe dropped on empty canvas, or deleted. Loud, never silent. */
  function disconnect(from: string, port: string, to: string) {
    edit((d) => unwire(d, from, port, to));
    setNotice(
      `Disconnected ${port}. Every outgoing port must go somewhere or be closed with a reason — the checker below will hold Publish until this one does.`,
    );
  }

  /** A palette step dropped onto the canvas. */
  function dropNode(
    kind: string,
    pos: { x: number; y: number },
    attach:
      | { type: "splice"; from: string; port: string; to: string }
      | { type: "after"; node: string }
      | { type: "none" },
  ) {
    edit((d) => {
      if (attach.type === "splice") {
        const { doc: next, id } = spliceIntoEdge(d, attach.from, attach.port, attach.to, kind);
        setSelected(id);
        setNotice("");
        return setNodeLayout(next, id, pos);
      }
      if (attach.type === "after") {
        const target = findNode(d.scope, attach.node);
        const port = target ? continuationPort(target) : null;
        if (target && port) {
          const { doc: next, id } = insertAfter(d, target.id, port, kind);
          setSelected(id);
          setNotice("");
          return setNodeLayout(next, id, pos);
        }
      }
      const { doc: next, id } = addNode(d, kind);
      setSelected(id);
      setNotice(
        "Added where you dropped it, not connected yet — drag a pipe from another step's port dot onto it, and it becomes part of the flow.",
      );
      return setNodeLayout(next, id, pos);
    });
  }

  function onNodeClick(nodeID: string) {
    if (wiring && doc) {
      const verdict = canWire(doc, wiring.node, wiring.port, nodeID);
      if (verdict.kind === "ok") {
        edit((d) => wire(d, wiring.node, wiring.port, nodeID));
        setWiring(null);
        return;
      }
      if (verdict.kind === "refused") {
        setNotice(verdict.reason);
        return;
      }
      // not-a-target: nothing to explain, so nothing is said.
      return;
    }
    setSelected(nodeID);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await ipc.savePipeline(JSON.stringify(draft));
      if (res.refused !== "") {
        setNotice(res.refused);
        return;
      }
      setSavedRevision(res.revision);
      setLiveState("draft");
      setNotice(
        `Saved as draft revision ${res.revision}. Nothing is live yet — Publish freezes it, Arm makes it live.`,
      );
      if (isNew) {
        // It exists now, so the canvas stops being a scratch surface and
        // becomes a view of a stored revision.
        onCreated?.(res.pipeline_id);
        return;
      }
      setDraft(null);
      setDraftRefusals(null);
      setDraftFields(null);
      void graph.refetch();
    } finally {
      setSaving(false);
    }
  }

  /** Move this pipeline along its lifecycle (contract 0093). */
  async function transition(toState: string) {
    setTransitioning(true);
    try {
      const res = await ipc.transitionPipeline(
        pipeline.pipeline_id,
        toState,
        savedRevision ?? pipeline.revision,
      );
      if (res.refused !== "") {
        // The gate that held, in the registry's own words.
        setNotice(res.refused);
        return;
      }
      setLiveState(res.state);
      setNotice(
        res.state === "armed"
          ? `Revision ${res.revision} is LIVE — every new delivery now runs through this graph.`
          : res.state === "published"
            ? `Revision ${res.revision} is published: frozen and inspectable, not live. Arm makes it live.`
            : `Revision ${res.revision} is now ${res.state}.`,
      );
      void graph.refetch();
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        pipeline={pipeline}
        liveState={liveState}
        transitioning={transitioning}
        onTransition={(to) => void transition(to)}
        doc={doc}
        refusals={refusals}
        editing={editing}
        saving={saving}
        isNew={isNew}
        onClose={onClose}
        onDryRun={onDryRun}
        onEdit={() => stored && setDraft(stored)}
        onDiscard={() => {
          if (isNew) {
            // Nothing was stored, so there is nothing to revert to.
            onClose();
            return;
          }
          setDraft(null);
          setDraftRefusals(null);
          setDraftFields(null);
          setWiring(null);
          setNotice("");
        }}
        onSave={() => void save()}
      />

      {(notice !== "" || wiring !== null || followedField !== null) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-1.5">
          {wiring && (
            <span className="font-mono text-[11px] text-[var(--color-accent-400)]">
              wiring {wiring.node}.{wiring.port} — click a node to connect, or
              press the port again to cancel
            </span>
          )}
          {followedField !== null && (
            <span className="flex items-center gap-2 text-[11.5px] text-[var(--fg-secondary)]">
              following{" "}
              <span className="font-mono text-[11px] text-[var(--color-accent-400)]">
                {followedField}
              </span>
              {lineage !== null && (
                <span className="text-[var(--fg-muted)]">
                  {lineageSummary(lineage)}
                </span>
              )}
              <button
                type="button"
                className="rounded-[3px] border border-[var(--border-subtle)] px-1.5 text-[10.5px] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
                onClick={() => setFollowedField(null)}
              >
                stop following
              </button>
            </span>
          )}
          {notice !== "" && (
            <span className="text-[11.5px] text-[var(--status-warn)]">
              {notice}
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <NodePalette
          canAdd={editing}
          // Where a new step would land, so the palette can say so rather than
          // dropping a node somewhere the operator has to go and find.
          after={
            selectedNode && continuationPort(selectedNode)
              ? selectedNode.name || selectedNode.id
              : null
          }
          onAdd={(kind) =>
            edit((d) => {
              // Added AFTER the selected step, wired in. A bare node with no
              // edge in is not a step: it never runs, and the operator has to
              // discover the wiring gesture before anything they added does
              // anything.
              const port = selectedNode ? continuationPort(selectedNode) : null;
              if (selectedNode && port) {
                const { doc: next, id } = insertAfter(d, selectedNode.id, port, kind);
                setSelected(id);
                setNotice("");
                return next;
              }
              const { doc: next, id } = addNode(d, kind);
              setSelected(id);
              // Said plainly rather than left to be discovered: the node is on
              // the canvas and reaches nothing until it is wired.
              setNotice(
                selectedNode
                  ? `Added, but not wired: ${selectedNode.kind} has no single continuation port, so which branch it follows is your choice. Click a port to wire it.`
                  : "Added, but not wired — select a step first and the next one lands after it. Click a port to wire it.",
              );
              return next;
            })
          }
        />

        {/* The canvas: context strip, then the graph itself filling whatever
            room is left, then the live rail pinned to the bottom.

            The graph gets the space rather than sharing a scroll region with
            the panels above it. Two cards adrift in the top-left eighth of a
            2560px screen is not a spacing preference — a mostly-empty canvas
            reads as an app that failed to load, when in fact the pipeline is
            fine and merely idle. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {graph.error ? (
            <p className="p-5 text-[12.5px] text-[var(--status-err)]">
              {graph.error.message}
            </p>
          ) : graph.data?.refused ? (
            <p className="m-5 max-w-[520px] rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 text-[12.5px] text-[var(--fg-secondary)]">
              {graph.data.refused}
            </p>
          ) : graph.isLoading ? (
            <p className="p-5 text-[12.5px] text-[var(--fg-muted)]">Loading…</p>
          ) : doc ? (
            <>
              <ScrollArea className="max-h-[240px] shrink-0 border-b border-[var(--border-subtle)]">
                <div className="flex flex-wrap items-start gap-3 p-3">
                  <Admission doc={doc} />
                  <SignalSchema
                    profileJSON={capture.data?.profile_json}
                    samples={capture.data?.samples ?? 0}
                    reads={reads}
                    triggerType={doc.trigger?.type ?? ""}
                  />
                </div>
              </ScrollArea>

              <div
                className="relative min-h-0 flex-1"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, var(--border-subtle) 1px, transparent 1px)",
                  backgroundSize: "19px 19px",
                }}
              >
                <PipelineGraph
                  doc={doc}
                  counts={counts}
                  reads={reads}
                  live={liveByNode}
                  refusals={refusals}
                  worstInFlight={worstInFlight}
                  selected={selected}
                  editing={editing}
                  wiring={wiring}
                  recentlyMoved={recentlyMoved}
                  lineage={lineage}
                  onSelect={onNodeClick}
                  onPortClick={onPortClick}
                  onTerminate={(node, port) => setTerminating({ node, port })}
                  onUnterminate={(node, port) =>
                    edit((d) => unterminate(d, node, port))
                  }
                  onRemove={(node) => {
                    edit((d) => removeNode(d, node));
                    setSelected(null);
                  }}
                  onInteract={() => setPaused(true)}
                  onWireRequest={wireRequest}
                  onRewire={rewire}
                  onDisconnect={disconnect}
                  onMove={(node, position) =>
                    edit((d) => setNodeLayout(d, node, position))
                  }
                  onDropNode={dropNode}
                />
              </div>

              {refusals.length > 0 && (
                <div className="max-h-[30%] shrink-0 overflow-y-auto border-t border-[var(--border-subtle)] p-3">
                  <RefusalSummary
                    refusals={refusals}
                    onGoTo={(nodeID) => setSelected(nodeID)}
                  />
                </div>
              )}

              <FlowRail
                pipelineID={pipeline.pipeline_id}
                entryNodeID={entryNodeID}
                paused={paused}
                pausedReason={
                  selected !== null ? "a node is selected" : "you moved the canvas"
                }
                onResume={() => setPaused(false)}
              />
            </>
          ) : (
            <p className="p-5 text-[12.5px] text-[var(--fg-muted)]">
              This revision has no readable graph.
            </p>
          )}
        </div>

        <NodeInspector
          node={selectedNode}
          scope={doc?.scope ?? null}
          refusals={refusals}
          editing={editing}
          fields={selected ? fieldSchema?.[selected] : undefined}
          fieldsUnchecked={fieldSchema === null}
          onConfig={(nodeID, key, value) =>
            edit((d) => setConfig(d, nodeID, key, value))
          }
          onRename={(nodeID, name) => edit((d) => renameNode(d, nodeID, name))}
          onFollowField={(path) => setFollowedField(path)}
          examples={
            selected
              ? (dry.data?.node_examples ?? []).filter((ex) => ex.node === selected)
              : []
          }
          exampleSource={dry.data?.source ?? ""}
          counts={counts}
          // True only when the numbers on screen came from the dry run rather
          // than from live traffic. Live wins in the map, so the label has to
          // follow it — otherwise the footer describes a source the column is
          // not using.
          countsAreDryRun={
            Object.keys(livePortCounts(live)).length === 0 &&
            (dry.data?.samples ?? 0) > 0
          }
          reads={selected ? (reads.get(selected) ?? []) : []}
          pipelineID={pipeline.pipeline_id}
          selectedItem={selectedItem}
          seenHere={selected ? (liveByNode.get(selected)?.entered ?? null) : null}
          onSelectItem={setSelectedItem}
          onSelectNode={(id) => {
            // Jumping to a node from an item's log keeps the item selected: the
            // question was "where did THIS go", and clearing it would answer a
            // different one.
            setSelected(id);
          }}
        />
      </div>

      {terminating && doc && (
        <TerminateDialog
          doc={doc}
          node={terminating.node}
          port={terminating.port}
          onCancel={() => setTerminating(null)}
          onConfirm={(reason) => {
            edit((d) => terminate(d, terminating.node, terminating.port, reason));
            setTerminating(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────────── */

const LIFECYCLE = ["draft", "validated", "published", "armed"];

/**
 * The next lifecycle step from where a revision stands, as one button.
 *
 * One action, not a menu: a draft's next step is Publish, a published
 * revision's is Arm, an armed one's is Pause. The kernel walks any skipped
 * gates itself and refuses by name when one holds; refusals hold Publish
 * client-side too, because offering a button that will certainly refuse is
 * noise wearing a control's clothes.
 */
function LifecycleButton({
  state,
  blocked,
  refusals,
  transitioning,
  onTransition,
}: {
  state: string;
  blocked: boolean;
  refusals: number;
  transitioning: boolean;
  onTransition: (toState: string) => void;
}) {
  const next =
    state === "draft" || state === "validated"
      ? { label: "Publish", to: "published", holdOnRefusals: true }
      : state === "published"
        ? { label: "Arm — make it live", to: "armed", holdOnRefusals: true }
        : state === "armed"
          ? { label: "Pause", to: "paused", holdOnRefusals: false }
          : null;
  if (next === null) return null; // retired: there is no next step

  const held = next.holdOnRefusals && blocked;
  return (
    <Button
      size="sm"
      disabled={held || transitioning}
      title={
        held
          ? `${refusals} ${refusals === 1 ? "refusal stands" : "refusals stand"} — fix them and this unlocks`
          : next.to === "armed"
            ? "Arming makes this revision the live one: every new delivery runs through it"
            : undefined
      }
      onClick={() => onTransition(next.to)}
    >
      {transitioning ? "Working…" : next.label}
    </Button>
  );
}

/**
 * The lifecycle as a visible track, because the operator should never have to
 * guess why Publish is dim.
 */
function Header({
  pipeline,
  liveState = null,
  transitioning = false,
  onTransition,
  doc,
  refusals,
  editing,
  saving,
  isNew,
  onClose,
  onDryRun,
  onEdit,
  onDiscard,
  onSave,
}: {
  pipeline: PipelineSummary;
  /** The state after a transition this session — outranks the stale summary. */
  liveState?: string | null;
  transitioning?: boolean;
  onTransition?: (toState: string) => void;
  doc: GraphDocument | null;
  refusals: PipelineRefusal[];
  editing: boolean;
  saving: boolean;
  isNew: boolean;
  onClose: () => void;
  onDryRun: () => void;
  onEdit: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const state = (liveState ?? pipeline.state ?? "draft").toLowerCase();
  const at = LIFECYCLE.indexOf(state);
  const blocked = refusals.length > 0;
  const effects = doc ? countEffects(doc.scope) : pipeline.effect_node_count;

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[15px] font-medium">
          {pipeline.name || pipeline.pipeline_id}
        </span>
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          r{pipeline.revision}
        </span>

        <div className="flex items-center gap-1.5">
          {LIFECYCLE.map((step, i) => (
            <span key={step} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-[var(--fg-muted)]">
                  →
                </span>
              )}
              <span
                className={cn(
                  "font-mono text-[10.5px]",
                  i === at && !blocked && "text-[var(--color-accent-400)]",
                  i === at && blocked && "text-[var(--status-err)]",
                  i !== at && "text-[var(--fg-muted)]",
                )}
              >
                {step}
                {i === at && blocked && " — blocked"}
              </span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!editing && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled
                title="Select a node to test it — and an effect node cannot be tested in isolation"
              >
                Test a node
              </Button>
              <Button size="sm" variant="ghost" onClick={onDryRun}>
                Dry run
              </Button>
            </>
          )}
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={onDiscard}>
                {isNew ? "Abandon" : "Discard"}
              </Button>
              {/* Save stays available while refusals stand. An operator
                  mid-edit needs to keep their work, and a draft cannot run —
                  what refusals hold is Publish. */}
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? "Saving…" : "Save as draft"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              // There is nothing to edit until the graph has loaded. Offering it
              // anyway gives a control that silently does nothing, which reads
              // as the product being broken.
              disabled={doc === null}
              title={doc === null ? "Nothing to edit yet" : undefined}
            >
              Edit
            </Button>
          )}
          {/* The lifecycle's own button (contract 0093). One action, phrased
              as the NEXT step from where this revision stands: a draft
              publishes, a published revision arms, an armed one pauses.
              Refusals hold it — a graph that breaks rules cannot move — and
              the kernel's gates each still get their say server-side. */}
          {!editing && !isNew && onTransition && (
            <LifecycleButton
              state={state}
              blocked={blocked}
              refusals={refusals.length}
              transitioning={transitioning}
              onTransition={onTransition}
            />
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>

      {/* Before the buttons in the design, and the number that decides whether
          this graph gets read carefully. */}
      <p className="text-[11.5px] text-[var(--fg-muted)]">
        {effects === 0 ? (
          <span>0 nodes can touch the world</span>
        ) : (
          <span className="text-[var(--status-warn)]">
            {effects} {effects === 1 ? "node" : "nodes"} can touch the world
          </span>
        )}
        {blocked && (
          <>
            {" · "}
            <span className="text-[var(--status-err)]">
              Publish is held by {refusals.length}{" "}
              {refusals.length === 1 ? "refusal" : "refusals"}, listed below the
              graph
            </span>
          </>
        )}
        {editing && (
          <>
            {" · "}
            <span className="text-[var(--color-accent-400)]">
              {isNew
                ? "New. This exists only in this window until you save it, and saving makes a draft — not a live pipeline."
                : "Editing. Nothing is stored until you save, and saving makes a draft — not a live pipeline."}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/* ── Admission ──────────────────────────────────────────────────────────── */

/**
 * Drawn, and locked.
 *
 * Visible because the operator needs to know it ran; immovable because the
 * canvas must not be able to reorder or delete it. Hiding it entirely would be
 * safer and worse — the operator would not know it existed.
 */
function Admission({ doc }: { doc: GraphDocument }) {
  if (doc.trigger?.type !== "ingress") return null;
  return (
    <div className="w-[250px] rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="type-label text-[var(--fg-muted)]">
          Admission
        </span>
        <span className="font-mono text-[10px] text-[var(--fg-muted)]">
          sealed
        </span>
      </div>
      <p className="mt-1 font-mono text-[10.5px] leading-[1.5] text-[var(--fg-secondary)]">
        namespace · identity binding · blocked senders · stranger policy
      </p>
      <p className="mt-1 text-[10.5px] text-[var(--fg-muted)]">
        Not nodes, and not reorderable.
      </p>
    </div>
  );
}

/**
 * The shape of what arrives, and which of it the graph touches.
 *
 * A pipeline is a set of expressions over a payload, and until both halves are
 * on the same screen an operator cannot answer the question they actually have:
 * does this thing read the fields I think it reads? The profile says which paths
 * exist and how often; the graph says which paths are named. A path in the
 * profile that no step names is data arriving and being ignored — sometimes
 * correct, always worth seeing.
 */
function SignalSchema({
  profileJSON,
  samples,
  reads,
  triggerType,
}: {
  profileJSON: string | undefined;
  samples: number;
  reads: Map<string, string[]>;
  triggerType: string;
}) {
  const [open, setOpen] = useState(false);

  const paths = useMemo(() => {
    if (!profileJSON) return [];
    try {
      const p = JSON.parse(profileJSON) as {
        paths?: Record<string, { present?: number; types?: Record<string, number> }>;
      };
      return Object.entries(p.paths ?? {}).sort(([a], [b]) => a.localeCompare(b));
    } catch {
      return [];
    }
  }, [profileJSON]);

  // Every path any step reads, with the `item.` root stripped so it compares
  // against the profile, which is rooted at the payload.
  const touched = useMemo(() => {
    const out = new Set<string>();
    let whole = false;
    for (const list of reads.values()) {
      for (const p of list) {
        if (p === "item.*") whole = true;
        if (p.startsWith("item.")) out.add(p.slice("item.".length));
      }
    }
    return { set: out, whole };
  }, [reads]);

  if (triggerType !== "ingress") return null;
  if (paths.length === 0) {
    return (
      <p className="max-w-[520px] text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        No schema profile for this ingress yet — nothing has been captured, so
        there is no record of what arrives. The steps below still say which paths
        they read.
      </p>
    );
  }

  const untouched = paths.filter(([path]) => !touched.set.has(path)).length;

  return (
    <div className="max-w-[560px] rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3 shadow-[var(--elevation-1)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="text-[12px] font-medium">What arrives</span>
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
          {paths.length} paths over {samples}{" "}
          {samples === 1 ? "delivery" : "deliveries"} ·{" "}
          {touched.whole ? "all read" : `${untouched} untouched`} · {open ? "hide" : "show"}
        </span>
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {paths.map(([path, stats]) => {
            const read = touched.whole || touched.set.has(path);
            return (
              <li
                key={path}
                className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10.5px]"
              >
                <span
                  className={
                    read ? "text-[var(--color-accent-400)]" : "text-[var(--fg-muted)]"
                  }
                >
                  {path}
                </span>
                <span className="text-[var(--fg-muted)]">
                  {Object.keys(stats.types ?? {}).join(" | ")}
                </span>
                <span className="text-[var(--fg-muted)]">
                  {stats.present ?? 0}/{samples}
                </span>
                {!read && (
                  <span className="text-[var(--fg-muted)]">— no step reads it</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── The graph ──────────────────────────────────────────────────────────── */

type Counts = Record<string, number>;

/* ── Refusal summary ────────────────────────────────────────────────────── */

function RefusalSummary({
  refusals,
  onGoTo,
}: {
  refusals: PipelineRefusal[];
  onGoTo: (nodeID: string) => void;
}) {
  if (refusals.length === 0) {
    return (
      <p className="max-w-[520px] text-[11.5px] text-[var(--fg-muted)]">
        No refusals. This graph compiles.
      </p>
    );
  }
  return (
    <div
      className="max-w-[560px] rounded-[var(--radius-lg)] p-3.5 tint-wash tint-ring"
      style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium text-[var(--status-err)]">
          {refusals.length === 1
            ? "1 refusal, and it names its constraint"
            : `${refusals.length} refusals, and they all name their constraint`}
        </h2>
        {/* The copy rule, stated where it can be checked against the list. */}
        <span className="shrink-0 font-mono text-[10px] text-[var(--fg-muted)]">
          never the word “invalid”
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {refusals.map((r, i) => (
          <li key={i} className="flex items-start justify-between gap-3">
            <span className="text-[12px] leading-[1.6] text-[var(--fg-secondary)]">
              <span className="font-mono text-[10.5px] text-[var(--status-err)]">
                {r.constraint}
              </span>{" "}
              {r.message}
            </span>
            {/* Offered only when there is somewhere to go. A whole-pipeline
                refusal has no target, and a button that scrolls nowhere is
                worse than no button. */}
            {r.node !== "" && (
              <span className="flex shrink-0 items-baseline gap-3">
                {/* The move that resolves it, named. Every refusal is phrased
                    as the thing to do next, and where that thing is one move
                    the console says which. */}
                {refusalAction(r.constraint) && (
                  <button
                    type="button"
                    onClick={() => onGoTo(r.node)}
                    className="text-[11.5px] text-[var(--fg-secondary)] hover:underline"
                  >
                    {refusalAction(r.constraint)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onGoTo(r.node)}
                  className="text-[11.5px] text-[var(--color-accent-400)] hover:underline"
                >
                  Take me there
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────────── */

/**
 * Nodes in execution order: entry first, then breadth-first along the edges.
 *
 * Falls back to declaration order for anything unreachable, so a graph the
 * compiler has refused still draws every node it contains — the operator needs
 * to SEE the node that cannot be reached.
 */
export function topological(scope: GraphScope): GraphNode[] {
  const byID = new Map(scope.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, number>();
  for (const n of scope.nodes) incoming.set(n.id, 0);
  for (const e of scope.edges) {
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  }
  const queue = scope.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
  const seen = new Set<string>();
  const out: GraphNode[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    for (const e of scope.edges.filter((x) => x.from === n.id)) {
      const next = byID.get(e.to);
      if (next && !seen.has(next.id)) queue.push(next);
    }
  }
  for (const n of scope.nodes) {
    if (!seen.has(n.id)) out.push(n);
  }
  return out;
}

export function findNode(scope: GraphScope, id: string): GraphNode | null {
  for (const n of scope.nodes) {
    if (n.id === id) return n;
    if (n.body) {
      const found = findNode(n.body, id);
      if (found) return found;
    }
  }
  return null;
}

export function countEffects(scope: GraphScope): number {
  let n = 0;
  for (const node of scope.nodes) {
    if (touchesWorld(node.kind)) n++;
    if (node.body) n += countEffects(node.body);
  }
  return n;
}

/**
 * Per-port counts, from a dry run.
 *
 * Terminations report per node.port directly. Effects report per node, so they
 * are attributed to `out` — the port an effect that succeeded left by.
 */
/**
 * Per-port counts from the LIVE meters.
 *
 * `passed_on` is attributed to no port on purpose: the durable scheduler knows
 * the port only for a terminal fate, so an item routed onward has no port to
 * count against. Spreading it across the node's ports would put numbers on edges
 * that may never have carried anything.
 */
export function livePortCounts(live: PipelineMeters | undefined): Counts {
  const out: Counts = {};
  for (const n of live?.nodes ?? []) {
    for (const [port, c] of Object.entries(n.ports ?? {})) {
      out[`${n.node}.${port}`] = c;
    }
  }
  return out;
}

export function portCounts(dry: PipelineDryRun | undefined): Counts {
  if (!dry || dry.refused !== "") return {};
  const out: Counts = {};
  for (const t of dry.terminations) {
    out[`${t.node}.${t.port}`] = t.count;
  }
  for (const e of dry.effects) {
    const key = `${e.node}.out`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export { FAMILY_LABEL };
