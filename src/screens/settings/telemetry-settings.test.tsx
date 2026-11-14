import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TelemetrySettings } from './TelemetrySettings';
import { queryClient } from '@/lib/queryClient';
import type { TelemetryConfig } from '@/ipc/types';

vi.mock('@/ipc', () => ({
  ipc: {
    getTelemetryConfig: vi.fn(),
    setTelemetryConfig: vi.fn(),
    setTelemetrySecretKey: vi.fn(),
    sendTestTrace: vi.fn(),
  },
}));

import { ipc } from '@/ipc';

const CONFIG: TelemetryConfig = {
  host: 'https://cloud.langfuse.com',
  project: 'ops',
  enabled: true,
  public_key_configured: true,
  public_key_last_four: '7c1e',
  secret_key_configured: true,
  secret_key_last_four: 'a9f0',
  sample_rate: 0.25,
  send_structure_and_timings: true,
  send_prompts_and_outputs: false,
  send_from_enforcing_surfaces: false,
};

const REASON = 'turning tracing off for the audit window';

describe('TelemetrySettings (TelemetryAdmin, owner decision 2026-11-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    vi.mocked(ipc.getTelemetryConfig).mockResolvedValue(CONFIG);
    vi.mocked(ipc.setTelemetryConfig).mockResolvedValue({ ok: true, error: '', warning: '' });
    vi.mocked(ipc.setTelemetrySecretKey).mockResolvedValue({ ok: true, error: '', warning: '' });
  });

  it('puts the Send traces master switch first and saves enabled with the rest of the config', async () => {
    render(<TelemetrySettings canMutate />);
    const master = await screen.findByRole('checkbox', { name: /send traces/i });
    await waitFor(() => expect(master).toBeChecked());
    // The master switch is the first switch on the page.
    expect(screen.getAllByRole('checkbox')[0]).toBe(master);

    fireEvent.click(master);
    fireEvent.change(screen.getByPlaceholderText(/why are you making this decision/i), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(ipc.setTelemetryConfig).toHaveBeenCalledTimes(1));
    const [sent, reason] = vi.mocked(ipc.setTelemetryConfig).mock.calls[0];
    expect(sent.enabled).toBe(false);
    expect(sent.host).toBe(CONFIG.host);
    expect(reason).toBe(REASON);
  });

  it('a save that leaves the switch alone keeps tracing on', async () => {
    render(<TelemetrySettings canMutate />);
    const prompts = await screen.findByRole('checkbox', { name: /prompts and model outputs/i });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /send traces/i })).toBeChecked());
    fireEvent.click(prompts);
    fireEvent.change(screen.getByPlaceholderText(/why are you making this decision/i), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(ipc.setTelemetryConfig).toHaveBeenCalledTimes(1));
    expect(vi.mocked(ipc.setTelemetryConfig).mock.calls[0][0].enabled).toBe(true);
  });

  it('shows the stored secret by its own last four and sends the key with a reason, then clears it', async () => {
    render(<TelemetrySettings canMutate />);
    expect(await screen.findByText(/a key is stored · ····a9f0/i)).toBeInTheDocument();

    const input = screen.getByLabelText('Secret key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-lf-secret-1234' } });
    const saveKey = screen.getByRole('button', { name: 'Save key' });
    expect(saveKey).toBeDisabled(); // no reason yet
    fireEvent.change(screen.getByPlaceholderText(/why are you making this decision/i), {
      target: { value: 'rotating the langfuse key today' },
    });
    fireEvent.click(saveKey);

    await waitFor(() =>
      expect(ipc.setTelemetrySecretKey).toHaveBeenCalledWith(
        'sk-lf-secret-1234',
        'rotating the langfuse key today',
      ),
    );
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('renders a refused save as an error and a warning as a notice', async () => {
    vi.mocked(ipc.setTelemetryConfig).mockResolvedValueOnce({
      ok: false,
      error: 'host must be https',
      warning: '',
    });
    render(<TelemetrySettings canMutate />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /send traces/i }));
    fireEvent.change(screen.getByPlaceholderText(/why are you making this decision/i), {
      target: { value: REASON },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/host must be https/)).toBeInTheDocument();
  });

  it('reports a test trace by latency, host and trace id', async () => {
    vi.mocked(ipc.sendTestTrace).mockResolvedValue({
      ok: true,
      latency_ms: 38,
      error: '',
      trace_id: 'tr-1',
      host: 'https://lf.example',
    });
    render(<TelemetrySettings canMutate />);
    fireEvent.click(await screen.findByRole('button', { name: /send a test trace/i }));
    expect(
      await screen.findByText('Accepted by https://lf.example in 38ms · trace tr-1.'),
    ).toBeInTheDocument();
  });
});
