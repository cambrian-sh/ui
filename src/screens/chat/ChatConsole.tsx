import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  ChatMessage,
  PageHeader,
} from '@/design-system/components';
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
  const [goal, setGoal] = useState(remembered.goal);
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
    setGoal(w.goal);
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
      setGoal('');
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
    rememberWork(activeId, { goal, classified, proposal, questions, answers, accessNote, started });
  }, [activeId, goal, classified, proposal, questions, answers, accessNote, started]);

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
      setGoal(body);

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

  // Overruling the router acts on the sentence, not just on the label: "Just
  // answer me" answers it and "Make it a task" plans it, so the click does what
  // it says rather than relabelling a decision that has already been taken.
  const overrule = () => {
    if (!classified) return;
    const next: InputClassification =
      classified.classification === 'plan' ? 'chat' : 'plan';
    setClassified({ ...classified, classification: next, why: 'You overruled the router.' });
    setProposal(null);
    setQuestions([]);
    if (!goal) return;
    if (next === 'chat') void sendTurn(goal);
    else void propose.mutate(goal);
  };

  // The sentence that was read as work, shown as the operator's turn. A turn
  // sent on the conversation lane is already in the transcript; a sentence that
  // went to the planner is not, and without it the proposal answers nothing.
  const showGoal =
    Boolean(goal) &&
    classified !== null &&
    classified.classification !== 'chat' &&
    !messages.some((m) => m.role === 'user' && m.content === goal);

  const isEmpty = messages.length === 0 && !classified && !started && !progress;

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
        {/* The promise the screen makes, stated where it is made. */}
        <PageHeader
          divider
          className="pb-3 pt-4"
          title={activeTitle}
          meta={
            started?.accepted ? (
              <Badge variant="live" dot>
                Running
              </Badge>
            ) : (
              <Badge>Nothing committed yet</Badge>
            )
          }
          description={
            started?.accepted ? (
              <>
                Approved and running as task{' '}
                <span className="font-mono text-[12px]">{started.session_id || 'started'}</span>.
              </>
            ) : (
              'No task, no plan and no spend until you approve one.'
            )
          }
        />

        {/* The transcript column. `overflow-y: auto` is not optional — it is a
            chat log, and a column that grows the page instead of scrolling puts
            the composer below the fold exactly when a conversation gets long. */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn(CHAT_COLUMN, 'flex min-h-full flex-col gap-5 py-6')}>
            {!hasChat && (
              <Callout tone="warn">
                This kernel does not advertise the <code>chat</code> capability, so the
                conversation lane is not wired. Classification and plan proposal are separate
                and still work.
              </Callout>
            )}

            {isEmpty && hasChat && <ChatIntro />}

            {messages.map((m, i) => (
              <ChatMessage
                key={m.id || `${m.seq}-${i}`}
                author={m.role === 'user' ? 'operator' : 'runtime'}
                text={m.content}
                timestamp={m.created_at}
              />
            ))}

            {showGoal && (
              <ChatMessage author="operator" text={goal} timestamp={new Date().toISOString()} />
            )}

            {progress && <ProgressLine progress={progress} />}

            {classified && <ClassificationBanner classified={classified} onOverrule={overrule} />}

            {questions.length > 0 && (
              <InterviewCard
                questions={questions}
                answers={answers}
                onAnswer={(i, v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}
                busy={propose.isLoading}
                onSubmit={() => void propose.mutate(goal || activeTitle, answers)}
              />
            )}

            {/* Volunteered BEFORE planning, not discovered after the answer already
                quotes a customer record. */}
            {accessNote && (
              <Callout tone="warn" title="One thing you should know:">
                <span className="text-[var(--fg-secondary)]">{accessNote}</span>
              </Callout>
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

/** The transcript and the composer share one centred reading column. */
const CHAT_COLUMN = 'mx-auto w-full max-w-[780px] px-[var(--page-gutter)]';

/** What an empty conversation says: what happens to a sentence typed here. */
function ChatIntro() {
  return (
    <div className="my-auto flex flex-col items-center gap-2 py-10 text-center">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--fg-primary)]">
        What should Cambrian do?
      </h2>
      <p className="max-w-[46ch] text-[13.5px] leading-[1.6] text-[var(--fg-secondary)]">
        Ask a question and it answers. Describe a job and it proposes a plan first — nothing
        runs until you approve it.
      </p>
    </div>
  );
}

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
      <p className="text-[12.5px] leading-[1.5] text-[var(--fg-secondary)]">
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
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <p className="text-[12px] text-[var(--fg-muted)]">
        {/* The headline already says "Running"; repeat the status only when it
            says something else, such as paused. */}
        {plan.status.toLowerCase() !== headline(run).toLowerCase() && (
          <span className="inline-block first-letter:uppercase">{plan.status} · </span>
        )}
        {steps.length > 0 && `${done} of ${steps.length} steps done`}
        {!finished && plan.active_agent && (
          <>
            {' · '}
            <span className="font-mono text-[11px]">{plan.active_agent}</span>
          </>
        )}
      </p>

      {steps.length > 0 && (
        <ol className="flex flex-col gap-1">
          {steps.map((st) => {
            // Only the running step is emphasised. Colouring every row would make
            // the one that is actually moving impossible to find at a glance.
            const running = st.status === 'running' && !finished;
            const tone = running
              ? 'var(--status-live)'
              : st.status === 'failed'
                ? 'var(--status-err)'
                : st.status === 'done'
                  ? 'var(--fg-secondary)'
                  : 'var(--fg-muted)';
            return (
              <li key={st.index} className="flex items-center gap-2.5 text-[13px] leading-[1.5]">
                <StepMark status={st.status} running={running} index={st.index} />
                <span className={cn(running && 'font-medium')} style={{ color: tone }}>
                  {st.label}
                </span>
                {st.agent && (
                  <span className="font-mono text-[11px] text-[var(--fg-muted)]">{st.agent}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* A finished plan with no DAG is not a broken render — some emitters send
          no step structure at all. Say what is known rather than nothing. */}
      {finished && steps.length === 0 && (
        <p className="text-[12.5px] leading-[1.5] text-[var(--fg-secondary)]">
          The run ended. It reported no step detail — the full trace is in Tasks.
        </p>
      )}

      {failed && (
        <p className="text-[12.5px] leading-[1.5] text-[var(--status-err)]">
          A step failed. The full trace, including the agent output, is in Tasks.
        </p>
      )}
    </div>
  );
}

/** A step's state as a small mark: a tick, a live dot, a cross, or its number. */
function StepMark({ status, running, index }: { status: string; running: boolean; index: number }) {
  const base =
    'flex size-[18px] flex-none items-center justify-center rounded-full text-[10.5px] font-medium tabular-nums';
  if (status === 'done') {
    return (
      <span aria-label="done" className={cn(base, 'bg-[color-mix(in_srgb,var(--status-live)_16%,transparent)] text-[var(--status-live)]')}>
        ✓
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span aria-label="failed" className={cn(base, 'bg-[color-mix(in_srgb,var(--status-err)_16%,transparent)] text-[var(--status-err)]')}>
        ✕
      </span>
    );
  }
  if (running) {
    return (
      <span aria-label="running" className={cn(base, 'border border-[var(--status-live)]')}>
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--status-live)]" />
      </span>
    );
  }
  return (
    <span className={cn(base, 'border border-[var(--border-subtle)] text-[var(--fg-muted)]')}>
      {index + 1}
    </span>
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
export function ProgressLine({ progress }: { progress: ConversationProgress }) {
  // A FINAL update that still carries text is a turn that ENDED and left a reason —
  // ADR-0098's `Note`, "the closing line a FINAL update leaves on screen instead of
  // clearing, used to say what went wrong". A successful turn clears instead (empty
  // text, and the fold removes the entry), so if this is final and present, it failed.
  //
  // It must not keep pulsing. A live dot and `aria-live="polite"` on a turn that has
  // already stopped is exactly the "looks like a hang" reading the terminal signal
  // exists to prevent: the kernel said "over, and here is why" and the console
  // rendered "still working". Announce it assertively — the user is waiting on a
  // reply that is never coming, and that is the one thing worth interrupting for.
  const ended = progress.final;

  // Only show the counter when the kernel actually knows the denominator —
  // "step 1 of 0" is worse than no counter at all. Suppressed once the turn has
  // ended: "step 2 of 4" beside a failure is where it stopped, not progress.
  const counter =
    !ended && progress.total_steps > 0
      ? `step ${progress.step} of ${progress.total_steps}`
      : null;

  return (
    <div
      className={
        'flex max-w-[720px] items-center gap-2.5 text-[12.5px] leading-[1.55] ' +
        (ended ? 'text-[var(--fg-danger)]' : 'text-[var(--fg-secondary)]')
      }
      role={ended ? 'alert' : 'status'}
      aria-live={ended ? 'assertive' : 'polite'}
    >
      <span
        aria-hidden
        className={
          'h-1.5 w-1.5 flex-none rounded-full ' +
          (ended ? 'bg-[var(--fg-danger)]' : 'animate-pulse bg-[var(--status-live)]')
        }
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
    <div className={cn(CHAT_COLUMN, 'flex-none pb-4 pt-2')}>
      <div
        className={cn(
          'flex flex-col rounded-[var(--radius-xl)] border border-[var(--input-border)] bg-[var(--input-bg)] shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-colors',
          'focus-within:border-[var(--input-border-focus)] focus-within:ring-[3px] focus-within:ring-[color-mix(in_srgb,var(--input-border-focus)_22%,transparent)]',
        )}
      >
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
          className="max-h-[40vh] min-h-[56px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[14px] leading-[1.55] text-[var(--input-fg)] placeholder:text-[var(--fg-muted)] focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pb-2.5 pt-1">
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
            className="text-[12px] text-[var(--fg-muted)] opacity-60"
          >
            Attach a file
          </button>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!text.trim() || busy}
            onClick={() => onSubmit(false)}
          >
            {busy ? 'Working…' : 'Send'}
          </Button>
        </div>
      </div>

      <p className="mt-1.5 text-center text-[11px] text-[var(--fg-muted)]">
        <Kbd>⏎</Kbd> send · <Kbd>⇧⏎</Kbd> new line · <Kbd>⌘⏎</Kbd> run without proposing
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="font-sans text-[var(--fg-secondary)]">{children}</kbd>;
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
    <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-[var(--button-primary-bg)]"
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
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-l-2 py-0.5 pl-3"
      style={{ borderColor: c.tone }}
    >
      <span className="inline-block text-[13px] font-medium first-letter:uppercase" style={{ color: c.tone }}>
        {c.label}
      </span>
      <Badge className="font-mono">{classified.classification}</Badge>
      <span className="min-w-0 flex-1 text-[12.5px] text-[var(--fg-secondary)]">
        {classified.why}
      </span>
      {c.overrule && (
        <button
          type="button"
          onClick={onOverrule}
          className="text-[12.5px] font-medium text-[var(--color-accent-500)] hover:underline"
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
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-2 pt-3.5">
        <h3 className="type-section-title text-[var(--fg-primary)]">Proposed plan</h3>
        <span className="text-[12px] tabular-nums text-[var(--fg-muted)]">
          {proposal.steps.length} steps · {proposal.max_parallel} at once · about{' '}
          {formatTokens(proposal.estimated_tokens)} tokens · ~
          {formatDuration(proposal.estimated_wall_ms)}
        </span>
      </div>

      <ol className="flex flex-col px-4">
        {proposal.steps.map((s, i) => (
          <li
            key={i}
            className="flex items-center gap-3 border-t border-[var(--border-subtle)] py-2"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[11px] font-medium tabular-nums text-[var(--fg-secondary)]">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 text-[13.5px] leading-[1.45]">{s.query}</span>
            {s.checkpoint_after ? (
              <Badge variant="live" className="shrink-0">
                Verified
              </Badge>
            ) : (
              s.required_capabilities[0] && (
                <span className="shrink-0 font-mono text-[11px] text-[var(--fg-muted)]">
                  {s.required_capabilities[0]}
                </span>
              )
            )}
            {/* Who would take it. A pinned agent is named; otherwise dispatch
                decides and saying so is more honest than naming a guess. */}
            <span className="w-[110px] shrink-0 truncate text-right text-[12px] text-[var(--fg-muted)]">
              {s.preferred_agent ? (
                <span className="font-mono text-[11px]">{s.preferred_agent}</span>
              ) : (
                'any agent'
              )}
            </span>
          </li>
        ))}
      </ol>

      <p className="border-t border-[var(--border-subtle)] px-4 py-2.5 text-[12px] leading-[1.5] text-[var(--fg-muted)]">
        {verifiedIndexes.length === 0
          ? 'No step is verified — nothing will be checked before the next one uses it.'
          : `Step ${verifiedIndexes
              .map((i) => String(i + 1))
              .join(', ')} is verified, so a wrong answer gets caught before you see it.`}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-3">
        <Button size="sm" onClick={onRun} disabled={busy}>
          {busy ? 'Starting…' : 'Run it'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenBuilder}>
          Open in the builder
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Plan it differently
        </Button>
      </div>
    </Card>
  );
}

/**
 * What `Run it` did.
 *
 * A proposal that vanishes with no trace is indistinguishable from a click that
 * did nothing — and the task it started is real, so the screen has to say so
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
  const tone = !result.accepted
    ? 'err'
    : run?.finished
      ? planFailed(run.plan)
        ? 'err'
        : undefined
      : 'live';

  return (
    <Card tone={tone} className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-[14px] font-semibold"
          style={{ color: result.accepted ? headlineTone(run) : 'var(--status-err)' }}
        >
          {result.accepted ? headline(run) : 'Not started'}
        </span>
        {result.accepted && result.session_id && (
          <span className="font-mono text-[11.5px] text-[var(--fg-muted)]">
            task {result.session_id}
          </span>
        )}
        {result.accepted && (
          <button
            type="button"
            onClick={onOpenSessions}
            className="ml-auto text-[12.5px] font-medium text-[var(--color-accent-500)] hover:underline"
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
        <p key={`f${n}`} className="text-[12.5px] leading-[1.5] text-[var(--status-err)]">
          {i.step_index >= 0 ? `Step ${i.step_index + 1}: ` : ''}
          {i.message}
        </p>
      ))}
      {advisory.map((i, n) => (
        <p key={`a${n}`} className="text-[12.5px] leading-[1.5] text-[var(--fg-muted)]">
          {i.step_index >= 0 ? `Step ${i.step_index + 1}: ` : ''}
          {i.message}
        </p>
      ))}
    </Card>
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
    <Card className="flex flex-col gap-4 px-4 py-4">
      {/* The lead-in states WHY it is asking, so the interview reads as care
          rather than as an obstacle between the operator and their answer. */}
      <p className="text-[13.5px] leading-[1.5] text-[var(--fg-secondary)]">
        {questions.length === 1 ? 'One thing' : `${numberWord(questions.length)} things`} before I
        plan this, because getting {questions.length === 1 ? 'it' : 'them'} wrong wastes the run:
      </p>

      {questions.map((q, i) => (
        <div key={q.question} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="inline-block shrink-0 text-[11.5px] font-medium text-[var(--fg-muted)] first-letter:uppercase">
              {q.kind}
            </span>
            <span className="text-[14px] font-medium leading-[1.45]">{q.question}</span>
          </div>

          {/* A judgement question says why the data does not decide it — that
              sentence is the reason the operator is being asked at all. */}
          {q.kind === 'judgement' && q.why_it_changes_the_answer && (
            <p className="text-[12.5px] leading-[1.5] text-[var(--fg-muted)]">
              {q.why_it_changes_the_answer}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => {
              const chosen = answers[i] === o.label;
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => onAnswer(i, o.label)}
                  aria-pressed={chosen}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-[var(--radius-md)] border px-3 py-2 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                    chosen
                      ? 'border-[var(--input-border-focus)] bg-[var(--list-row-bg-selected)]'
                      : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--list-row-bg-hover)]',
                  )}
                >
                  <span className="text-[13px] font-medium">{o.label}</span>
                  {/* The count is the whole point — it is what makes this a
                      decision rather than a preference. */}
                  <span className="text-[12px] text-[var(--fg-muted)]">{o.detail}</span>
                </button>
              );
            })}
          </div>

          {q.kind !== 'judgement' && q.why_it_changes_the_answer && (
            <p className="text-[12.5px] leading-[1.5] text-[var(--fg-muted)]">
              {q.why_it_changes_the_answer}
            </p>
          )}
        </div>
      ))}

      <Button size="sm" className="self-start" disabled={!complete || busy} onClick={onSubmit}>
        Plan with these answers
      </Button>
    </Card>
  );
}

function numberWord(n: number): string {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? String(n);
}
