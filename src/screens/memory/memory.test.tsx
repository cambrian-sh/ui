import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryDetail } from './MemoryDetail';
import { ipc } from '@/ipc';
import type { MemoryDocument } from '@/design-system/components/cambrian/memory-list';

vi.mock('@/ipc', () => ({
  ipc: {
    setToolGrant: vi.fn(),
    getBlastRadiusPreview: vi.fn().mockResolvedValue({ affected_agents: [], affected_plans: [] }),
  },
}));

function makeDoc(): MemoryDocument {
  return {
    doc_id: 'mem-123',
    doc_type: 'mnemonic_fact',
    scope_tags: ['global'],
    activation_strength: 0.9,
    session_id: 'ses-456',
    created_at: new Date().toISOString(),
    content_preview: 'Test memory content',
  };
}

describe('MemoryDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables the confirm button when reason is empty and does not send fallback reason', () => {
    render(<MemoryDetail doc={makeDoc()} />);

    // Click Tag to open the blast radius / reason input
    fireEvent.click(screen.getByRole('button', { name: 'Tag' }));

    // The confirm button should be disabled initially because the reason input is empty
    const confirmBtn = screen.getByRole('button', { name: 'Confirm tag' });
    expect(confirmBtn).toBeDisabled();

    // Type a reason
    const input = screen.getByPlaceholderText('Reason (mandatory for tag)');
    fireEvent.change(input, { target: { value: '  ' } });

    // Still disabled if only whitespace
    expect(confirmBtn).toBeDisabled();

    // Type a valid reason
    fireEvent.change(input, { target: { value: 'user requested tag' } });
    expect(confirmBtn).not.toBeDisabled();

    // Click confirm
    fireEvent.click(confirmBtn);

    // Verify ipc call
    expect(ipc.setToolGrant).toHaveBeenCalledWith({
      agent_id: 'memory:mem-123',
      tool_name: 'tag:user',
      granted: true,
      reason: 'user requested tag',
    });
  });

  it('renders without crashing when the document has sparse fields', () => {
    const doc = makeDoc();
    doc.content_preview = '';
    doc.scope_tags = [];
    doc.session_id = '';

    render(<MemoryDetail doc={doc} />);

    expect(screen.getByText('mem-123')).toBeInTheDocument();
    expect(screen.getByText(/no scope/i)).toBeInTheDocument();
    expect(screen.getByText('FACT')).toBeInTheDocument();
  });

  it('calls setToolGrant with a delete mutation when confirming delete', () => {
    render(<MemoryDetail doc={makeDoc()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const input = screen.getByPlaceholderText('Reason (mandatory for delete)');
    fireEvent.change(input, { target: { value: 'obsolete' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

    expect(ipc.setToolGrant).toHaveBeenCalledWith({
      agent_id: 'memory:mem-123',
      tool_name: 'delete:user',
      granted: true,
      reason: 'obsolete',
    });
  });
});
