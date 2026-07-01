// @vitest-environment jsdom
/* Operator message renders with author label and timestamp. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ChatMessage } from '@/design-system/components/cambrian/chat-message';

describe('ChatMessage', () => {
  it('renders operator author and timestamp', () => {
    render(
      <ChatMessage
        author="operator"
        text="hello kernel"
        timestamp="2026-06-26T17:30:00Z"
      />,
    );
    expect(screen.getByText('operator')).toBeInTheDocument();
    expect(screen.getByText('hello kernel')).toBeInTheDocument();
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('has no a11y violations', async () => {
    const { container } = render(
      <ChatMessage
        author="runtime"
        text="done"
        timestamp="2026-06-26T17:30:00Z"
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
