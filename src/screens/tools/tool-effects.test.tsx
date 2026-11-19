import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolEffects } from '@/screens/tools/ToolEffects';
import { TOOL_EFFECTS } from '@/ipc/types';

// ENG-1435: ADR-0150 D9 splits egress into egress_read and egress_send; the
// console knows both classes instead of rendering them as unknown.
describe('ToolEffects — the egress split (ADR-0150 D9)', () => {
  it('explains egress_read and egress_send in the detail pane', () => {
    render(<ToolEffects tool={{ effects: ['read', 'egress_read', 'egress_send'] }} variant="full" />);
    expect(screen.getByText(/Reads from outside this deployment/)).toBeTruthy();
    expect(screen.getByText(/Sends to a person or changes state outside/)).toBeTruthy();
  });

  it('colours a sending class as a risk and a reading one as not', () => {
    render(<ToolEffects tool={{ effects: ['egress_read', 'egress_send', 'egress'] }} />);
    const cls = (name: string) => screen.getByText(name).className;
    expect(cls('egress_send')).toContain('status-warn');
    expect(cls('egress')).toContain('status-warn');
    expect(cls('egress_read')).not.toContain('status-warn');
    expect(screen.getByText('egress_send').getAttribute('title')).toMatch(/Sends to a person/);
  });

  it('offers both halves in the policy effect vocabulary, in the kernel risk order', () => {
    expect(TOOL_EFFECTS).toEqual(['read', 'egress_read', 'write', 'egress', 'egress_send', 'spend', 'admin']);
  });
});
