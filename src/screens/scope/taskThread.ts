import type { AccessDecision, DocumentSummary } from '@/ipc/types';
import type { TermKind } from './RuleSentence';

/**
 * The five-pane job, threaded.
 *
 * *"Telegram must not reach document X"* takes five panes in the right order —
 * find the document, label it, author a rule, link it, verify — and nothing in
 * the console tells you where you are in that sequence or whether you finished
 * it. This is the thread.
 *
 * It ends in an **Explain result** on purpose. In a fail-closed system "saved"
 * and "working" are different claims, and only the second one is what the
 * operator came for: a rule can save cleanly, link cleanly, and still match
 * nothing.
 */

export type TaskStepId = 'find' | 'label' | 'author' | 'link' | 'verify';

export interface TaskState {
  /** The document the boundary is about. */
  document: DocumentSummary | null;
  /** The label applied to it — what rules are actually written against. */
  label: string | null;
  /** True once the label is confirmed present on the document. */
  labelApplied: boolean;
  /** The rule being authored. */
  container: string;
  term: TermKind;
  policyId: string;
  /** True once savePolicy + linkPolicy both succeeded. */
  linked: boolean;
  /** The kernel's answer. The only thing that closes the task. */
  decision: AccessDecision | null;
}

export const EMPTY_TASK: TaskState = {
  document: null,
  label: null,
  labelApplied: false,
  container: '',
  term: 'forbidden',
  policyId: '',
  linked: false,
  decision: null,
};

export interface TaskStep {
  id: TaskStepId;
  title: string;
  /** What this step is for, in the operator's terms. */
  blurb: string;
}

export const TASK_STEPS: TaskStep[] = [
  {
    id: 'find',
    title: 'Find the document',
    blurb: 'The boundary is about something specific. Name it first.',
  },
  {
    id: 'label',
    title: 'Label it',
    blurb:
      'Rules act on labels, never on a document by name. An unlabelled document has nothing for any rule to act on.',
  },
  {
    id: 'author',
    title: 'Author the rule',
    blurb: 'Which container may do what to that label.',
  },
  {
    id: 'link',
    title: 'Link it',
    blurb: 'A policy linked to nothing applies to nobody.',
  },
  {
    id: 'verify',
    title: 'Verify with Explain',
    blurb:
      '“Saved” and “working” are different claims. Only the kernel can tell you which one you have.',
  },
];

export type StepStatus = 'done' | 'current' | 'todo';

/** Whether a step's own precondition is satisfied. */
export function isStepComplete(step: TaskStepId, task: TaskState): boolean {
  switch (step) {
    case 'find':
      return task.document !== null;
    case 'label':
      return task.labelApplied && task.label !== null;
    case 'author':
      return task.container !== '' && task.policyId.trim() !== '' && task.label !== null;
    case 'link':
      return task.linked;
    case 'verify':
      return task.decision !== null;
  }
}

/**
 * Where the operator is.
 *
 * The first incomplete step is `current`; everything before it is `done` and
 * everything after is `todo`. Deliberately sequential — the steps genuinely
 * depend on each other, and letting someone author a rule about a label that is
 * not on the document yet produces a boundary that matches nothing.
 */
export function stepStatuses(task: TaskState): Record<TaskStepId, StepStatus> {
  const out = {} as Record<TaskStepId, StepStatus>;
  let foundCurrent = false;

  for (const step of TASK_STEPS) {
    if (isStepComplete(step.id, task)) {
      out[step.id] = 'done';
      continue;
    }
    out[step.id] = foundCurrent ? 'todo' : 'current';
    foundCurrent = true;
  }
  return out;
}

/** The step the operator should be working on, or null when the task is done. */
export function currentStep(task: TaskState): TaskStepId | null {
  const step = TASK_STEPS.find((s) => !isStepComplete(s.id, task));
  return step?.id ?? null;
}

/** How many steps remain. */
export function remainingSteps(task: TaskState): number {
  return TASK_STEPS.filter((s) => !isStepComplete(s.id, task)).length;
}

/**
 * What the finished task actually achieved — or failed to.
 *
 * A verified task whose decision came back ALLOWED is the trap this whole
 * thread exists to catch: every step succeeded and the boundary does not hold.
 */
export function taskOutcome(task: TaskState): {
  state: 'incomplete' | 'holds' | 'does-not-hold';
  message: string;
} {
  if (!task.decision) {
    const remaining = remainingSteps(task);
    return {
      state: 'incomplete',
      message: `${remaining} step${remaining === 1 ? '' : 's'} remaining.`,
    };
  }

  // The rule was meant to DENY. An allow means it does not hold.
  const denies = !task.decision.allowed;
  const wouldDeny = task.decision.would_have_denied;

  if (denies) {
    return {
      state: 'holds',
      message:
        'The kernel denies it. The boundary holds — this is the confirmation the task was for.',
    };
  }
  if (wouldDeny) {
    return {
      state: 'does-not-hold',
      message:
        'The kernel allowed it, but a report-only policy would have denied it. Nothing is enforced yet — enforce the policy from Rollout when the journal looks right.',
    };
  }
  return {
    state: 'does-not-hold',
    message:
      'The kernel ALLOWS it. Every step succeeded and the boundary does not hold — the rule saved, linked, and matches nothing. Check the label is on the document and that the rule names the container the traffic actually arrives through.',
  };
}
