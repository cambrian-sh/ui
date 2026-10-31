import { useEffect, useRef, useState } from "react";
import { rememberDiscovery, rememberedDiscovery } from "./discoverySession";
import { Sparkle, Warning, Question, Check } from "@phosphor-icons/react";
import { Button, Input } from "@/design-system/components";
import { useMutation } from "@/lib/useMutation";
import { ipc } from "@/ipc";
import { cn } from "@/design-system/lib/utils";
import type {
  DiscoveryFinding,
  DiscoveryGap,
  DiscoveryQuestion,
  DiscoverySession,
  DiscoveryStep,
} from "@/ipc/types";
import { SectionLabel, Row, RowList, PathCell } from "./MappingReviewView";

/**
 * ADR-0115 — creating an ingress from a sentence and an endpoint.
 *
 * This replaces the one stage that was a form. The operator says what they want
 * and where it is; discovery inspects the source and PROPOSES a transport,
 * asking about anything it could not ground.
 *
 * # What this screen has to get right
 *
 * Discovery's findings are not equally certain, and rendering them as if they
 * were is the failure the whole design is arranged against. A `Cache-Control`
 * header is a cache lifetime, not a stated update frequency — so an inferred
 * cadence reads as a candidate WITH ITS BASIS, and only an observed value reads
 * as fact.
 *
 * The other half is that a refusal is not a to-do. A source that paginates by
 * `Link` header cannot be ingested by this deployment at all, and dressing that
 * up as "needs attention" would send an operator looking for a setting that
 * does not exist.
 */
