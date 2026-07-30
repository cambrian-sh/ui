import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/design-system/components';
import { ChatMessage } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { cn } from '@/design-system/lib/utils';
import { ipc } from '@/ipc';
import { errorMessage } from '@/lib/errorMessage';
import { useMutation } from '@/lib/useMutation';
import { useStore } from '@/store/useStore';
import { projectionStore } from '@/store/projection';
import { formatDuration, formatTokens } from '@/lib/format';
import { useNavigate } from '@tanstack/react-router';
import { setPlanDraft } from '@/screens/plan/planDraft';
import { ConversationRail } from './ConversationRail';
import {
  EMPTY_WORK,
  rememberConversation,
  rememberWork,
  rememberedConversation,
  rememberedWork,
} from './chatSession';
import type {
  ClassifiedInput,
  ConversationMessage,
  ConversationProgress,
  ConversationSummary,
  InputClassification,
  InterviewQuestion,
  PlanInFlight,
  PlanProposal,
  SubmitPlanResult,
} from '@/ipc/types';

const CLASSIFICATION: Record<
  InputClassification,
  { label: string; tone: string; overrule: string }
> = {
  chat: {
    label: 'read as a question',
    tone: 'var(--status-live)',
    overrule: 'Make it a task instead →',
  },
  plan: {
    label: 'read as a task',
    tone: 'var(--status-warn)',
    overrule: 'Just answer me instead →',
  },
  // `ingest` WRITES to memory, and what it writes inherits the ingress's labels.
  // It gets its own row rather than being folded into `plan` precisely because
  // approving a write is a different decision from approving a task.
  ingest: {
    label: 'read as something to remember',
    tone: 'var(--status-warn)',
    overrule: 'Just answer me instead →',
  },
  watch: {
    label: 'read as a watch',
    tone: 'var(--color-accent-400)',
    overrule: 'Run it once instead →',
  },
  // The router itself could not decide. There is nothing to overrule — the
  // question it is asking is the next step.
  clarification: {
    label: 'needs one answer before it can act',
    tone: 'var(--color-accent-400)',
    overrule: '',
  },
};

/**
 * Chat — where an operator gives Cambrian work (`12a`).
 *
 * The one thing this screen must get right: the router's reading of a sentence
 * is **the most consequential thing that happens to it**. *"Look at the refund
 * logs"* either answers in two seconds or spawns a plan that spends tokens and
 * touches files. So the classification is shown **before it acts**, with one
 * click to overrule; the interview **asks rather than guesses**; and a plan
 * arrives as a **proposal you can approve, edit or refuse**.
 *
 * Nothing is committed until Run it. The header says so, and it is enforceable
 * rather than decorative: `ProposePlan` creates no session, starts no plan and
 * spends nothing.
 */
