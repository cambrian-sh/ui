import { useMemo, useState } from "react";
import { Button, ScrollArea } from "@/design-system/components";
import { ipc } from "@/ipc";
import { useKernelQuery } from "@/lib/useKernelQuery";
import { cn } from "@/design-system/lib/utils";
import { StepFlow } from "./StepFlow";
import { ItemHistory } from "./ItemHistory";
import type {
  LogRecord,
  PipelineSummary,
  StudioPreviewEntry,
} from "@/ipc/types";

/**
 * What actually came through, and what the kernel said about it.
 *
 * The canvas answers "what would this do"; the dry run answers "what would it do
 * to what is arriving now". Neither answers the question an operator asks first
 * when something looks wrong: **what did it actually receive, and what
 * happened?** That is this pane.
 *
 * Two halves, because they fail differently. A delivery shows the payload and
 * the outcome the studio recorded for it — that is the data plane. The log lines
 * show what the kernel narrated while handling it — that is the control plane. A
 * delivery that never arrives leaves nothing in the first and something in the
 * second, which is exactly the case worth being able to tell apart.
 */
export function PipelineTracePane({
  pipeline,
  onClose,
}: {
  pipeline: PipelineSummary;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"flow" | "deliveries" | "logs">("flow");
  /** The item being followed. Its log replaces the list, because following one
      delivery and scanning all of them are different tasks. */
  const [item, setItem] = useState<string | null>(null);

  // The ingress id, which is what the studio keyed its deliveries under.
  const ingressID = pipeline.trigger_ref;

  const deliveries = useKernelQuery(
    ["studio", "preview", ingressID],
    () => ipc.studioPreview(ingressID),
    { retry: 0, staleTime: 0, enabled: pipeline.trigger_type === "ingress" },
  );

  // Traced by id rather than by component: a pipeline's work is narrated by
  // several loggers — the engine, the daemon, the transformer — and filtering
  // on any one of them would drop the lines from the others.
  const logs = useKernelQuery(
    ["logs", "pipeline", pipeline.pipeline_id],
    () =>
      ipc.queryLogs(
        { contains: ingressID || pipeline.pipeline_id },
        0,
        200,
      ),
    { retry: 0, staleTime: 0 },
  );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4 pb-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
              What came through
            </h1>
            <p className="mt-1 max-w-[620px] text-[12.5px] leading-[1.6] text-[var(--fg-muted)]">
              <span className="font-mono text-[11.5px] text-[var(--fg-secondary)]">
                {pipeline.name || pipeline.pipeline_id}
              </span>{" "}
              — the deliveries this ingress received and what the kernel said
              while handling them. A delivery that never arrived leaves nothing
              here and something in the log, which is the case worth telling
              apart.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>

        <nav className="flex gap-1 border-b border-[var(--border-subtle)]">
          {(["flow", "deliveries", "logs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 text-[13px] text-[var(--fg-secondary)]",
                tab === t &&
                  "border-b-2 border-[var(--color-accent-400)] font-medium text-[var(--fg-primary)]",
              )}
            >
              {t === "flow"
                ? "Live flow"
                : t === "deliveries"
                  ? "Deliveries"
                  : "Kernel log"}
            </button>
          ))}
        </nav>

        {tab === "flow" ? (
          item ? (
            <ItemHistory
              pipelineID={pipeline.pipeline_id}
              itemKey={item}
              onClear={() => setItem(null)}
            />
          ) : (
            <StepFlow
              pipelineID={pipeline.pipeline_id}
              onSelectItem={setItem}
              selectedItem={item}
            />
          )
        ) : tab === "deliveries" ? (
          <Deliveries
            pipeline={pipeline}
            entries={deliveries.data ?? []}
            loading={deliveries.isLoading}
            error={deliveries.error?.message ?? null}
          />
        ) : (
          <Logs
            records={logs.data?.records ?? []}
            loading={logs.isLoading}
            error={logs.error?.message ?? null}
            needle={ingressID || pipeline.pipeline_id}
          />
        )}
      </div>
    </ScrollArea>
  );
}

