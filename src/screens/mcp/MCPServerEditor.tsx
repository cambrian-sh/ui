import { useState } from 'react';
import { Button, Input } from '@/design-system/components';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { ipc } from '@/ipc';
import { useMutation } from '@/lib/useMutation';
import { queryClient } from '@/lib/queryClient';
import type { ConfigWriteOutcome, MCPServerConfig, MCPServerTestResult } from '@/ipc/types';

const TRANSPORTS = [
  { id: 'http', note: 'Streamable HTTP — one URL, the current spec.' },
  { id: 'sse', note: 'Legacy HTTP+SSE — older servers (e.g. self-hosted Firecrawl /sse).' },
  { id: 'stdio', note: 'A local command this kernel spawns and speaks to over stdio.' },
] as const;

export function newServerDraft(): MCPServerConfig {
  return {
    id: '',
    transport: 'http',
    endpoint: '',
    args: [],
    auth_type: 'none',
    auth_header: '',
    classification_tags: [],
    connected: false,
    last_error: '',
    tool_count: 0,
    token_configured: false,
    token_source: '',
  };
}

/**
 * One MCP server, edited. **Test is the primary action** and works on the
 * DRAFT — the probe dials whatever is in the form, saved or not, and reports
 * the tools the server actually advertises.
 *
 * A save is LIVE (contract 0097): the kernel stores the config durably AND
 * arms the server's health loop immediately, so this editor never says
 * "restart required" — it says "connecting", and the card's connection state
 * is what settles it.
 */