export function ChatConsole() {
  const projection = useStore(projectionStore);
  const state = projection.state;

  const [text, setText] = useState('');
  const [memoryOnly, setMemoryOnly] = useState(false);
  const [alwaysPropose, setAlwaysPropose] = useState(true);

  // Seeded from what the screen remembers, so returning from another tab does
  // not wipe the proposal being weighed or the run just approved.
  const remembered = rememberedWork(rememberedConversation());
  const [classified, setClassified] = useState<ClassifiedInput | null>(remembered.classified);
  const [proposal, setProposal] = useState<PlanProposal | null>(remembered.proposal);
  const [questions, setQuestions] = useState<InterviewQuestion[]>(remembered.questions);
  const [answers, setAnswers] = useState<string[]>(remembered.answers);
  const [accessNote, setAccessNote] = useState(remembered.accessNote);
  // What `Run it` produced. Until this is set the header's promise holds; once it
  // is, the screen must stop claiming nothing is committed — the session exists.
  const [started, setStarted] = useState<SubmitPlanResult | null>(remembered.started);

  // The conversation lane (ADR-0084 D9). Its LIST lives in the rail and its
  // transcript in this column — one composer at the bottom drives both, which is
  // what stops the screen growing a second one.
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(rememberedConversation());
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [laneError, setLaneError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const hasChat = (state?.capabilities ?? []).includes('chat');

  // What the runtime is doing RIGHT NOW for this conversation (contract 0079).
  //
  // The same ADR-0098 snapshots Telegram renders as an edited status message.
  // The console had been getting none of them: progress delivery went through
  // the conversation's ingress address, and a console conversation has none, so
  // every snapshot was computed and dropped. It is keyed by conversation so a
  // second conversation running in the background cannot narrate over this one.
  const progress = activeId ? state?.conversation_progress?.[activeId] : undefined;

  // The plan this chat started, as it is running (contract 0047 `PlanStateOp`).
  //
  // A plan is not a conversation, so it produces no conversation progress — but
  // that is a reason to render a DIFFERENT progress, not to send the operator to
  // another screen. The projection already folds every step transition; matching
  // on plan id (falling back to session id, which is what `SubmitPlan` always
  // returns) is all that was missing.
  const runState = useMemo(() => {
    if (!started?.accepted) return undefined;
    const match = (p: PlanInFlight) =>
      (started.plan_id && p.plan_id === started.plan_id) ||
      (started.session_id && p.session_id === started.session_id);

    const live = (state?.plans ?? []).find(match);
    if (live) return { plan: live, finished: false };

    // Not in flight does not mean not started. The fold moves a plan to
    // `completed_plans` the moment it goes terminal, and reading only `plans`
    // was why a finished run kept claiming it was waiting for its first step.
    const done = (state?.completed_plans ?? []).find(match);
    if (done) return { plan: done, finished: true };

    return undefined;
  }, [state?.plans, state?.completed_plans, started]);
  const activeTitle =
    conversations.find((c) => c.id === activeId)?.title ?? 'New conversation';

  const refreshList = useCallback(async () => {
    try {
      setConversations(await ipc.listConversations({ limit: 100 }));
    } catch (e) {
      setLaneError(errorMessage(e));
    }
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setLaneError(null);
    // Shaping state belongs to a conversation, not to the screen. Switching
    // without swapping it would leave a proposal built from one conversation's
    // sentence sitting above another's transcript, one click from approval.
    const w = rememberedWork(id);
    setClassified(w.classified);
    setProposal(w.proposal);
    setQuestions(w.questions);
    setAnswers(w.answers);
    setAccessNote(w.accessNote);
    setStarted(w.started);
    try {
      setMessages(
        await ipc.listConversationMessages({ conversation_id: id, after_seq: 0, limit: 0 }),
      );
    } catch (e) {
      setLaneError(errorMessage(e));
    }
  }, []);

  const startNewConversation = useCallback(async () => {
    const id = crypto.randomUUID();
    try {
      await ipc.openConversation({
        conversation_id: id,
        title: 'New conversation',
        profile: 'operator',
        policy: '',
        reason: 'open-conversation',
      });
      setActiveId(id);
      setMessages([]);
      // A new conversation clears the shaping state: the classification and
      // proposal belonged to the previous sentence, and leaving them up would
      // invite approving a plan built from something else entirely.
      setClassified(null);
      setProposal(null);
      setQuestions([]);
      setAnswers([]);
      setAccessNote('');
      setStarted(null);
      rememberWork(id, EMPTY_WORK);
      void refreshList();
    } catch (e) {
      setLaneError(errorMessage(e));
    }
  }, [refreshList]);

  useEffect(() => {
    if (!hasChat) return;
    let cancelled = false;
    void (async () => {
      let list: ConversationSummary[] = [];
      // A failed list is NOT an empty list. Conflating them let a transient read
      // error mint a fresh conversation, which reads exactly like the history was
      // wiped — and is self-perpetuating, because the new empty conversation then
      // sorts to the top and gets selected on every later visit.
      let listed = false;
      try {
        list = await ipc.listConversations({ limit: 100 });
        listed = true;
      } catch (e) {
        if (!cancelled) setLaneError(errorMessage(e));
      }
      if (cancelled) return;
      setConversations(list);

      if (list.length > 0) {
        // Return to the conversation the operator left, not to whichever one
        // happens to sort first. They only differ when the operator had scrolled
        // back to something older — which is exactly when being moved is worst.
        const prev = rememberedConversation();
        const target = prev && list.some((c) => c.id === prev) ? prev : list[0].id;
        void selectConversation(target);
      } else if (listed) {
        void startNewConversation();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChat]);

  // Remember where we are and what we were doing, on every change. Cheap, and it
  // means an unmount needs no teardown hook to get this right — there is no
  // "save on the way out" that a crash or a fast route change could skip.
  useEffect(() => {
    rememberConversation(activeId);
  }, [activeId]);

  useEffect(() => {
    rememberWork(activeId, { classified, proposal, questions, answers, accessNote, started });
  }, [activeId, classified, proposal, questions, answers, accessNote, started]);

  // Keep the newest turn in view. Guarded — jsdom does not implement scrollTo.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight });
    }
  }, [messages, proposal, questions]);

  const classify = useMutation(async (input: string) => {
    const c = await ipc.classifyInput(input);
    setClassified(c);
    return c;
  });

  const propose = useMutation(async (goal: string, replies: string[] = []) => {
    const r = await ipc.proposePlan(goal, replies);
    setQuestions(r.questions);
    setAnswers(new Array(r.questions.length).fill(''));
    setProposal(r.proposal);
    setAccessNote(r.access_consequence);
    return r;
  });

  /**
   * Approve the proposal.
   *
   * This is the moment the promise in the header stops being true, so the result
   * has to reach the screen: before this fix the plan started and the chat showed
   * nothing, which left an operator watching a transcript that looked like their
   * click had been swallowed while a session was quietly running in another tab.
   */
  const run = useMutation(async (steps: PlanProposal['steps'], reason: string) => {
    const result = await ipc.submitPlan(steps, reason);
    setStarted(result);
    if (result.accepted) {
      // The proposal is spent. Leaving it on screen invites a second Run it,
      // and the plan it described is now a running session rather than a draft.
      setProposal(null);
      setQuestions([]);
    }
    return result;
  });

  /** Send a turn on the conversation lane — the answer-me path. */
  const sendTurn = useCallback(
    async (body: string) => {
      if (!activeId) return;
      setSending(true);
      // Echo the operator's own turn immediately. Waiting for the round trip
      // would leave the transcript looking like the message was dropped, which
      // is exactly when someone sends it again.
      const echo: ConversationMessage = {
        id: `pending-${Date.now()}`,
        conversation_id: activeId,
        seq: -1,
        role: 'user',
        content: body,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, echo]);
      try {
        const reply = await ipc.sendTurn({
          conversation_id: activeId,
          text: body,
          reason: 'chat-turn',
        });
        // A null reply is a turn the kernel accepted without an answer to show.
        // Appending it would render an empty bubble, which reads as a broken
        // response rather than as "nothing came back".
        if (reply) setMessages((m) => [...m, reply]);
        void refreshList();
      } catch (e) {
        setLaneError(errorMessage(e));
      } finally {
        setSending(false);
      }
    },
    [activeId, refreshList],
  );

  /**
   * Submit, honouring the composer's affordances.
   *
   * `skipProposal` is ⌘⏎ — "run without proposing", for the operator who already
   * knows what they want. It is deliberately the only path that commits directly.
   */
  const submit = useCallback(
    async (skipProposal: boolean) => {
      const body = text.trim();
      if (!body) return;
      setText('');

      // Always classify first: the decision is shown before anything acts on it.
      const c = await classify.mutate(body);

      if (memoryOnly || c?.classification === 'chat') {
        await sendTurn(body);
        return;
      }
      if (skipProposal && !alwaysPropose) {
        // Straight to the planner. The classification banner is still shown, so
        // the operator sees what it was read as even on the fast path.
        await sendTurn(body);
        return;
      }
      await propose.mutate(body);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, memoryOnly, alwaysPropose, sendTurn],
  );

  const unavailable = classify.error || propose.error;
  const scopeLabel = useMemo(
    () => (state?.role === 'operator' ? 'everything' : 'scoped'),
    [state?.role],
  );

  return (
    <div className="flex h-full min-h-0">
      <ConversationRail
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => void selectConversation(id)}
        onNew={() => void startNewConversation()}
        plans={state?.plans ?? []}
        pendingHitl={state?.pending_hitl ?? []}
        scopeLabel={scopeLabel}
        role={state?.role ?? null}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex-none px-[26px] pb-3 pt-4 shadow-[inset_0_-1px_0_var(--border-subtle)]">
          <h1 className="text-[19px] font-medium leading-[1.25] tracking-[-0.01em]">
            {activeTitle}
          </h1>
          {/* The promise the screen makes, stated where it is made. */}
          <p className="mt-1 font-mono text-[11px] text-[var(--fg-muted)]">
            {started?.accepted ? (
              <span className="text-[var(--status-live)]">
                running · session {started.session_id || 'started'}
              </span>
            ) : (
              'nothing committed yet · no session, no plan, no spend'
            )}
          </p>
        </header>

        {/* The transcript column. `overflow-y: auto` is not optional — it is a
            chat log, and a column that grows the page instead of scrolling puts
            the composer below the fold exactly when a conversation gets long. */}
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[26px] py-[22px]">
          {!hasChat && (
            <p className="text-[12.5px] leading-[1.55] text-[var(--fg-muted)]">
              This kernel does not advertise the <code>chat</code> capability, so the
              conversation lane is not wired. Classification and plan proposal are separate
              and still work.
            </p>
          )}

          {messages.map((m, i) => (
            <ChatMessage
              key={m.id || `${m.seq}-${i}`}
              author={m.role === 'user' ? 'operator' : 'runtime'}
              text={m.content}
              timestamp={m.created_at}
            />
          ))}

          {progress && <ProgressLine progress={progress} />}

          {classified && (
            <ClassificationBanner
              classified={classified}
              onOverrule={() => {
                const next: InputClassification =
                  classified.classification === 'plan' ? 'chat' : 'plan';
                setClassified({
                  ...classified,
                  classification: next,
                  why: 'You overruled the router.',
                });
                setProposal(null);
                setQuestions([]);
              }}
            />
          )}

          {questions.length > 0 && (
            <InterviewCard
              questions={questions}
              answers={answers}
              onAnswer={(i, v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}
              busy={propose.isLoading}
              onSubmit={() => void propose.mutate(text || activeTitle, answers)}
            />
          )}

          {/* Volunteered BEFORE planning, not discovered after the answer already
              quotes a customer record. */}
          {accessNote && (
            <p
              className="max-w-[720px] rounded-md p-2.5 text-[12px] leading-[1.55] tint-wash tint-ring"
              style={{ '--tint': 'var(--status-warn)' } as React.CSSProperties}
            >
              <span className="text-[var(--status-warn)]">One thing you should know: </span>
              <span className="text-[var(--fg-secondary)]">{accessNote}</span>
            </p>
          )}

          {started && (
            <SubmitOutcome
              result={started}
              run={runState}
              onOpenSessions={() =>
                void navigate({ to: '/tasks', search: { focus: undefined } })
              }
            />
          )}

          {proposal && (
            <ProposalCard
              proposal={proposal}
              busy={run.isLoading}
              onRun={() => void run.mutate(proposal.steps, 'approved from chat')}
              onOpenBuilder={() => {
                setPlanDraft({ title: activeTitle, steps: proposal.steps });
                void navigate({ to: '/plan-builder' });
              }}
              onDiscard={() => {
                setProposal(null);
                setQuestions([]);
              }}
            />
          )}

          {(unavailable || laneError) && (
            <ErrorState
              reason={(classify.error ?? propose.error ?? laneError) as string}
              whatToDo="Nothing was sent. If the kernel does not serve the classification or propose-only path, those affordances stay dark and the conversation lane still works."
            />
          )}
        </div>

        <Composer
          text={text}
          onText={setText}
          memoryOnly={memoryOnly}
          onMemoryOnly={setMemoryOnly}
          alwaysPropose={alwaysPropose}
          onAlwaysPropose={setAlwaysPropose}
          busy={classify.isLoading || propose.isLoading || sending}
          onSubmit={(skip) => void submit(skip)}
        />
      </div>
    </div>
  );
}

