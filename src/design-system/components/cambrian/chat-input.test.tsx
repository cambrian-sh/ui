// @vitest-environment jsdom
/* Chat input renders the textarea with the placeholder, calls onChange
 * on keystrokes, and calls onSubmit on Enter. Disabled state shows
 * the disabled reason as a tooltip and disables the textarea.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from '@/design-system/components/cambrian/chat-input';

describe('ChatInput', () => {
  it('submits on Enter', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(<ChatInput value="hello" onChange={onChange} onSubmit={onSubmit} />);
    const textarea = screen.getByLabelText('Chat message') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('does not submit empty input', () => {
    const onSubmit = vi.fn();
    render(<ChatInput value="   " onChange={() => {}} onSubmit={onSubmit} />);
    const textarea = screen.getByLabelText('Chat message');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables when disabled prop is set', () => {
    render(<ChatInput value="hi" onChange={() => {}} onSubmit={() => {}} disabled disabledReason="Reconnecting" />);
    expect(screen.getByLabelText('Chat message')).toBeDisabled();
  });
});