function Deliveries({
  pipeline,
  entries,
  loading,
  error,
}: {
  pipeline: PipelineSummary;
  entries: StudioPreviewEntry[];
  loading: boolean;
  error: string | null;
}) {
  if (pipeline.trigger_type !== "ingress") {
    return (
      <p className="max-w-[560px] text-[12px] leading-[1.6] text-[var(--fg-muted)]">
        This pipeline is started by a{" "}
        <span className="font-mono text-[11px]">{pipeline.trigger_type}</span>{" "}
        trigger, not an ingress, so nothing is delivered to it — there is no
        payload to show. The kernel log is still the record of what it did.
      </p>
    );
  }
  if (loading) {
    return <p className="text-[12.5px] text-[var(--fg-muted)]">Loading…</p>;
  }
  if (error !== null) {
    return (
      <p className="text-[12.5px] text-[var(--status-err)]">{error}</p>
    );
  }
  if (entries.length === 0) {
    return (
      <p className="max-w-[560px] text-[12px] leading-[1.6] text-[var(--fg-muted)]">
        Nothing recorded. This ingress keeps recent deliveries only while capture
        is on and traffic is arriving — an empty list means nothing has come
        through lately, not that nothing ever did.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <Delivery key={e.delivery_ref} entry={e} />
      ))}
    </ul>
  );
}

/**
 * One delivery: when, what happened to it, and what it contained.
 *
 * The payload is collapsed by default and the outcome is not, because the
 * outcome is what someone is scanning for and the payload is what they open once
 * they have found the row.
 */
function Delivery({ entry }: { entry: StudioPreviewEntry }) {
  const [open, setOpen] = useState(false);
  const body = useMemo(() => pretty(entry.envelopes_json), [entry.envelopes_json]);
  const bad = /refus|error|fail|discard/i.test(entry.outcome);

  return (
    <li className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)] shadow-[var(--elevation-1)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-3.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          {formatWhen(entry.received_at)}
        </span>
        <span
          className="font-mono text-[10.5px]"
          style={{
            color: bad ? "var(--status-warn)" : "var(--color-accent-400)",
          }}
        >
          {entry.outcome || "received"}
        </span>
        {entry.detail !== "" && (
          <span className="text-[11.5px] text-[var(--fg-secondary)]">
            {entry.detail}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--fg-muted)]">
          {open ? "hide" : "show"} payload
        </span>
      </button>
      {open && (
        <pre className="max-h-[320px] overflow-auto border-t border-[var(--border-subtle)] bg-[var(--bg-base)] px-3.5 py-2 font-mono text-[10.5px] leading-[1.5] text-[var(--fg-secondary)]">
          {body}
        </pre>
      )}
    </li>
  );
}

function Logs({
  records,
  loading,
  error,
  needle,
}: {
  records: LogRecord[];
  loading: boolean;
  error: string | null;
  needle: string;
}) {
  if (loading) {
    return <p className="text-[12.5px] text-[var(--fg-muted)]">Loading…</p>;
  }
  if (error !== null) {
    return <p className="text-[12.5px] text-[var(--status-err)]">{error}</p>;
  }
  if (records.length === 0) {
    return (
      <p className="max-w-[560px] text-[12px] leading-[1.6] text-[var(--fg-muted)]">
        No line in the kernel's retention window mentions{" "}
        <span className="font-mono text-[11px]">{needle}</span>. The window is
        bounded and it resets on restart, so this is "not recently", not "never".
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-surface)]">
      {records.map((r) => (
        <li key={r.seq} className="flex flex-col gap-0.5 px-3.5 py-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">
              {formatWhen(new Date(r.at_unix_ms).toISOString())}
            </span>
            <span
              className="font-mono text-[10px] uppercase"
              style={{ color: levelTone(r.level) }}
            >
              {r.level}
            </span>
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">
              {r.component}
            </span>
          </div>
          <span className="text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">
            {r.message}
          </span>
          {r.truncated && (
            <span className="font-mono text-[10px] text-[var(--status-warn)]">
              truncated — this is not the whole value
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function levelTone(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
      return "var(--status-err)";
    case "warn":
      return "var(--status-warn)";
    case "debug":
      return "var(--fg-muted)";
    default:
      return "var(--fg-secondary)";
  }
}

/** Pretty-print a JSON payload; leave anything else exactly as it arrived. */
function pretty(raw: string): string {
  if (raw === "") return "(no payload recorded)";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // Not JSON. Showing it raw is the honest rendering — a source that sends
    // something else is a fact about the source.
    return raw;
  }
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
