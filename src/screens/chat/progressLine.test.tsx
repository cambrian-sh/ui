import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressLine } from '@/screens/chat/ChatConsole';
import type { ConversationProgress } from '@/ipc/types';

function progress(overrides: Partial<ConversationProgress> = {}): ConversationProgress {
  return {
    conversation_id: 'conv-1',
    text: 'working on it',
    phase: 'planning the work',
    step: 2,
    total_steps: 4,
    final: false,
    updated_at_unix_ms: Date.now(),
    ...overrides,
  };
}

describe('ProgressLine', () => {
  it('renders a live turn as a polite status with its step counter', () => {
    render(<ProgressLine progress={progress()} />);

    expect(screen.getByRole('status')).toHaveTextContent('working on it');
    expect(screen.getByText('step 2 of 4')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a FINAL note as an ended failure, not as a live status', () => {
    // The bug this pins: a turn that failed before replying left the line reading
    // "working on it" with a pulsing live dot — indistinguishable from a hang, which
    // is precisely what ADR-0098's terminal signal exists to prevent. A final update
    // that still carries text IS the failure notice (its `Note`), so it must read as
    // over, and it must be announced.
    render(
      <ProgressLine
        progress={progress({
          final: true,
          text: 'the language model provider refused this request because its usage limit is reached',
        })}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('usage limit is reached');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    // Not a "still working" line.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('drops the step counter once the turn has ended', () => {
    // "step 2 of 4" beside a failure is where it stopped, not progress being made.
    render(<ProgressLine progress={progress({ final: true, text: 'this turn could not be completed' })} />);

    expect(screen.queryByText('step 2 of 4')).not.toBeInTheDocument();
  });

  it('stops pulsing once the turn has ended', () => {
    // The dot is the strongest "still running" signal on the line, so it is asserted
    // directly: a class-level check is the only way to catch a live indicator left on
    // a dead turn.
    const { container: live } = render(<ProgressLine progress={progress()} />);
    expect(live.querySelector('.animate-pulse')).not.toBeNull();

    const { container: ended } = render(
      <ProgressLine progress={progress({ final: true, text: 'it failed' })} />,
    );
    expect(ended.querySelector('.animate-pulse')).toBeNull();
  });
});
