import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigFileFacts, StoredOverrides } from './ConfigFileFacts';
import { projectionStore } from '@/store/projection';
import type { ConfigWriteOutcome } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    deleteConfig: vi.fn(),
  },
}));

import { ipc } from '@/ipc';

function outcome(o: Partial<ConfigWriteOutcome>): ConfigWriteOutcome {
  return {
    key: 'execution.ewma_alpha',
    stored: true,
    effect: 'restart_required',
    shadowed_by: '',
    error: '',
    ...o,
  };
}

function asOperator() {
  const s = projectionStore.getState();
  s.hydrate({ ...(s.state ?? ({} as never)), role: 'operator', capabilities: [] } as never);
}

const REASON = 'reverting to the committed file value';

describe('ConfigFileFacts (ADR-0101 D8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.deleteConfig).mockResolvedValue({
      command_id: 'c',
      deduped: false,
      outcomes: [outcome({ stored: false })],
    });
    asOperator();
  });

  it('names the file a write-through went into', () => {
    render(<ConfigFileFacts outcome={outcome({ written_to: 'configs/tuning.local.json' })} />);
    expect(screen.getByText('configs/tuning.local.json')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revert/i })).not.toBeInTheDocument();
  });

  it('renders nothing for a kernel that predates contract 0099', () => {
    const { container } = render(<ConfigFileFacts outcome={outcome({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns when the stored value overrides a file, with the file value, and reverts via DeleteConfig', async () => {
    render(
      <ConfigFileFacts
        outcome={outcome({ overrides_file: 'configs/providers.json', overrides_value: '0.4' })}
      />,
    );
    expect(screen.getByText(/Overrides configs\/providers\.json/)).toBeInTheDocument();
    expect(screen.getByText('0.4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revert execution.ewma_alpha to file' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Remove stored value/ }));

    await waitFor(() =>
      expect(ipc.deleteConfig).toHaveBeenCalledWith(['execution.ewma_alpha'], REASON),
    );
    expect(await screen.findByText(/Reverted/)).toBeInTheDocument();
  });

  it('shows a rejected revert rather than claiming it worked', async () => {
    vi.mocked(ipc.deleteConfig).mockResolvedValueOnce({
      command_id: 'c',
      deduped: false,
      outcomes: [outcome({ effect: 'rejected', stored: false, error: 'unknown key' })],
    });
    render(<ConfigFileFacts outcome={outcome({ overrides_file: 'configs/providers.json' })} />);
    fireEvent.click(screen.getByRole('button', { name: /to file/ }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Remove stored value/ }));
    expect(await screen.findByText('unknown key')).toBeInTheDocument();
    expect(screen.queryByText(/Reverted/)).not.toBeInTheDocument();
  });
});

describe('StoredOverrides', () => {
  beforeEach(() => asOperator());

  it('lists only store-supplied keys, each with revert to file', () => {
    render(
      <StoredOverrides
        valueSource={{
          'execution.ewma_alpha': 'store',
          'execution.tool_menu_k': 'tuning.json',
          'execution.step_timeout_multiplier': 'env:CAMBRIAN_X',
        }}
        currentValues={{ 'execution.ewma_alpha': 0.3 }}
      />,
    );
    expect(screen.getByText('execution.ewma_alpha')).toBeInTheDocument();
    expect(screen.queryByText('execution.tool_menu_k')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /to file/ })).toHaveLength(1);
  });

  it('renders nothing when the store supplies no key', () => {
    const { container } = render(
      <StoredOverrides valueSource={{ a: 'default' }} currentValues={{}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
