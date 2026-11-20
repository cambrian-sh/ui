import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { queryClient } from '@/lib/queryClient';
import { RevisionStage } from './RevisionStage';

// ENG-1722 (owner decision 2026-11-20, option C): the revision stage offers BOTH
// actions, each saying what it calls — "Repair stored records" (PromoteRepair) and
// "Release for new arrivals" (pause → confirm mapping → start dry run → arm a new
// release keeping the history lane), the latter stopping at the first refusal.

const { studioShadowReprocess, studioPromoteRepair, studioLifecycle, studioArm, studioRepairStatus } = vi.hoisted(() => ({
  studioShadowReprocess: vi.fn(),
  studioPromoteRepair: vi.fn(),
  studioLifecycle: vi.fn(),
  studioArm: vi.fn(),
  studioRepairStatus: vi.fn(),
}));
vi.mock('@/ipc', () => ({ ipc: { studioShadowReprocess, studioPromoteRepair, studioLifecycle, studioArm, studioRepairStatus } }));

const ok = { ok: true, error: '', detail: 'done' };

function renderStage(over: Partial<React.ComponentProps<typeof RevisionStage>> = {}) {
  return render(
    <RevisionStage ingressId="acme" armedRevision={7} latestRevision={8} draftRevision={8}
      armedTransportRevision={3} armedHistoryTransportRevision={2} archived={40} onDiscard={() => {}} {...over} />,
  );
}

async function giveReason() {
  fireEvent.change(await screen.findByLabelText('Why are you doing this?'), { target: { value: 'fix vendor field' } });
  // The actions wait for the shadow reprocess to answer.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Repair stored records' })).not.toBeDisabled());
}

describe('RevisionStage actions (ENG-1722)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    studioShadowReprocess.mockResolvedValue('');
    studioPromoteRepair.mockResolvedValue({ ok: true, error: '', detail: 'repair job started' });
    studioLifecycle.mockResolvedValue(ok);
    studioArm.mockResolvedValue(ok);
    studioRepairStatus.mockResolvedValue(null);
  });

  it('says what each action does, and repair calls PromoteRepair only', async () => {
    renderStage();
    await giveReason();
    expect(screen.getByRole('region', { name: 'Repair stored records' }).textContent).toContain('retires the rows r7 wrote');
    expect(screen.getByRole('region', { name: 'Release for new arrivals' }).textContent).toContain('Stored records are not changed');
    expect(screen.queryByText(/does not fix what is already stored/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Repair stored records' }));
    await waitFor(() => expect(studioPromoteRepair).toHaveBeenCalledWith('acme', 8, 'fix vendor field'));
    expect(studioLifecycle).not.toHaveBeenCalled();
    expect(studioArm).not.toHaveBeenCalled();
  });

  it('release runs pause → confirm → dry run → arm, keeping the history lane', async () => {
    renderStage();
    await giveReason();
    fireEvent.click(screen.getByRole('button', { name: 'Release r8 for new arrivals' }));
    await waitFor(() => expect(studioArm).toHaveBeenCalledWith('acme', 3, 8, 'fix vendor field', 2));
    expect(studioLifecycle.mock.calls.map((c) => c[0])).toEqual(['pause', 'confirm_mapping', 'start_dry_run']);
    expect(studioPromoteRepair).not.toHaveBeenCalled();
    expect(await screen.findByText(/Released r8 for new arrivals/)).toBeInTheDocument();
  });

  it('stops at the first refusal and says where the ingress was left', async () => {
    studioLifecycle.mockImplementation(async (verb: string) =>
      verb === 'confirm_mapping' ? { ok: false, error: 'mapping names an undeclared verb', detail: '' } : ok);
    renderStage();
    await giveReason();
    fireEvent.click(screen.getByRole('button', { name: 'Release r8 for new arrivals' }));
    expect(await screen.findByText(/Could not confirm the mapping: mapping names an undeclared verb\. The ingress is paused/)).toBeInTheDocument();
    expect(studioLifecycle.mock.calls.map((c) => c[0])).toEqual(['pause', 'confirm_mapping']);
    expect(studioArm).not.toHaveBeenCalled();
  });

  it('cannot release a revision that is not the latest', async () => {
    renderStage({ latestRevision: 9 });
    await giveReason();
    const release = screen.getByRole('button', { name: 'Release r8 for new arrivals' });
    expect(release).toBeDisabled();
    expect(release.getAttribute('title')).toContain('r9 is newer');
  });
});