/**
 * A plan's steps as they run, inline in the conversation that started it.
 *
 * The card used to say progress lives in Sessions. That is true of the *full*
 * trace and stays one click away, but sending someone to another screen to learn
 * whether the thing they just approved is moving is the wrong default: the
 * question is asked here, so the answer belongs here.
 *
 * Every field comes from the feed fold — nothing polls, and nothing is invented
 * when the feed has not spoken yet.
 */
/** Whether a finished plan ended badly, by the only signals the feed gives us. */
function planFailed(plan: PlanInFlight): boolean {
  return /fail|error|abort|cancel/i.test(plan.status) || plan.steps?.some((st) => st.status === 'failed') === true;
}

function headline(run?: { plan: PlanInFlight; finished: boolean }): string {
  if (!run) return 'Running';
  if (!run.finished) return 'Running';
  return planFailed(run.plan) ? 'Did not finish' : 'Finished';
}

function headlineTone(run?: { plan: PlanInFlight; finished: boolean }): string {
  if (run?.finished && planFailed(run.plan)) return 'var(--status-err)';
  if (run?.finished) return 'var(--fg-secondary)';
  return 'var(--status-live)';
}

/**
 * A plan's steps as they run, inline in the conversation that started it.
 *
 * The card used to say progress lives in Sessions. That is true of the *full*
 * trace and stays one click away, but sending someone to another screen to learn
 * whether the thing they just approved is moving is the wrong default: the
 * question is asked here, so the answer belongs here.
 *
 * Every field comes from the feed fold — nothing polls, and nothing is invented
 * when the feed has not spoken yet.
 */
