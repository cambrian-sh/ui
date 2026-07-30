import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InterviewCard } from './ChatConsole';
import type { InterviewQuestion } from '@/ipc/types';

const QUESTIONS: InterviewQuestion[] = [
  {
    question: 'Which refunds?',
    kind: 'scope',
    options: [
      { label: 'Q2 only', detail: 'Q2 only — 61 documents' },
      { label: 'Everything', detail: 'Everything — 1 204 documents' },
    ],
    why_it_changes_the_answer: 'The wider set costs twenty times as much to read.',
  },
  {
    question: "'the same customer' — matched how?",
    kind: 'judgement',
    options: [
      { label: 'By email', detail: 'present on every log line' },
      { label: 'By order id', detail: 'repeats across people' },
    ],
    why_it_changes_the_answer:
      'The logs carry an email and an order id but no customer id, so this is a judgement call.',
  },
];

function setup(answers: string[] = ['', '']) {
  const onAnswer = vi.fn();
  const onSubmit = vi.fn();
  render(
    <InterviewCard
      questions={QUESTIONS}
      answers={answers}
      onAnswer={onAnswer}
      busy={false}
      onSubmit={onSubmit}
    />,
  );
  return { onAnswer, onSubmit };
}

describe('InterviewCard', () => {
  it('shows real counts on a scope option, not just a label', () => {
    setup();
    expect(screen.getByText('Q2 only — 61 documents')).toBeInTheDocument();
    expect(screen.getByText('Everything — 1 204 documents')).toBeInTheDocument();
  });

  it('says why the data cannot decide a judgement question', () => {
    setup();
    expect(screen.getByText(/no customer id/)).toBeInTheDocument();
    expect(screen.getByText('judgement')).toBeInTheDocument();
    expect(screen.getByText('scope')).toBeInTheDocument();
  });

  it('reports the chosen option by index', () => {
    const { onAnswer } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Q2 only/ }));
    expect(onAnswer).toHaveBeenCalledWith(0, 'Q2 only');
  });

  it('marks the chosen option as pressed', () => {
    setup(['Q2 only', '']);
    expect(screen.getByRole('button', { name: /Q2 only/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Everything/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('will not plan until every question is answered', () => {
    setup(['Q2 only', '']);
    expect(screen.getByRole('button', { name: /Plan with these answers/ })).toBeDisabled();
  });

  it('plans once both are answered', () => {
    const { onSubmit } = setup(['Q2 only', 'By email']);
    const go = screen.getByRole('button', { name: /Plan with these answers/ });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    expect(onSubmit).toHaveBeenCalled();
  });
});
