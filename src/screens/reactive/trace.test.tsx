import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PipelineSummary } from '@/ipc/types';

const studioPreview = vi.fn();
const queryLogs = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    studioPreview: (...a: unknown[]) => studioPreview(...a),
    queryLogs: (...a: unknown[]) => queryLogs(...a),
  },
}));

import { PipelineTracePane } from './PipelineTracePane';

function pipeline(over: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    pipeline_id: 'ingress:usgs',
    revision: 1,
    name: 'USGS Earthquakes',
    state: 'armed',
    trigger_type: 'ingress',
    trigger_ref: 'usgs-quakes',
    node_count: 3,
    edge_count: 2,
    effect_node_count: 1,
    mapping_revision: 1,
    plan_checksum: '',
    semantics_checksum: '',
    generated: true,
    dry_run: false,
    approved: false,
    ...over,
  };
}

/**
 * The question an operator asks first when something looks wrong: what did it
 * actually receive, and what happened? Neither the canvas nor the dry run
 * answers it.
 */
describe('the trace pane', () => {
  // The pane opens on the LIVE FLOW: "what is moving right now" is the first
  // question when something looks wrong, and the recorded views are what you
  // reach for once you know it is not moving.

  beforeEach(() => {
    studioPreview.mockReset();
    queryLogs.mockReset();
    studioPreview.mockResolvedValue([]);
    queryLogs.mockResolvedValue({ records: [], window: {} });
  });

  it('shows the real payload of a delivery, on demand', async () => {
    studioPreview.mockResolvedValue([
      {
        delivery_ref: 'd1',
        received_at: '2026-08-02T10:00:00Z',
        outcome: 'mapped',
        detail: '1 event',
        envelopes_json: '{"properties":{"mag":5.1,"place":"88 km NE of Hihifo"}}',
      },
    ]);
    render(<PipelineTracePane pipeline={pipeline()} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Deliveries'));

    await waitFor(() => expect(screen.getByText('mapped')).toBeInTheDocument());
    // Collapsed until asked for: the outcome is what someone scans, the payload
    // is what they open once they have found the row.
    expect(screen.queryByText(/88 km NE of Hihifo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/show payload/));
    expect(screen.getByText(/88 km NE of Hihifo/)).toBeInTheDocument();
  });

  it('renders a non-JSON payload exactly as it arrived', async () => {
    studioPreview.mockResolvedValue([
      {
        delivery_ref: 'd2',
        received_at: '2026-08-02T10:00:00Z',
        outcome: 'refused',
        detail: 'not an object',
        envelopes_json: 'plain text body',
      },
    ]);
    render(<PipelineTracePane pipeline={pipeline()} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Deliveries'));
    await waitFor(() => expect(screen.getByText('refused')).toBeInTheDocument());
    fireEvent.click(screen.getByText(/show payload/));
    // A source that sends something else is a fact about the source.
    expect(screen.getByText('plain text body')).toBeInTheDocument();
  });

  it('does not read an empty list as "nothing ever arrived"', async () => {
    render(<PipelineTracePane pipeline={pipeline()} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Deliveries'));
    await waitFor(() =>
      expect(
        screen.getByText(/nothing has come through lately, not that nothing ever did/),
      ).toBeInTheDocument(),
    );
  });

  it('says a non-ingress pipeline has no payload rather than showing an empty list', async () => {
    render(
      <PipelineTracePane
        pipeline={pipeline({ trigger_type: 'schedule', trigger_ref: '0 8 * * 1' })}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Deliveries'));
    await waitFor(() =>
      expect(screen.getByText(/nothing is delivered to it/)).toBeInTheDocument(),
    );
  });

  it('traces the kernel log by the ingress id, across every logger', async () => {
    queryLogs.mockResolvedValue({
      records: [
        {
          seq: 4,
          at_unix_ms: 1785287993258,
          level: 'WARN',
          component: 'cambrian.daemon',
          message: 'usgs-quakes: poll returned 502',
          attrs: [],
          boot_id: 'b1',
          truncated: false,
        },
      ],
      window: {},
    });
    render(<PipelineTracePane pipeline={pipeline()} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Kernel log'));
    await waitFor(() =>
      expect(screen.getByText(/poll returned 502/)).toBeInTheDocument(),
    );
    expect(screen.getByText('cambrian.daemon')).toBeInTheDocument();
    // Filtered on the id, not on a component: a pipeline is narrated by several.
    expect(queryLogs).toHaveBeenCalledWith(
      { contains: 'usgs-quakes' },
      0,
      200,
    );
  });

  it('says an empty log window is "not recently", never "never"', async () => {
    render(<PipelineTracePane pipeline={pipeline()} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Kernel log'));
    await waitFor(() =>
      expect(screen.getByText(/this is "not recently", not "never"/)).toBeInTheDocument(),
    );
  });
});