function PlanLadder({
  result,
  run,
}: {
  result: SubmitPlanResult;
  run?: { plan: PlanInFlight; finished: boolean };
}) {
  // No PlanStateOp at all. This is the ONLY honest "waiting" case; a plan that
  // has finished must never land here, which is what the terminal fold now
  // guarantees by keeping the outcome instead of dropping it.
  if (!run) {
    return (
      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">
        Accepted
        {result.execution_order.length > 0 ? ` · ${result.execution_order.length} steps` : ''}.
        Waiting for the first step to report.
      </p>
    );
  }

  const { plan, finished } = run;
  const steps = plan.steps ?? [];
  const done = steps.filter((st) => st.status === 'done').length;
  const failed = steps.some((st) => st.status === 'failed');

  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
      <p className="font-mono text-[10.5px] text-[var(--fg-muted)]">
        {plan.status}
        {steps.length > 0 && ` · ${done} of ${steps.length} steps`}
        {!finished && plan.active_agent && ` · ${plan.active_agent}`}
      </p>

      {steps.map((st) => {
        // Only the running step is emphasised. Colouring every row would make
        // the one that is actually moving impossible to find at a glance.
        const tone =
          st.status === 'running' && !finished
            ? 'var(--status-live)'
            : st.status === 'failed'
              ? 'var(--status-err)'
              : st.status === 'done'
                ? 'var(--fg-secondary)'
                : 'var(--fg-muted)';
        return (
          <div key={st.index} className="flex items-baseline gap-2 text-[12px] leading-[1.5]">
            <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
              {String(st.index + 1).padStart(2, '0')}
            </span>
            {st.status === 'running' && !finished && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 flex-none animate-pulse self-center rounded-full bg-[var(--status-live)]"
              />
            )}
            <span style={{ color: tone }}>{st.label}</span>
            {st.agent && (
              <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{st.agent}</span>
            )}
          </div>
        );
      })}

      {/* A finished plan with no DAG is not a broken render — some emitters send
          no step structure at all. Say what is known rather than nothing. */}
      {finished && steps.length === 0 && (
        <p className="text-[11.5px] leading-[1.5] text-[var(--fg-secondary)]">
          The run ended. It reported no step detail — the full trace is in Sessions.
        </p>
      )}

      {failed && (
        <p className="text-[11.5px] leading-[1.5] text-[var(--status-err)]">
          A step failed. The full trace, including the agent output, is in Tasks.
        </p>
      )}
    </div>
  );
}

