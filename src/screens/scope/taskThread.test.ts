import { describe, expect, it } from 'vitest';
import {
  currentStep,
  EMPTY_TASK,
  isStepComplete,
  remainingSteps,
  stepStatuses,
  taskOutcome,
  type TaskState,
} from './taskThread';
import type { AccessDecision, DocumentSummary } from '@/ipc/types';

const DOC: DocumentSummary = {
  id: 'doc-1',
  title: 'Refund log 2026-Q2',
  source_type: 'upload',
  tags: [],
  chunk_count: 4,
  created_at_unix_ms: Date.now(),
};

function decision(over: Partial<AccessDecision> = {}): AccessDecision {
  return {
    allowed: false,
    reason: 'forbidden_tag',
    detail: 'customer-pii',
    decided_by: [],
    policy_version: 'v1',
    report_only: false,
    would_have_denied: false,
    explain: '',
    ...over,
  };
}

/** A task carried through to just before `verify`. */
function upToLink(): TaskState {
  return {
    ...EMPTY_TASK,
    document: DOC,
    label: 'customer-pii',
    labelApplied: true,
    container: 'surface:chat:telegram',
    policyId: 'telegram-no-pii',
    linked: true,
  };
}

describe('stepStatuses', () => {
  it('starts everyone at the first step', () => {
    const s = stepStatuses(EMPTY_TASK);
    expect(s.find).toBe('current');
    expect(s.label).toBe('todo');
    expect(s.verify).toBe('todo');
  });

  it('advances as each step completes', () => {
    const s = stepStatuses({ ...EMPTY_TASK, document: DOC });
    expect(s.find).toBe('done');
    expect(s.label).toBe('current');
  });

  it('marks everything done once the kernel has answered', () => {
    const s = stepStatuses({ ...upToLink(), decision: decision() });
    expect(Object.values(s).every((v) => v === 'done')).toBe(true);
  });

  it('keeps exactly one step current', () => {
    const s = stepStatuses({ ...EMPTY_TASK, document: DOC });
    expect(Object.values(s).filter((v) => v === 'current')).toHaveLength(1);
  });
});

describe('isStepComplete', () => {
  it('does not count a label that was chosen but never applied', () => {
    // Choosing a label in a dropdown is not the same as the document carrying
    // it. A rule written against a label the document lacks matches nothing.
    const chosen = { ...EMPTY_TASK, document: DOC, label: 'customer-pii', labelApplied: false };
    expect(isStepComplete('label', chosen)).toBe(false);
  });

  it('needs both a container and a policy id before the rule is authored', () => {
    const base = { ...EMPTY_TASK, document: DOC, label: 'x', labelApplied: true };
    expect(isStepComplete('author', { ...base, container: 'surface:chat:telegram' })).toBe(false);
    expect(isStepComplete('author', { ...base, policyId: 'p' })).toBe(false);
    expect(
      isStepComplete('author', { ...base, container: 'surface:chat:telegram', policyId: 'p' }),
    ).toBe(true);
  });
});

describe('currentStep / remainingSteps', () => {
  it('points at the first unfinished step', () => {
    expect(currentStep(EMPTY_TASK)).toBe('find');
    expect(currentStep({ ...EMPTY_TASK, document: DOC })).toBe('label');
    expect(currentStep(upToLink())).toBe('verify');
  });

  it('is null once nothing remains', () => {
    expect(currentStep({ ...upToLink(), decision: decision() })).toBeNull();
    expect(remainingSteps({ ...upToLink(), decision: decision() })).toBe(0);
  });

  it('counts what is left', () => {
    expect(remainingSteps(EMPTY_TASK)).toBe(5);
    expect(remainingSteps(upToLink())).toBe(1);
  });
});

describe('taskOutcome', () => {
  it('is incomplete until the kernel has answered', () => {
    // Linking is not the finish line. "Saved" and "working" are different
    // claims, which is the whole reason this thread ends in Explain.
    expect(taskOutcome(upToLink()).state).toBe('incomplete');
  });

  it('confirms the boundary when the kernel denies', () => {
    const out = taskOutcome({ ...upToLink(), decision: decision({ allowed: false }) });
    expect(out.state).toBe('holds');
  });

  it('calls out the trap: every step succeeded and it still allows', () => {
    // The failure this screen exists to catch. Nothing else in the console
    // would tell the operator, because every individual step reported success.
    const out = taskOutcome({ ...upToLink(), decision: decision({ allowed: true }) });
    expect(out.state).toBe('does-not-hold');
    expect(out.message).toMatch(/boundary does not hold/);
  });

  it('separates report-only from a boundary that genuinely does not hold', () => {
    const out = taskOutcome({
      ...upToLink(),
      decision: decision({ allowed: true, would_have_denied: true, report_only: true }),
    });
    expect(out.state).toBe('does-not-hold');
    expect(out.message).toMatch(/report-only/);
    expect(out.message).not.toMatch(/matches nothing/);
  });
});
