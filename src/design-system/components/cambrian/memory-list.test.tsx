// @vitest-environment jsdom
/* Memory list renders rows, the empty state, and has no a11y
 * violations in both states.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryList, type MemoryDocument } from '@/design-system/components/cambrian/memory-list';

const doc = (i: number): MemoryDocument => ({
  doc_id: `doc-${i}`,
  doc_type: 'mnemonic_fact',
  scope_tags: ['kb:internal'],
  activation_strength: 0.7,
  session_id: 's-1',
  created_at: new Date(Date.now() - i * 60_000).toISOString(),
  content_preview: `fact ${i}`,
});

describe('MemoryList', () => {
  it('renders rows and calls onSelect on click', () => {
    const onSelect = vi.fn();
    render(<MemoryList docs={[doc(0), doc(1)]} onSelect={onSelect} />);
    expect(screen.getByText('fact 0')).toBeInTheDocument();
    expect(screen.getByText('fact 1')).toBeInTheDocument();
    screen.getByText('fact 0').click();
    expect(onSelect).toHaveBeenCalledWith('doc-0');
  });

  it('shows the empty state when no docs', async () => {
    const { container } = render(<MemoryList docs={[]} />);
    expect(screen.getByText('No memories match')).toBeInTheDocument();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