/**
 * The live status line — what the runtime is doing this second.
 *
 * Rendered as a *transient* row rather than a transcript message, because it is
 * not part of the conversation: it is replaced in place as the turn advances and
 * disappears when the turn ends. Writing each snapshot into the log instead would
 * leave a permanent trail of "Searching memory…" above every answer.
 */
function ProgressLine({ progress }: { progress: ConversationProgress }) {
  // Only show the counter when the kernel actually knows the denominator —
  // "step 1 of 0" is worse than no counter at all.
  const counter =
    progress.total_steps > 0 ? `step ${progress.step} of ${progress.total_steps}` : null;

  return (
    <div
      className="flex max-w-[720px] items-center gap-2.5 text-[12.5px] leading-[1.55] text-[var(--fg-secondary)]"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-[var(--status-live)]"
      />
      <span>{progress.text}</span>
      {counter && <span className="font-mono text-[11px] text-[var(--fg-muted)]">{counter}</span>}
    </div>
  );
}

/**
 * The composer, with its affordances made explicit (`12a` §C.0).
 *
 * The defaults are stated rather than hidden in a menu: an operator who wants an
 * answer and not a plan should not have to discover that `Answer from memory
 * only` exists after a plan has already spent tokens.
 */
function Composer({
  text,
  onText,
  memoryOnly,
  onMemoryOnly,
  alwaysPropose,
  onAlwaysPropose,
  busy,
  onSubmit,
}: {
  text: string;
  onText: (v: string) => void;
  memoryOnly: boolean;
  onMemoryOnly: (v: boolean) => void;
  alwaysPropose: boolean;
  onAlwaysPropose: (v: boolean) => void;
  busy: boolean;
  onSubmit: (skipProposal: boolean) => void;
}) {
  return (
    <div className="flex flex-none flex-col gap-2 px-[26px] pb-3.5 pt-3 shadow-[inset_0_1px_0_var(--border-subtle)]">
      <div className="flex max-w-[860px] items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (e.shiftKey) return; // newline
            e.preventDefault();
            // ⌘⏎ / Ctrl⏎ runs without proposing — the fast path for an operator
            // who already knows what they want.
            onSubmit(e.metaKey || e.ctrlKey);
          }}
          rows={2}
          placeholder="Go through the refund logs and tell me if anything looks like the same customer refunded twice"
          aria-label="What do you want"
          className="min-h-[44px] w-full resize-y rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] leading-[1.5] text-[var(--input-fg)]"
        />
        <Button
          className="h-11 shrink-0 px-4"
          disabled={!text.trim() || busy}
          onClick={() => onSubmit(false)}
        >
          {busy ? 'Working…' : 'Send'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CheckAffordance
          label="Answer from memory only"
          checked={memoryOnly}
          onChange={onMemoryOnly}
        />
        <CheckAffordance
          label="Always propose before running"
          checked={alwaysPropose}
          onChange={onAlwaysPropose}
        />
        <button
          type="button"
          disabled
          title="Not wired on this build"
          className="text-[11.5px] text-[var(--fg-muted)] underline underline-offset-4 opacity-50"
        >
          Attach a file
        </button>
        <span className="ml-auto font-mono text-[10.5px] text-[var(--fg-muted)]">
          ⏎ send · ⇧⏎ newline · ⌘⏎ run without proposing
        </span>
      </div>
    </div>
  );
}

