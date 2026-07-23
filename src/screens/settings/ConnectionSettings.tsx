import { useEffect, useRef, useState } from 'react';
import { ipc } from '@/ipc';
import { projectionStore } from '@/store/projection';
import { useStore } from '@/store/useStore';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { errorMessage } from '@/lib/errorMessage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/design-system/components';
import { cn } from '@/design-system/lib/utils';

/**
 * The connection panel: one Cambrian instance at a time.
 *
 * Endpoint and username are remembered locally so reconnecting is one field.
 * The password never is — the kernel returns a token on login and the Rust core
 * keeps that in the OS keychain, so a stored password would add standing
 * credentials on disk without buying anything the token does not already give.
 */

const STORAGE_KEY = 'cambrian:connection:last';

interface RememberedInstance {
  endpoint: string;
  username: string;
}

function loadRemembered(): RememberedInstance {
  if (typeof window === 'undefined') return { endpoint: '', username: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RememberedInstance) : { endpoint: '', username: '' };
  } catch {
    return { endpoint: '', username: '' };
  }
}

function saveRemembered(instance: RememberedInstance) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instance));
  } catch {
    // A browser with storage disabled just loses the prefill.
  }
}

const STATUS_CLASS: Record<string, string> = {
  live: 'text-[var(--status-ok)]',
  reconnecting: 'text-[var(--status-warn)]',
  down: 'text-[var(--status-err)]',
};

function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-medium text-[var(--fg-secondary)]">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="rounded-sm border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />
    </div>
  );
}

export function ConnectionSettings() {
  const projection = useStore(projectionStore);
  const state = projection.state;
  const connection = state?.connection;
  const status = connection?.status ?? 'down';

  const remembered = loadRemembered();
  const [endpoint, setEndpoint] = useState(remembered.endpoint);
  const [username, setUsername] = useState(remembered.username);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isConnected = status !== 'down';

  // On first mount, if a saved connection is in the keychain, reconnect with it
  // so the operator does not re-enter a password every launch. Runs once.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || isConnected) return;
    autoTried.current = true;
    let cancelled = false;
    (async () => {
      const saved = await ipc.savedConnection().catch(() => null);
      if (cancelled || !saved) return;
      setEndpoint(saved.endpoint);
      setUsername(saved.username);
      setBusy(true);
      try {
        await ipc.loginSaved();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await ipc.login(endpoint, username, password, remember);
      saveRemembered({ endpoint, username });
      setPassword('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setError(null);
    setBusy(true);
    try {
      await ipc.disconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings · Connection</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          The Cambrian instance this console operates. One instance at a time.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Instance</CardTitle>
          <CardDescription>
            {isConnected ? 'Currently operating this kernel.' : 'Not connected to any kernel.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-[var(--fg-muted)]">Status</dt>
            <dd className={cn('font-mono', STATUS_CLASS[status])}>● {status}</dd>

            <dt className="text-[var(--fg-muted)]">Endpoint</dt>
            <dd className="font-mono break-all">{connection?.endpoint || '—'}</dd>

            <dt className="text-[var(--fg-muted)]">Role</dt>
            <dd className="font-mono">{state?.role ?? '—'}</dd>

            <dt className="text-[var(--fg-muted)]">Kernel</dt>
            <dd className="font-mono">
              {state?.kernel_version || '—'} · contract {state?.contract_version || '—'}
            </dd>

            <dt className="text-[var(--fg-muted)]">Capabilities</dt>
            <dd className="font-mono">{state?.capabilities?.length ?? 0} advertised</dd>
          </dl>

          {connection?.reason && (
            <p className="text-[11px] text-[var(--fg-muted)]">{connection.reason}</p>
          )}

          {(state?.contract_skew ?? 0) !== 0 && (
            <p
              role="alert"
              className="rounded-sm border border-[var(--status-warn)] px-2 py-1 text-[11px] text-[var(--status-warn)]"
            >
              Contract skew: this console was built against a different operator
              contract than the kernel advertises. Some surfaces may be missing or wrong.
            </p>
          )}

          {isConnected && (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy}
              className="self-start rounded-sm border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
        </CardContent>
      </Card>

      {!isConnected && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Connect</CardTitle>
            <CardDescription>
              Authenticates against the kernel's operator plane. With "Remember this
              instance" on, the credentials are stored in the OS keychain and the
              console reconnects automatically next launch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onConnect} className="flex max-w-md flex-col gap-2">
              <Field
                id="endpoint"
                label="Endpoint"
                value={endpoint}
                onChange={setEndpoint}
                placeholder="http://localhost:50051"
              />
              <Field
                id="username"
                label="Username"
                value={username}
                onChange={setUsername}
                autoComplete="username"
              />
              <Field
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />

              <label className="flex items-center gap-2 text-[11px] text-[var(--fg-primary)]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember this instance (store credentials in the OS keychain)
              </label>

              {error && (
                <ErrorState
                  reason={error}
                  whatToDo="Check the endpoint and that the kernel has an operator account. A kernel with no accounts rejects every login by design."
                />
              )}

              <button
                type="submit"
                disabled={busy}
                className="self-start rounded-sm bg-[var(--button-primary-bg)] px-3 py-1 text-xs font-medium text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {isConnected && error && (
        <ErrorState reason={error} whatToDo="The disconnect did not complete. Retry." />
      )}
    </div>
  );
}