export function DiscoverSource({
  ingressId,
  onChanged,
}: {
  ingressId: string;
  onChanged: () => void;
}) {
  const [intent, setIntent] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [session, setSession] = useState<DiscoverySession | null>(null);
  const [notice, setNotice] = useState("");

  const start = useMutation(ipc.studioStartDiscovery);
  const accept = useMutation(ipc.studioAcceptDiscovery);
  const comment = useMutation(ipc.studioCommentDiscovery);
  const lifecycle = useMutation(ipc.studioLifecycle);

  const run = async () => {
    setNotice("");
    const s = await start.mutate(ingressId, intent.trim(), endpoint.trim());
    if (s) {
      setSession(s);
      // Remembered immediately, not on completion: the run this is about to
      // watch is the one an operator is most likely to tab away from.
      rememberDiscovery(ingressId, s.session_id);
    }
  };

  // Resume the session this ingress was last watching.
  //
  // The kernel keeps running while the operator is on another tab, so coming
  // back should rejoin the run in progress rather than show an empty form. Only
  // the ID is remembered; the session is re-fetched, so what renders is always
  // the kernel's answer and never a stale copy.
  useEffect(() => {
    const remembered = rememberedDiscovery(ingressId);
    if (remembered === null || session !== null) return;
    let cancelled = false;
    void (async () => {
      const found = await ipc.studioGetDiscovery(ingressId, remembered);
      if (cancelled) return;
      // A session the kernel no longer has is forgotten rather than rendered as
      // an error: kernel sessions are in-memory, so a restart legitimately drops
      // them and the right answer is an empty form, not a complaint.
      if (!found || found.error !== "") rememberDiscovery(ingressId, null);
      else setSession(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [ingressId, session]);

  // Poll while the loop runs.
  //
  // StartDiscovery returns as soon as the session has an id, because a session
  // that researches an API takes minutes. Without this the console would show
  // the first frame forever and a slow provider would look like a dead kernel.
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session?.running || session.session_id === "") return;
    let cancelled = false;
    const tick = async () => {
      const next = await ipc.studioGetDiscovery(ingressId, session.session_id);
      if (cancelled || !next) return;
      setSession(next);
    };
    pollRef.current = window.setInterval(() => void tick(), 700);
    return () => {
      cancelled = true;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [ingressId, session?.running, session?.session_id]);

  return (
    <div className="flex flex-col gap-4">
      <Ask
        intent={intent}
        endpoint={endpoint}
        busy={start.isLoading}
        onIntent={setIntent}
        onEndpoint={setEndpoint}
        onRun={() => void run()}
      />

      {start.error !== null && (
        <Refusal>{start.error}</Refusal>
      )}

      {session && session.error !== "" && <Refusal>{session.error}</Refusal>}

      {session && session.error === "" && (
        <>
          {/* Rendered whenever the session is RUNNING, not only once a step
              exists. The deterministic probe happens before the loop emits
              anything, so gating on steps left a running session showing an
              empty panel — which is the state an operator reads as "nothing is
              happening". */}
          {(session.running || session.steps.length > 0) && (
            <Trace steps={session.steps} running={session.running} />
          )}
          {!session.running && <Outcome session={session} />}
          {session.pending_origins.length > 0 && (
            <PendingOrigins
              ingressId={ingressId}
              sessionId={session.session_id}
              origins={session.pending_origins}
              onGranted={setNotice}
            />
          )}
          {session.findings.length > 0 && <Findings findings={session.findings} />}
          {session.gaps.length > 0 && <Gaps gaps={session.gaps} />}
          {session.questions.length > 0 && (
            <Questions
              ingressId={ingressId}
              sessionId={session.session_id}
              questions={session.questions}
              onAnswered={setNotice}
            />
          )}
          {session.proposal && (
            <Accept
              session={session}
              busy={accept.isLoading}
              commenting={comment.isLoading || session.running}
              onComment={async (text) => {
                const res = await comment.mutate(ingressId, session.session_id, text);
                setNotice(res?.ok ? res.detail : (res?.error ?? ""));
              }}
              onAccept={async () => {
                const res = await accept.mutate(ingressId, session.session_id);
                if (!res?.ok) {
                  if (res) setNotice(res.error);
                  return;
                }
                // Accepting a transport and starting capture are ONE intention:
                // "use this source". They were two, in two different panes, and
                // the accept notice ended by telling an operator to go to
                // Lifecycle & History — which is the last place anyone looks and
                // the reason the flow felt like a maze.
                //
                // Capture writes nothing to the substrate: it profiles arrivals
                // so the mapping can be drafted from them. Nothing is armed by
                // it, so there is no gate being skipped here.
                const started = await lifecycle.mutate("start_capture", ingressId, "");
                if (started?.ok) {
                  setNotice(
                    `Saved as transport revision ${res.revision}, and capturing. The mapping is drafted from what actually arrives — nothing is armed until you say so.`,
                  );
                } else {
                  setNotice(
                    `Saved as transport revision ${res.revision}, but capture did not start: ${started?.error ?? "unknown"}`,
                  );
                }
                onChanged();
              }}
            />
          )}
        </>
      )}

      {notice !== "" && (
        <p className="text-[12px] leading-[1.6] text-[var(--fg-secondary)]">{notice}</p>
      )}
    </div>
  );
}

/** The two inputs. This is the whole form the studio still has. */
function Ask({
  intent,
  endpoint,
  busy,
  onIntent,
  onEndpoint,
  onRun,
}: {
  intent: string;
  endpoint: string;
  busy: boolean;
  onIntent: (v: string) => void;
  onEndpoint: (v: string) => void;
  onRun: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] p-3.5 tint-wash tint-ring"
      style={{ "--tint": "var(--accent-bg)" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <Sparkle
          aria-hidden="true"
          size={14}
          weight="fill"
          className="flex-none text-[var(--color-accent-400)]"
        />
        <h3 className="text-[13px] font-medium">Say what you want, and where it is</h3>
      </div>
      <p className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
        Cambrian inspects the source and proposes how to read it — what kind of
        thing it is, how often to poll it, where its records sit, whether it
        needs a credential. It asks about anything it cannot work out, and it
        proposes only: nothing is stored or armed until you accept.
      </p>
      <Input
        value={intent}
        onChange={(e) => onIntent(e.target.value)}
        aria-label="What do you want from this source?"
        placeholder="e.g. I want the earthquake data"
      />
      <Input
        value={endpoint}
        onChange={(e) => onEndpoint(e.target.value)}
        aria-label="Endpoint"
        placeholder="https://earthquake.usgs.gov/…/all_hour.geojson"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onRun}
          disabled={busy || endpoint.trim() === ""}
        >
          {busy ? "Looking…" : "Inspect this source"}
        </Button>
        <span className="text-[11px] text-[var(--fg-muted)]">
          Read-only. Cambrian only ever fetches, never writes to the source.
        </span>
      </div>
    </div>
  );
}

/**
 * The loop, as it happens.
 *
 * A discovery session is not instantaneous once it is researching an API — it
 * probes, searches, reads documentation and consults the model, and any one of
 * those can take a minute behind a throttled provider. Before this the console
 * showed nothing until everything had finished, so a slow call and a dead kernel
 * looked identical from here.
 *
 * The in-flight line is the point of the component: it names what is happening
 * RIGHT NOW, so waiting is legible as waiting.
 */
function Trace({ steps, running }: { steps: DiscoveryStep[]; running: boolean }) {
  // A ticking clock on the in-flight line.
  //
  // The whole research phase — every web search and page read the agent makes —
  // happens inside ONE call from the controller's point of view, so the trace
  // shows a single line for as long as it takes. Without elapsed time that line
  // is indistinguishable from a hang, which is exactly how it was read.
  const [now, setNow] = useState(() => Date.now());
  const inFlight = steps.length > 0 && steps[steps.length - 1].in_flight;
  useEffect(() => {
    if (!running || !inFlight) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, inFlight]);

  const elapsed = (at: string): string => {
    const started = Date.parse(at);
    if (Number.isNaN(started)) return "";
    const secs = Math.max(0, Math.round((now - started) / 1000));
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          {running ? "Working" : "What it did"}
        </h3>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {running
            ? "still going — you can watch, or leave it and come back"
            : (() => {
                const turns = steps.filter((s2) => s2.action !== "agent_tool").length;
                const research = steps.length - turns;
                return `${turns} step${turns === 1 ? "" : "s"}` +
                  (research > 0 ? `, ${research} tool call${research === 1 ? "" : "s"}` : "");
              })()}
        </span>
      </div>

      {steps.length === 0 && running && (
        // The first moments of a session, before the loop has emitted anything:
        // the endpoint is being fetched and classified. Saying so beats an empty
        // panel that reads as a dead screen.
        <p className="px-2 py-1.5 text-sm text-[var(--color-text-secondary)]">
          Inspecting the endpoint…
        </p>
      )}
      <ol className="flex flex-col gap-1" aria-live="polite" aria-busy={running}>
        {steps.map((step) => {
          // Two kinds of line, and conflating them misreads the run.
          //
          // A CONTROLLER step is a discovery action the kernel executed against
          // the source — numbered, and part of the audited trajectory. An
          // `agent_tool` line is the agent researching inside one of those steps:
          // subordinate work, not a numbered turn. It is indented and muted so
          // the shape of the run stays readable when a single planner call makes
          // six web requests.
          const research = step.action === "agent_tool";
          return (
          <li
            key={`${step.n}-${step.at}-${step.summary}`}
            className={
              "flex items-baseline gap-2 rounded-md py-1.5 text-sm " +
              (research ? "ml-6 pl-2 pr-2 border-l" : "px-2")
            }
            style={{
              background: step.in_flight ? "var(--color-surface-raised)" : "transparent",
              borderColor: research ? "var(--color-border-subtle, rgba(127,127,127,0.25))" : undefined,
            }}
          >
            <span
              aria-hidden
              className="shrink-0 text-xs tabular-nums text-[var(--color-text-tertiary)]"
            >
              {/* Research lines carry no number: they are not turns of the loop,
                  and numbering them would imply the trajectory is longer than it
                  is. */}
              {research ? "" : step.n}
            </span>
            <span
              aria-hidden
              className="shrink-0"
              style={{
                color: step.refusal !== ""
                  ? "var(--status-warn)"
                  : step.in_flight
                    ? "var(--color-accent-400)"
                    : "var(--color-text-tertiary)",
              }}
            >
              {step.refusal !== ""
                ? "⊘"
                : research
                  ? step.in_flight
                    ? "◌"
                    : "○"
                  : step.in_flight
                    ? "●"
                    : "✓"}
            </span>
            <span className="flex flex-col gap-0.5">
              <span
                className={research ? "font-mono text-xs" : undefined}
                style={{
                  color: research
                    ? "var(--color-text-tertiary)"
                    : step.in_flight
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                }}
              >
                {step.summary}
                {step.in_flight && (
                  <>
                    <span className="ml-2 text-xs tabular-nums text-[var(--color-text-tertiary)]">
                      {elapsed(step.at)}
                    </span>
                    <span className="sr-only"> — in progress</span>
                  </>
                )}
              </span>
              {/* The agent researches inside this one call: it may be running web
                  searches and reading documentation, none of which the controller
                  can see. Saying so stops a long wait reading as a stuck screen. */}
              {/* Only when nothing concrete has arrived. Once real tool lines are
                  streaming, saying "it may be searching" beside them is noise. */}
              {step.in_flight && step.action === "" && !steps.some((s2) => s2.action === "agent_tool") && (
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  the agent may be searching the web and reading documentation
                </span>
              )}
              {/* A refusal is not a fault: it is recorded, handed back to the
                  planner, and the loop continues. Shown so an operator can see
                  the loop adapting rather than failing. */}
              {step.refusal !== "" && (
                <span className="text-xs text-[var(--status-warn)]">{step.refusal}</span>
              )}
              {step.observed_ref !== "" && (
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  recorded as {step.observed_ref}
                </span>
              )}
            </span>
          </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * How the session ended.
 *
 * All four outcomes are successes: a session that abstained said something true.
 * Rendering "abstained" as a failure would teach an operator to distrust the one
 * answer that is always honest.
 */
function Outcome({ session }: { session: DiscoverySession }) {
  const tone =
    session.outcome === "proposed" ? "var(--status-ok, var(--color-accent-400))" : "var(--status-warn)";
  const headline =
    session.outcome === "proposed"
      ? "Cambrian has a proposal"
      : session.outcome === "abstained"
        ? "Cambrian stopped rather than guess"
        : session.outcome === "budget_exhausted"
          ? "Cambrian ran out of budget before it was sure"
          : // A broken planner is not a denied permission. Saying "policy
            // stopped this" sent an operator to check their access when the
            // actual fault was operational, so the two outcomes read
            // differently and point in different directions.
            session.outcome === "exploration_unavailable"
            ? "Exploration could not run — what you see below is what inspection alone settled"
            : "Policy stopped this";
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-medium" style={{ color: tone }}>
          {headline}
        </span>
        <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
          {session.requests_used > 0 && `${session.requests_used} requests`}
          {session.model_calls_used > 0 && ` · ${session.model_calls_used} model calls`}
        </span>
      </div>
      {session.reason !== "" && (
        <p className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
          {session.reason}
        </p>
      )}
    </div>
  );
}

/**
 * What it found, and how sure it is.
 *
 * The status is the point. `observed` and `documented` are facts; `inferred` is
 * a candidate and shows the rule and the basis it came from, because "every 60 s
 * — from Cache-Control: max-age=60" is checkable and "every 60 s" is a guess
 * wearing a suit.
 */
function Findings({ findings }: { findings: DiscoveryFinding[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel note="what it saw, and how sure it is">
        Findings
      </SectionLabel>
      <RowList>
        {findings.map((f) => (
          <Row key={f.field} align="start">
            <PathCell>{f.field}</PathCell>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[11.5px] text-[var(--fg-primary)]">
                  {f.proposed_value || "—"}
                </span>
                <StatusChip status={f.status} confidence={f.confidence} />
                {f.bounds_max > 0 && (
                  <span className="font-mono text-[10px] text-[var(--fg-muted)]">
                    between {f.bounds_min} and {f.bounds_max}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] leading-[1.5] text-[var(--fg-muted)]">
                {f.explanation}
              </p>
              {/* The rule and the evidence, so a value is traceable rather than
                  trusted. A finding that cannot name its evidence is refused
                  server-side, so this should never be empty. */}
              <span className="font-mono text-[9.5px] text-[var(--fg-muted)]">
                {f.rule_id}
                {f.evidence_refs.length > 0 && ` · ${f.evidence_refs.join(", ")}`}
              </span>
            </div>
          </Row>
        ))}
      </RowList>
    </section>
  );
}

function StatusChip({ status, confidence }: { status: string; confidence: number }) {
  const fact = status === "observed" || status === "documented";
  const label =
    status === "observed"
      ? "observed"
      : status === "documented"
        ? "the source's own docs"
        : status === "inferred"
          ? `inferred${confidence > 0 ? ` · ${Math.round(confidence * 100)}%` : ""}`
          : status;
  return (
    <span
      className={cn(
        "rounded-[3px] px-1.5 py-0.5 font-mono text-[9.5px] tint-fill",
        fact ? "text-[var(--color-accent-400)]" : "text-[var(--status-warn)]",
      )}
      style={
        {
          "--tint": fact ? "var(--color-accent-400)" : "var(--status-warn)",
        } as React.CSSProperties
      }
    >
      {label}
    </span>
  );
}

/**
 * What it could not work out.
 *
 * A refusal and a gap look similar and are not: a gap is a question somebody can
 * answer, a refusal is something this deployment cannot do at all. Showing them
 * the same way sends an operator hunting for a setting that does not exist.
 */
function Gaps({ gaps }: { gaps: DiscoveryGap[] }) {
  const refusals = gaps.filter((g) => g.refusal);
  const open = gaps.filter((g) => !g.refusal);
  return (
    <>
      {refusals.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionLabel note="no amount of looking will fix these">
            This deployment cannot ingest that
          </SectionLabel>
          <RowList>
            {refusals.map((g) => (
              <Row key={g.field} align="start" tone="warn">
                <Warning
                  aria-hidden="true"
                  size={13}
                  className="mt-[2px] flex-none text-[var(--status-err)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-[var(--status-err)]">
                    {g.field}
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-[1.55] text-[var(--fg-secondary)]">
                    {g.why}
                  </p>
                </div>
              </Row>
            ))}
          </RowList>
        </section>
      )}
      {open.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionLabel note="nothing observed settles these">
            Still open
          </SectionLabel>
          <RowList>
            {open.map((g) => (
              <Row key={g.field} align="start">
                <PathCell>{g.field}</PathCell>
                <p className="min-w-0 flex-1 text-[11.5px] leading-[1.55] text-[var(--fg-muted)]">
                  {g.why}
                </p>
              </Row>
            ))}
          </RowList>
        </section>
      )}
    </>
  );
}

/**
 * The reply box for a free-text question.
 *
 * Local state per question, so typing in one does not re-render the others and
 * an answer in flight cannot land against the wrong question.
 */
function FreeTextAnswer({
  question,
  onSubmit,
}: {
  question: DiscoveryQuestion;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const send = () => {
    const v = value.trim();
    // An empty answer is not a decision. Submitting one would record "the
    // operator chose nothing" as though they had chosen.
    if (v === "") return;
    onSubmit(v);
    setValue("");
  };
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <input
        aria-label={question.prompt}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Your answer…"
        className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[11.5px]"
        style={{
          background: "var(--bg-input, transparent)",
          borderColor: "var(--border-subtle, rgba(127,127,127,0.3))",
          color: "var(--fg-primary)",
        }}
      />
      <Button size="sm" variant="secondary" disabled={value.trim() === ""} onClick={send}>
        Answer
      </Button>
    </div>
  );
}

/** The decisions only a human can make. */
function Questions({
  ingressId,
  sessionId,
  questions,
  onAnswered,
}: {
  ingressId: string;
  sessionId: string;
  questions: DiscoveryQuestion[];
  onAnswered: (msg: string) => void;
}) {
  const answer = useMutation(ipc.studioAnswerDiscovery);
  const open = questions.filter((q) => q.status === "open");
  if (open.length === 0) return null;

  const submit = async (q: DiscoveryQuestion, value: string) => {
    const res = await answer.mutate(
      ingressId, sessionId, q.id, value, q.version, q.asked_at_revision,
      `${q.id}:${value}`,
    );
    if (res) onAnswered(res.ok ? res.detail : res.error);
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel note={`${open.length} to decide`}>
        Cambrian needs you
      </SectionLabel>
      <RowList>
        {open.map((q) => (
          <Row key={q.id} align="start" tone="warn">
            <Question
              aria-hidden="true"
              size={12}
              weight="bold"
              className="mt-[2px] flex-none text-[var(--status-warn)]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
                {q.prompt}
              </p>
              {/* Provenance. A question shaped by text the source wrote must not
                  read as if Cambrian composed it. */}
              {q.from_untrusted && (
                <p className="mt-0.5 text-[10px] leading-[1.4] text-[var(--fg-muted)]">
                  Phrased from what the source said about itself — treat its
                  wording as a claim, not as instruction.
                </p>
              )}
              {q.shape === "secret" ? (
                <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">
                  This needs a credential. Add it on the Specs tab — the value
                  goes straight to the credential store and never through this
                  screen.
                </p>
              ) : q.options.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {q.options.map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant="secondary"
                      onClick={() => void submit(q, opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              ) : q.shape === "confirm" ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => void submit(q, "yes")}>
                    Yes
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void submit(q, "no")}>
                    No
                  </Button>
                </div>
              ) : (
                // Free text — and without this the question was unanswerable.
                //
                // The render used to be "secret, or else render the options", and a
                // free_text question HAS no options, so it produced an empty div: the
                // prompt was on screen with nothing to reply into. Every question that
                // matters here is free text — where you want the data, how fresh it
                // needs to be — so the console could ask and never listen.
                <FreeTextAnswer question={q} onSubmit={(v) => void submit(q, v)} />
              )}
            </div>
          </Row>
        ))}
      </RowList>
    </section>
  );
}

/**
 * Origins discovery wanted and could not have.
 *
 * A separate decision because it is a separate right: approving where probes may
 * go is not implied by being allowed to run one. The grant is exact — scheme,
 * host and port — and it does not authorise a credential there.
 */
function PendingOrigins({
  ingressId,
  sessionId,
  origins,
  onGranted,
}: {
  ingressId: string;
  sessionId: string;
  origins: string[];
  onGranted: (msg: string) => void;
}) {
  const approve = useMutation(ipc.studioApproveOrigin);
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel note="a new host is your decision, never Cambrian's">
        Wants to look somewhere else
      </SectionLabel>
      <RowList>
        {origins.map((o) => {
          const parsed = parseOrigin(o);
          return (
            <Row key={o} align="start" tone="warn">
              <span className="min-w-0 flex-1 font-mono text-[11px]">{o}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={parsed === null || approve.isLoading}
                onClick={async () => {
                  if (!parsed) return;
                  const res = await approve.mutate(
                    ingressId, sessionId, parsed.scheme, parsed.host, parsed.port,
                  );
                  if (res) onGranted(res.ok ? res.detail : res.error);
                }}
              >
                Allow this host
              </Button>
            </Row>
          );
        })}
      </RowList>
    </section>
  );
}

/** `https://host:port` → its parts. Exact origins only. */
export function parseOrigin(
  s: string,
): { scheme: string; host: string; port: string } | null {
  try {
    const u = new URL(s);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return { scheme: u.protocol.replace(":", ""), host: u.hostname, port };
  } catch {
    return null;
  }
}

/** The proposal, and the one button that stores anything. */
function Accept({
  session,
  busy,
  commenting,
  onAccept,
  onComment,
}: {
  session: DiscoverySession;
  busy: boolean;
  commenting: boolean;
  onAccept: () => void;
  onComment: (comment: string) => void;
}) {
  const p = session.proposal!;
  const blocked = session.questions.some((q) => q.status === "open");
  const [comment, setComment] = useState("");
  return (
    <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5">
      <div className="flex items-center gap-2">
        <Check
          aria-hidden="true"
          size={13}
          weight="bold"
          className="flex-none text-[var(--color-accent-400)]"
        />
        <h3 className="text-[13px] font-medium">What it proposes</h3>
      </div>
      <div className="font-mono text-[11.5px] leading-[1.7] text-[var(--fg-secondary)]">
        {p.archetype}
        {p.format !== "" && ` · ${p.format}`}
        {p.cadence_seconds > 0 && ` · ${humanCadence(p.cadence_seconds)}`}
        {p.collection_root !== "" && ` · records at ${p.collection_root}`}
        {p.cursor_path !== "" && ` · cursor from ${p.cursor_path}`}
        {p.cursor_source === "link" && ` · pages by next link (${p.cursor_param || "parameter not set"})`}
      </div>
      {p.cadence_seconds > 0 && (
        /* The number alone cannot be checked. An operator was asked "every few
           minutes, hourly, or once a day", answered, and the proposal said 10
           seconds — with nothing on screen to contradict it. Showing the answer
           the number came from is what makes a wrong number recognisable by the
           one person who can recognise it. */
        <p className="text-[11px] leading-[1.6] text-[var(--fg-secondary)]">
          {p.cadence_because !== "" ? (
            <>
              Polling {humanCadence(p.cadence_seconds)}, from your answer:{" "}
              <span className="text-[var(--fg-primary)]">“{p.cadence_because}”</span>
            </>
          ) : (
            <span className="text-[var(--status-warn)]">
              Nobody chose this cadence — {humanCadence(p.cadence_seconds)} is the
              agent’s own guess. Say what you want below if it is wrong.
            </span>
          )}
        </p>
      )}
      <p className="text-[11.5px] leading-[1.6] text-[var(--fg-secondary)]">
        {/* It does NOT start capture, and saying so sent an operator looking for
            a capture phase that never began. Accept writes the revision;
            StartCapture is a separate decision on the Lifecycle pane, because
            saving what a source looks like and beginning to pull from it are
            different commitments. */}
        Accepting saves this as a transport revision and starts capturing.
        Nothing is armed by that: capture profiles what arrives so the mapping
        can be drafted from real deliveries, because one probe is not a sample.
        Arming is a separate decision, later, and yours.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onAccept} disabled={busy || blocked || commenting}>
          {busy ? "Saving…" : "Accept and start capturing"}
        </Button>
        {blocked && (
          <span className="text-[11px] text-[var(--status-warn)]">
            Answer the open decisions first — each one changes what gets stored.
          </span>
        )}
      </div>

      {/* Accept and reject were the only two things an operator could do, and
          the common case is neither: one field is wrong and the rest is right.
          A proposal arrived polling a weather API every five seconds — rejecting
          it would have discarded a run that had already asked the operator where
          they were and got an answer.

          Nothing here parses the comment. It is handed to the agent as text, the
          same way an answer is, because the agent is the only part of this that
          can read "hourly is plenty" and turn it into a number. */}
      <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle,rgba(127,127,127,0.2))] pt-2.5">
        <label
          htmlFor="discovery-comment"
          className="text-[11px] text-[var(--fg-secondary)]"
        >
          Something wrong with it? Say what should change, and it will revise.
          Your current proposal stands until it has a better one.
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="discovery-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && comment.trim() !== "") {
                e.preventDefault();
                onComment(comment.trim());
                setComment("");
              }
            }}
            placeholder="e.g. hourly is plenty, not every 5 seconds"
            disabled={commenting || busy}
            className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[11.5px]"
            style={{
              background: "var(--bg-input, transparent)",
              borderColor: "var(--border-subtle, rgba(127,127,127,0.3))",
              color: "var(--fg-primary)",
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={commenting || busy || comment.trim() === ""}
            onClick={() => {
              onComment(comment.trim());
              setComment("");
            }}
          >
            {commenting ? "Revising…" : "Send"}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Seconds as a person would say them. `3600` reads as an hour, not "3600s". */
function humanCadence(seconds: number): string {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400;
    return d === 1 ? "once a day" : `every ${d} days`;
  }
  if (seconds % 3600 === 0) {
    const h = seconds / 3600;
    return h === 1 ? "hourly" : `every ${h} hours`;
  }
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return m === 1 ? "every minute" : `every ${m} minutes`;
  }
  return `every ${seconds}s`;
}

function Refusal({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-[var(--radius-lg)] p-3 text-[11.5px] leading-[1.6] tint-wash"
      style={{ "--tint": "var(--status-err)" } as React.CSSProperties}
    >
      {children}
    </p>
  );
}
