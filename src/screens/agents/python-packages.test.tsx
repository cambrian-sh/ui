import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PythonPackagesPanel } from '@/screens/agents/PythonPackagesPanel';
import { projectionStore } from '@/store/projection';
import type { PythonPackage, PythonPackageListing, StateOfRecord } from '@/ipc/types';

// ENG-2012 (contract 0119, ADR-0157 D7.10/D7.12): the agent page lists the agent's
// sandbox Python packages with their audit trail; an Operator removes a runtime
// package (never a declared one), retries the install and cleans up the env, each
// with a reason.

const { listPythonPackages, removePythonPackage, retryPythonPackageInstall, prunePythonEnv } = vi.hoisted(() => ({
  listPythonPackages: vi.fn(),
  removePythonPackage: vi.fn(),
  retryPythonPackageInstall: vi.fn(),
  prunePythonEnv: vi.fn(),
}));
vi.mock('@/ipc', () => ({ ipc: { listPythonPackages, removePythonPackage, retryPythonPackageInstall, prunePythonEnv } }));

const now = Date.now();
const rt: PythonPackage = {
  id: 'ppa-1', target: 'analyst', name: 'rtpkg', version: '3.0.0', extras: [], state: 'approved',
  lock_sha256: 'f'.repeat(64), base_generation: '0123456789abcdef', approval_id: 'apr-1', requested_by: 'agent:analyst',
  requested_at_unix_ms: now - 60_000, decided_by: 'op-1', decided_at_unix_ms: now - 50_000, detail: '',
  distributions: ['rtpkg==3.0.0', 'six==1.17.0'], declared: false, runtime: true,
  events: [
    { seq: 1, action: 'requested', actor: 'agent:analyst', detail: '', generation: '', at_unix_ms: now - 60_000 },
    { seq: 2, action: 'approved', actor: 'op-1', detail: '', generation: '', at_unix_ms: now - 50_000 },
    { seq: 3, action: 'installed', actor: 'system:kernel', detail: '', generation: 'aaaa000011112222', at_unix_ms: now - 40_000 },
  ],
};
const decl: PythonPackage = { ...rt, id: 'ppa-2', name: 'tinypkg', version: '1.0.0', declared: true, runtime: false,
  requested_by: 'profile:analyst', distributions: ['tinypkg==1.0.0'] };
function listing(pkgs: PythonPackage[]): PythonPackageListing {
  return {
    packages: pkgs, root: '/env', total_bytes: 3 * 1024 * 1024, cache_bytes: 0, downloads_bytes: 0,
    bases: [{ dir: '0123456789abcdef', current: true, healthy: true, built_at_unix_ms: now, source: 'release-lock', bytes: 1024 }],
    layers: [{ agent: 'analyst', dir: 'aaaa000011112222', base: '0123456789abcdef', healthy: true, built_at_unix_ms: now, distributions: [], bytes: 2048, current: true }],
    last_gc: { removed: [], freed_bytes: 0, errors: [], at_unix_ms: 0, kept: 0 },
  };
}
function state(role: 'operator' | 'viewer'): StateOfRecord {
  return {
    connection: { status: 'live', endpoint: 'mock://k', last_known_state_at: new Date().toISOString(), reason: null },
    role, kernel_version: 'x', contract_version: '0119', capabilities: ['python-packages'], contract_skew: 0,
    plugins: [], cursor: 0, plans: [], sessions: [], audit_tail: [], pending_hitl: [], agents: [], tools: [],
    scope: {}, watch_configs: [],
  } as StateOfRecord;
}

describe('PythonPackagesPanel (ENG-2012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionStore.getState().reset();
    listPythonPackages.mockResolvedValueOnce(listing([rt, decl])).mockResolvedValue(listing([{ ...rt, state: 'removed' }, decl]));
    removePythonPackage.mockResolvedValue({ deduped: false, generation: 'bbbb000011112222' });
    retryPythonPackageInstall.mockResolvedValue({ deduped: false, generation: 'aaaa000011112222' });
    prunePythonEnv.mockResolvedValue({ removed: [{ kind: 'layer', path: '/env/x', agent: 'analyst', bytes: 2048, reason: 'superseded' }], freed_bytes: 2048, errors: [], at_unix_ms: now, kept: 2 });
  });

  it('lists the audit trail and removes a runtime package with a reason; a declared one has no remove', async () => {
    projectionStore.getState().hydrate(state('operator'));
    render(<PythonPackagesPanel agentId="analyst" />);
    expect(await screen.findByText('rtpkg==3.0.0')).toBeInTheDocument();
    expect(listPythonPackages).toHaveBeenCalledWith('analyst');
    expect(screen.getByRole('list', { name: 'Audit trail of rtpkg' })).toHaveTextContent('installed by system:kernel → aaaa000011112222');
    expect(screen.queryByRole('button', { name: 'Remove tinypkg' })).toBeNull();
    expect(screen.getByText(/remove it from python_packages there/)).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Remove rtpkg' });
    expect(remove).toBeDisabled(); // no reason yet
    fireEvent.change(screen.getByPlaceholderText(/one-off analysis/), { target: { value: 'analysis done' } });
    fireEvent.click(remove);
    await waitFor(() => expect(removePythonPackage).toHaveBeenCalledWith('analyst', 'rtpkg', 'analysis done'));
    expect(await screen.findByText('rtpkg removed: layer bbbb000011112222.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove rtpkg' })).toBeNull());
  });

  it('retries the install and cleans up the env', async () => {
    projectionStore.getState().hydrate(state('operator'));
    render(<PythonPackagesPanel agentId="analyst" />);
    await screen.findByText('rtpkg==3.0.0');
    fireEvent.change(screen.getByPlaceholderText(/one-off analysis/), { target: { value: 'tidy up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clean up env' }));
    expect(await screen.findByText('Cleanup removed 1 item(s), freed 2.0 KB.')).toBeInTheDocument();
    expect(prunePythonEnv).toHaveBeenCalledWith('tidy up');
    fireEvent.click(screen.getByRole('button', { name: 'Retry install' }));
    expect(await screen.findByText('Package check done: layer aaaa000011112222.')).toBeInTheDocument();
    expect(retryPythonPackageInstall).toHaveBeenCalledWith('analyst', 'tidy up');
  });

  it('a viewer cannot change anything', async () => {
    projectionStore.getState().hydrate(state('viewer'));
    render(<PythonPackagesPanel agentId="analyst" />);
    await screen.findByText('rtpkg==3.0.0');
    fireEvent.change(screen.getByPlaceholderText(/one-off analysis/), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Remove rtpkg' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clean up env' })).toBeDisabled();
  });
});
