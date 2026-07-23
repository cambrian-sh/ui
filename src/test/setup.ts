/* Vitest setup (UI-008 + UI-IMPL-15).
 *
 * Loads jest-dom matchers (`toBeInTheDocument` etc.) and the vitest-axe
 * matcher (`toHaveNoViolations`) — the latter is registered explicitly
 * because `vitest-axe/extend-expect` ships an empty shim in v0.1.0.
 * Resets the mock IPC state between tests so a test never sees
 * another test's mutations.
 */
import '@testing-library/jest-dom/vitest';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'vitest-axe/matchers';
import { ipc } from '@/ipc/mock';

// @ts-expect-error vitest-axe 0.1.0's .d.ts marks toHaveNoViolations as export type; the runtime value exists.
expect.extend({ toHaveNoViolations });

afterEach(() => {
  cleanup();
  ipc.__seed({
    connection: { status: 'live', endpoint: 'mock://test', last_known_state_at: new Date().toISOString(), reason: null },
    role: 'operator',
    kernel_version: '0.6.9-alpha',
    contract_version: '0047',
    capabilities: ['audit', 'scope', 'memory_tag', 'hitl_resolve'],
    contract_skew: 0,
    cursor: 0,
    plans: [],
    sessions: [],
    audit_tail: [],
    pending_hitl: [],
    agents: [],
    tools: [],
    skills: [],
    mcp_servers: [],
    scope: {},
    watch_configs: [],
    lifecycle: { scheduler_state: 'idle', pending_jobs: 0, last_consolidation: null, dormancy_events: [] },
    verifier_pool: { pool_agents: [], recent_rounds: [], surveillance_triggers: [] },
    cost_dashboard: { spend_rate_usd: 0, circuit_breakers: [], max_energy_per_step: 0.5, price_ledger: [], recent_acquires: [] },
  });
});

// jsdom's Blob/File predate `arrayBuffer()`. The Tauri webview has it, and the
// ingest pane relies on it to read file bytes, so provide it for tests.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this as Blob);
    });
  };
}
