/* Settings → Connection sub-screen (PRD-07 §3.1 + UI-IMPL-12).
 *
 * The first-run flow (no instance yet), the instance list (saved
 * connection profiles), the current-instance indicator, and the
 * connect form (endpoint + username + password → `op_login`). The
 * runtime settings form (per the locked config schema) lands in a
 * follow-on when `op_get_config_schema` (UI-015) ships its form layer.
 */
import { useState } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/design-system/components';

interface Instance {
  id: string;
  endpoint: string;
  username: string;
}

const STORAGE_KEY = 'cambrian:connection:profiles';

function loadInstances(): Instance[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Instance[]) : [];
  } catch {
    return [];
  }
}

function saveInstances(instances: Instance[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instances));
  } catch {
    /* swallow */
  }
}

export function ConnectionSettings() {
  const projection = useStore(projectionStore);
  const connection = projection.state?.connection;
  const [instances, setInstances] = useState<Instance[]>(() => loadInstances());
  const [endpoint, setEndpoint] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await ipc.login(endpoint, username, password);
      const id = `${endpoint}#${username}`;
      const next = [...instances.filter((i) => i.id !== id), { id, endpoint, username }];
      setInstances(next);
      saveInstances(next);
      void res;
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = (id: string) => {
    const next = instances.filter((i) => i.id !== id);
    setInstances(next);
    saveInstances(next);
  };

  const isFirstRun = !connection || connection.status === 'down';

  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-y-auto">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings · Connection</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Connection profiles for the Cambrian runtime. The runtime settings form
          (per <code className="font-mono text-xs">op_get_config_schema</code>) lands
          in a follow-on.
        </p>
      </header>

      {isFirstRun ? (
        <Card>
          <CardHeader>
            <CardTitle>First run</CardTitle>
            <CardDescription>No instance is connected. Add one below to start.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Current instance</CardTitle>
            <CardDescription>
              <code className="font-mono text-xs">{connection?.endpoint ?? 'unknown'}</code> · status{' '}
              <span className="font-mono text-xs">{connection?.status ?? 'down'}</span>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connect</CardTitle>
          <CardDescription>Authenticates via <code className="font-mono text-xs">op_login</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onConnect} className="flex flex-col gap-2">
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="Endpoint (e.g. http://localhost:8080)"
              aria-label="Endpoint"
              required
              className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                aria-label="Username"
                required
                className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                required
                className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            </div>
            {error && (
              <div role="alert" className="rounded-sm border border-[var(--status-err)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--status-err)]">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="self-start rounded-sm bg-[var(--button-primary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instance list</CardTitle>
          <CardDescription>Saved connection profiles (local to this device).</CardDescription>
        </CardHeader>
        <CardContent>
          {instances.length === 0 ? (
            <p className="text-xs text-[var(--fg-muted)]">No saved instances yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {instances.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono truncate">{i.endpoint}</span>
                    <span className="text-[10px] text-[var(--fg-muted)]">as {i.username}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(i.id)}
                    aria-label={`Remove instance ${i.username}@${i.endpoint}`}
                    className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--status-err)] hover:text-[var(--fg-on-accent)]"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