export function MCPServerEditor({
  server,
  canMutate,
  onClose,
}: {
  server: MCPServerConfig;
  canMutate: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MCPServerConfig>(server);
  const [result, setResult] = useState<MCPServerTestResult | null>(null);
  const [token, setToken] = useState('');
  const [written, setWritten] = useState<ConfigWriteOutcome | null>(null);
  const isNew = server.id === '';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mcp-server-configs'] });

  const test = useMutation(async () => {
    const r = await ipc.testMCPServer(draft);
    setResult(r);
    return r;
  });

  const save = useMutation(async () => {
    const res = await ipc.saveMCPServer(
      draft,
      isNew ? 'mcp server added from the console' : 'mcp server changed from the console',
    );
    const outcome = res.outcomes.length > 0 ? res.outcomes[0] : null;
    setWritten(outcome);
    if (outcome && outcome.effect === 'rejected') {
      throw new Error(outcome.error || 'the kernel refused this configuration');
    }
    await refresh();
    return res;
  });

  const remove = useMutation(async () => {
    const res = await ipc.removeMCPServer(draft.id, 'mcp server removed from the console');
    const outcome = res.outcomes.length > 0 ? res.outcomes[0] : null;
    if (outcome && outcome.effect === 'rejected') {
      throw new Error(outcome.error || 'the kernel refused the removal');
    }
    await refresh();
    onClose();
    return res;
  });

  const saveToken = useMutation(async () => {
    const res = await ipc.setMCPServerToken(draft.id, token);
    // Cleared on BOTH outcomes — a credential left in a text box is the same
    // exposure the write-only API exists to avoid.
    setToken('');
    const outcome = res.outcomes.length > 0 ? res.outcomes[0] : null;
    if (outcome && outcome.effect === 'rejected') {
      throw new Error(outcome.error || 'the credential store refused this token');
    }
    setWritten(outcome);
    await refresh();
    return res;
  });

  const clearToken = useMutation(async () => {
    const res = await ipc.clearMCPServerToken(draft.id, 'operator removed the token');
    setToken('');
    await refresh();
    return res;
  });

  const saveDisabled =
    !canMutate ||
    save.isLoading ||
    !draft.endpoint.trim() ||
    (isNew && !draft.id.trim()) ||
    (draft.auth_type === 'header' && !draft.auth_header.trim());

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-medium tracking-[-0.01em]">
          {isNew ? 'New MCP server' : draft.id}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[11.5px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
        >
          ← back to servers
        </button>
      </div>

      {/* Test first — and unlike a generator, the probe takes the DRAFT. */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void test.mutate()}
            disabled={!canMutate || test.isLoading || !draft.endpoint.trim()}
          >
            {test.isLoading ? 'Connecting…' : 'Test this server'}
          </Button>
          <span className="text-[11.5px] text-[var(--fg-muted)]">
            One real connection to what is in this form — saved or not. It lists the
            server&rsquo;s tools and disconnects.
          </span>
        </div>

        {test.error && <ErrorState reason={test.error} />}
        {result && <ProbeReport result={result} />}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <Field
            label="Id"
            value={draft.id}
            onChange={(v) => setDraft((d) => ({ ...d, id: v }))}
            disabled={!canMutate}
            consequence="Permanent — tools are offered as mcp:<id>/<tool>, and grants refer to those names."
          />
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] text-[var(--fg-secondary)]">Transport</label>
          <div className="flex flex-col gap-1">
            {TRANSPORTS.map((t) => (
              <label key={t.id} className="flex items-baseline gap-2 text-[12px]">
                <input
                  type="radio"
                  name="mcp-transport"
                  checked={draft.transport === t.id}
                  disabled={!canMutate}
                  onChange={() => setDraft((d) => ({ ...d, transport: t.id }))}
                />
                <span className="font-mono">{t.id}</span>
                <span className="text-[11px] text-[var(--fg-muted)]">{t.note}</span>
              </label>
            ))}
          </div>
        </div>
        <Field
          label={draft.transport === 'stdio' ? 'Command' : 'Endpoint URL'}
          value={draft.endpoint}
          onChange={(v) => setDraft((d) => ({ ...d, endpoint: v }))}
          disabled={!canMutate}
          consequence={
            draft.transport === 'stdio'
              ? 'This kernel runs it as a local process. Only point this at a command you trust.'
              : 'The server URL, e.g. http://localhost:3002/mcp.'
          }
        />
        {draft.transport === 'stdio' && (
          <Field
            label="Arguments"
            value={draft.args.join(' ')}
            onChange={(v) =>
              setDraft((d) => ({ ...d, args: v.split(/\s+/).filter(Boolean) }))
            }
            disabled={!canMutate}
            consequence='Space-separated, e.g. "-y firecrawl-mcp".'
          />
        )}
        <Field
          label="Classification tags"
          value={draft.classification_tags.join(', ')}
          onChange={(v) =>
            setDraft((d) => ({
              ...d,
              classification_tags: v.split(',').map((t) => t.trim()).filter(Boolean),
            }))
          }
          disabled={!canMutate}
          consequence="Applied to every tool this server advertises. Untagged tools are ones no access policy can restrict."
        />
      </section>

      <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--elevation-1)]">
        <h3 className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Authentication
        </h3>
        <div className="flex flex-wrap gap-4">
          {(['none', 'bearer', 'header'] as const).map((a) => (
            <label key={a} className="flex items-center gap-2 text-[12px]">
              <input
                type="radio"
                name="mcp-auth"
                checked={(draft.auth_type || 'none') === a}
                disabled={!canMutate}
                onChange={() => setDraft((d) => ({ ...d, auth_type: a }))}
              />
              <span className="font-mono">{a}</span>
            </label>
          ))}
          {draft.auth_type === 'header' && (
            <Input
              value={draft.auth_header}
              onChange={(e) => setDraft((d) => ({ ...d, auth_header: e.target.value }))}
              placeholder="Header name, e.g. X-Api-Key"
              aria-label="Auth header name"
              disabled={!canMutate}
              className="w-[220px]"
            />
          )}
        </div>

        {draft.auth_type !== 'none' && (
          <>
            {draft.token_configured ? (
              <p className="font-mono text-[11.5px] text-[var(--fg-secondary)]">
                A token is stored · source: {draft.token_source || 'store'}
              </p>
            ) : (
              <p className="text-[12px] text-[var(--status-warn)]">
                No token is stored. Connections will go out unauthenticated.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={draft.token_configured ? 'Paste a replacement token' : 'Paste the token'}
                aria-label="Server token"
                autoComplete="off"
                disabled={!canMutate || isNew || saveToken.isLoading}
                className="w-[280px]"
              />
              <Button
                size="sm"
                onClick={() => void saveToken.mutate()}
                disabled={!canMutate || isNew || saveToken.isLoading || !token.trim()}
              >
                {draft.token_configured ? 'Replace' : 'Save token'}
              </Button>
              {draft.token_configured && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void clearToken.mutate()}
                  disabled={!canMutate || clearToken.isLoading}
                >
                  Remove
                </Button>
              )}
            </div>
            {isNew && (
              <p className="text-[11.5px] text-[var(--fg-muted)]">
                Save the server first — a token is filed against a server the kernel knows.
              </p>
            )}
            <p className="text-[11.5px] leading-[1.5] text-[var(--fg-muted)]">
              The token is write-only and never returned. Saving one reconnects the server so
              the new credential is actually presented — tokens are injected at connect time.
            </p>
          </>
        )}
        {(saveToken.error || clearToken.error) && (
          <p className="text-[12px] text-[var(--status-err)]">
            {saveToken.error ?? clearToken.error}
          </p>
        )}
      </section>

      {save.error && <ErrorState reason={save.error} />}
      {remove.error && <ErrorState reason={remove.error} />}
      {written && !save.error && written.effect === 'live' && (
        <p className="text-[12px] leading-[1.5] text-[var(--status-live)]">
          Stored and armed on the running kernel — tools appear as soon as the server answers,
          and the card&rsquo;s connection state is the truth of whether it did.
        </p>
      )}
      {written && !save.error && written.effect === 'shadowed' && (
        <p className="text-[12px] leading-[1.5] text-[var(--status-warn)]">
          Stored, but <code className="font-mono">{written.shadowed_by}</code> supplies the live
          value and outranks the store.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void save.mutate()} disabled={saveDisabled}>
          {save.isLoading ? 'Saving…' : isNew ? 'Save & connect' : 'Save & reconnect'}
        </Button>
        {!isNew && (
          <Button
            variant="danger"
            onClick={() => void remove.mutate()}
            disabled={!canMutate || remove.isLoading}
          >
            Remove server
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function ProbeReport({ result }: { result: MCPServerTestResult }) {
  if (!result.ok) {
    return (
      <p className="text-[12px] leading-[1.5] text-[var(--status-err)]">
        {result.error || 'The server did not answer.'} ({result.latency_ms}ms)
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px] text-[var(--status-live)]">
        Connected in {result.latency_ms}ms —{' '}
        {result.tool_names.length === 0
          ? 'the server answered but advertises no tools, which is a different finding from a refused connection.'
          : `${result.tool_names.length} tool${result.tool_names.length === 1 ? '' : 's'} advertised:`}
      </p>
      {result.tool_names.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.tool_names.map((t) => (
            <span
              key={t}
              className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--fg-muted)] shadow-[inset_0_0_0_1px_var(--border-subtle)]"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  consequence,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  consequence: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11.5px] text-[var(--fg-secondary)]">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
      />
      {/* A consequence, not a description. */}
      <span className="text-[11px] leading-[1.5] text-[var(--fg-muted)]">{consequence}</span>
    </div>
  );
}
