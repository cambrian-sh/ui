import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Revise-by-prompt: the drafter must receive the CURRENT spec as its base
// (revising, not re-rolling), the proposal must stay propose-only until the
// operator saves it, and an abstention must render as a decline — never as an
// empty proposal.

const draftMapping = vi.fn();
const saveSpec = vi.fn();
const getRevision = vi.fn();

vi.mock('@/ipc', () => ({
  ipc: {
    studioDraftMapping: (...args: unknown[]) => draftMapping(...args),
    studioSaveSpec: (...args: unknown[]) => saveSpec(...args),
    studioGetRevision: (...args: unknown[]) => getRevision(...args),
  },
}));

import { ReviseMapping } from './ReviseMapping';

const BASE_SPEC = '{"language":"ingress-mapping/v1","stream":"usgs_earthquakes"}';
const REVISED_SPEC =
  '{"language":"ingress-mapping/v1","stream":"usgs_earthquakes","event_type":{"const":"earthquake"}}';

beforeEach(() => {
  vi.clearAllMocks();
  getRevision.mockResolvedValue({ ok: true, error: '', revision: 3, spec_json: BASE_SPEC });
});

async function propose(instruction: string) {
  render(
    <ReviseMapping ingressId="usgs" baseRevision={3} readOnly={false} onSaved={() => {}} />,
  );
  await waitFor(() => expect(getRevision).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('What should change'), {
    target: { value: instruction },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Propose revision' }));
}

describe('revise-by-prompt', () => {
  it('hands the drafter the CURRENT spec as its base', async () => {
    draftMapping.mockResolvedValue({
      ok: true,
      error: '',
      spec_json: REVISED_SPEC,
      abstained: '',
      corrections: 0,
      first_draft_accepted: true,
      coverage_json: '',
      field_abstentions: [],
    });
    await propose('add the quake as a role');
    await waitFor(() =>
      expect(draftMapping).toHaveBeenCalledWith('usgs', 'add the quake as a role', BASE_SPEC),
    );
    // The proposal renders for review; nothing was saved.
    await waitFor(() => expect(screen.getByText(/"event_type"/)).toBeInTheDocument());
    expect(saveSpec).not.toHaveBeenCalled();
  });

  it('saves only on the explicit save action, then explains the fork', async () => {
    draftMapping.mockResolvedValue({
      ok: true,
      error: '',
      spec_json: REVISED_SPEC,
      abstained: '',
      corrections: 0,
      first_draft_accepted: true,
      coverage_json: '',
      field_abstentions: [],
    });
    saveSpec.mockResolvedValue({ ok: true, error: '', revision: 4 });
    await propose('add the quake as a role');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save as new revision' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save as new revision' }));
    await waitFor(() => expect(saveSpec).toHaveBeenCalledWith('mapping', 'usgs', REVISED_SPEC));
    expect(screen.getByText(/Saved as revision 4/)).toBeInTheDocument();
    expect(screen.getByText(/shadow-test/)).toBeInTheDocument();
  });

  it('renders an abstention as a decline, not an empty proposal', async () => {
    draftMapping.mockResolvedValue({
      ok: true,
      error: '',
      spec_json: '',
      abstained: 'the requested path does not exist in the schema profile',
      corrections: 2,
      first_draft_accepted: false,
      coverage_json: '',
      field_abstentions: [],
    });
    await propose('extract a field the payload does not have');
    await waitFor(() =>
      expect(screen.getByText(/Declined — the requested path does not exist/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Save as new revision' })).not.toBeInTheDocument();
  });

  it('renders nothing for viewers', () => {
    const { container } = render(
      <ReviseMapping ingressId="usgs" baseRevision={3} readOnly={true} onSaved={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