function CheckAffordance({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[var(--fg-secondary)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-[var(--accent-bg)]"
      />
      {label}
    </label>
  );
}

/**
 * The router's decision, shown before it acts.
 *
 * This is the screen's reason to exist. An operator who sees "read as a task"
 * before a plan spawns can stop it with one click; one who sees it afterwards is
 * reading a receipt.
 */
function ClassificationBanner({
  classified,
  onOverrule,
}: {
  classified: ClassifiedInput;
  onOverrule: () => void;
}) {
  const c = CLASSIFICATION[classified.classification];
  return (
    <div
      className="flex max-w-[820px] flex-wrap items-center gap-3 rounded-[var(--radius-lg)] p-3 tint-wash tint-ring"
      style={{ '--tint': c.tone } as React.CSSProperties}
    >
      <span aria-hidden="true" style={{ color: c.tone }}>◎</span>
      <span className="text-[13px] font-medium" style={{ color: c.tone }}>
        {c.label}
      </span>
      <span
        className="rounded-sm px-1.5 py-0.5 font-mono text-[10px]"
        style={{
          color: c.tone,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c.tone} 34%, transparent)`,
        }}
      >
        {classified.classification}
      </span>
      <span className="min-w-0 flex-1 text-[12px] text-[var(--fg-secondary)]">
        {classified.why}
      </span>
      {c.overrule && (
        <button
          type="button"
          onClick={onOverrule}
          className="text-[12px] text-[var(--fg-muted)] underline underline-offset-4 hover:text-[var(--fg-primary)]"
        >
          {c.overrule}
        </button>
      )}
    </div>
  );
}

/**
 * A plan, proposed (`12a` §C.2).
 *
 * Every step names its required capability and **who would take it**, because
 * that is what makes a proposal reviewable rather than a wall of prose. Nothing
 * is committed until Run it.
 */
function ProposalCard({
  proposal,
  busy,
  onRun,
  onOpenBuilder,
  onDiscard,
}: {
  proposal: PlanProposal;
  busy: boolean;
  onRun: () => void;
  onOpenBuilder: () => void;
  onDiscard: () => void;
}) {
  const verifiedIndexes = proposal.steps
    .map((s, i) => (s.checkpoint_after ? i : -1))
    .filter((i) => i >= 0);

  return (
    <div className="flex max-w-[820px] flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium">A plan, proposed</span>
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          {proposal.steps.length} steps · {proposal.max_parallel} can run at once
        </span>
        <span className="font-mono text-[11px] text-[var(--fg-muted)]">
          est. {formatTokens(proposal.estimated_tokens)} tokens · ~
          {formatDuration(proposal.estimated_wall_ms)}
        </span>
      </div>

      <ol className="flex flex-col">
        {proposal.steps.map((s, i) => (
          <li
            key={i}
            className="flex items-center gap-2.5 py-1.5 shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--fg-primary)_6%,transparent)]"
          >
            <span className="w-[22px] shrink-0 font-mono text-[10.5px] text-[var(--fg-muted)]">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] leading-[1.4]">{s.query}</span>
            {s.checkpoint_after ? (
              <span className="shrink-0 font-mono text-[10.5px] text-[var(--status-live)]">
                verified
              </span>
            ) : (
              s.required_capabilities[0] && (
                <span className="shrink-0 font-mono text-[10.5px] text-[var(--color-accent-400)]">
                  {s.required_capabilities[0]}
                </span>
              )
            )}
            {/* Who would take it. A pinned agent is named; otherwise dispatch
                decides and saying so is more honest than naming a guess. */}
            <span className="w-[92px] shrink-0 truncate text-right font-mono text-[10.5px] text-[var(--fg-muted)]">
              {s.preferred_agent || 'dispatch'}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onRun} disabled={busy}>
          {busy ? 'Starting…' : 'Run it'}
        </Button>
        <Button variant="secondary" onClick={onOpenBuilder}>
          Open in the builder
        </Button>
        <Button variant="ghost" onClick={onDiscard}>
          Plan it differently
        </Button>
      </div>

      <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
        {verifiedIndexes.length === 0
          ? 'No step is verified — nothing will be checked before the next one uses it.'
          : `Step ${verifiedIndexes
              .map((i) => String(i + 1).padStart(2, '0'))
              .join(', ')} is verified, so a wrong answer gets caught before you see it.`}
      </p>
    </div>
  );
}

/**
 * What `Run it` did.
 *
 * A proposal that vanishes with no trace is indistinguishable from a click that
 * did nothing — and the session it started is real, so the screen has to say so
 * and offer somewhere to watch it.
 */
function SubmitOutcome({
  result,
  run,
  onOpenSessions,
}: {
  result: SubmitPlanResult;
  /** The run as the feed sees it, and whether it has ended. Undefined only when
   *  no `PlanStateOp` has arrived at all — which is genuinely "not yet", and the
   *  one case that should say so. */
  run?: { plan: PlanInFlight; finished: boolean };
  onOpenSessions: () => void;
}) {
  const fatal = result.issues.filter((i) => i.fatal);
  const advisory = result.issues.filter((i) => !i.fatal);

  return (
    <div
      className="flex max-w-[820px] flex-col gap-2 rounded-[var(--radius-lg)] p-3 tint-wash tint-ring"
      style={
        {
          '--tint': result.accepted ? 'var(--status-live)' : 'var(--status-err)',
        } as React.CSSProperties
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-[13px] font-medium"
          style={{ color: result.accepted ? headlineTone(run) : 'var(--status-err)' }}
        >
          {result.accepted ? headline(run) : 'Not started'}
        </span>
        {result.accepted && result.session_id && (
          <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">
            session {result.session_id}
          </span>
        )}
        {result.accepted && (
          <button
            type="button"
            onClick={onOpenSessions}
            className="ml-auto text-[12px] text-[var(--fg-muted)] underline underline-offset-4 hover:text-[var(--fg-primary)]"
          >
            Watch it in Tasks →
          </button>
        )}
      </div>

      {result.accepted && <PlanLadder result={result} run={run} />}

      {/* Fatal blocks the run; advisory does not. Rendering them the same way
          would either alarm about something harmless or bury something that
          stopped the plan. */}
      {fatal.map((i, n) => (
        <p key={`f${n}`} className="text-[11.5px] leading-[1.5] text-[var(--status-err)]">
          {i.step_index >= 0 ? `Step ${String(i.step_index + 1).padStart(2, '0')}: ` : ''}
          {i.message}
        </p>
      ))}
      {advisory.map((i, n) => (
        <p key={`a${n}`} className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
          {i.step_index >= 0 ? `Step ${String(i.step_index + 1).padStart(2, '0')}: ` : ''}
          {i.message}
        </p>
      ))}
    </div>
  );
}

/**
 * Two questions, and they must be the ones that change the answer (`12a` §C.1).
 *
 * ADR-0100 D3 makes planner output the ceiling on routing quality: a vague goal
 * cannot be recovered downstream, so asking is cheaper than planning badly and
 * this is a feature rather than a delay. Scope questions carry **real counts** —
 * "61 documents" is a different decision from "1 204" — and a judgement question
 * says plainly why the data does not decide it.
 */
export function InterviewCard({
  questions,
  answers,
  onAnswer,
  busy,
  onSubmit,
}: {
  questions: InterviewQuestion[];
  answers: string[];
  onAnswer: (index: number, value: string) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  const complete = questions.every((_, i) => answers[i]);

  return (
    <section className="flex max-w-[720px] flex-col gap-3.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
      {/* The lead-in states WHY it is asking, so the interview reads as care
          rather than as an obstacle between the operator and their answer. */}
      <p className="text-[12.5px] leading-[1.5] text-[var(--fg-secondary)]">
        {questions.length === 1 ? 'One thing' : `${numberWord(questions.length)} things`} before I
        plan this, because getting {questions.length === 1 ? 'it' : 'them'} wrong wastes the run:
      </p>

      {questions.map((q, i) => (
        <div key={q.question} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] text-[var(--fg-muted)]">{q.kind}</span>
            <span className="text-[13px] leading-[1.45]">{q.question}</span>
          </div>

          {/* A judgement question says why the data does not decide it — that
              sentence is the reason the operator is being asked at all. */}
          {q.kind === 'judgement' && q.why_it_changes_the_answer && (
            <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
              {q.why_it_changes_the_answer}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => onAnswer(i, o.label)}
                aria-pressed={answers[i] === o.label}
                className={cn(
                  'flex flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left text-[12px]',
                  'shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:brightness-110',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  answers[i] === o.label &&
                    'tint-wash shadow-[inset_0_0_0_1px_var(--accent-bg)]',
                )}
                style={
                  answers[i] === o.label
                    ? ({ '--tint': 'var(--accent-bg)' } as React.CSSProperties)
                    : undefined
                }
              >
                <span>{o.label}</span>
                {/* The count is the whole point — it is what makes this a
                    decision rather than a preference. */}
                <span className="font-mono text-[10.5px] text-[var(--fg-muted)]">{o.detail}</span>
              </button>
            ))}
          </div>

          {q.kind !== 'judgement' && q.why_it_changes_the_answer && (
            <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
              {q.why_it_changes_the_answer}
            </p>
          )}
        </div>
      ))}

      <Button size="sm" className="self-start" disabled={!complete || busy} onClick={onSubmit}>
        Plan with these answers
      </Button>
    </section>
  );
}

function numberWord(n: number): string {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? String(n);
}
