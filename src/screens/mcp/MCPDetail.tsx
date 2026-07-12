import { useEffect, useState } from 'react';
import { ipc } from '@/ipc';
import type { MCPServerDetail, Role } from '@/ipc/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/design-system/components';
import { useMutation } from '@/lib/useMutation';
import { ConfirmMutationDialog } from '@/screens/sessions/ConfirmMutationDialog';
import { ErrorState } from '@/design-system/components/cambrian/error-state';
import { relativeTime } from '@/lib/relativeTime';
import { MCPConnectionPill } from './MCPConnectionPill';

interface MCPDetailProps {
  serverId: string;
  role: Role | null;
}

export function MCPDetail({ serverId, role }: MCPDetailProps) {
  const [detail, setDetail] = useState<MCPServerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ipc
      .getMCPServer(serverId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const [regName, setRegName] = useState('');
  const [regCommand, setRegCommand] = useState('');
  const [regUrl, setRegUrl] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { mutate, isLoading, error: mutationError } = useMutation(
    async (args: { command_id: string; reason: string; name: string; command: string; url: string }) => {
      return ipc.registerMCP(args);
    },
  );

  const isOperator = role === 'operator';

  const formValid = regName.trim() !== '' && regCommand.trim() !== '';

  const handleRegisterClick = () => {
    if (!formValid || isLoading) return;
    setConfirmOpen(true);
  };

  const handleConfirm = async (reason: string) => {
    await mutate({
      command_id: crypto.randomUUID(),
      reason,
      name: regName.trim(),
      command: regCommand.trim(),
      url: regUrl.trim(),
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) setConfirmOpen(false);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="h-5 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="mt-4 h-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <Card className="m-4">
        <CardContent className="pt-6">
          <EmptyState title="Failed to load MCP server" body={error ?? 'Server not found.'} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <MCPConnectionPill state={detail.connection_state} />
              <h2 className="truncate text-sm font-semibold">{detail.id}</h2>
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <dt className="text-[var(--fg-muted)]">Tools</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              {detail.tool_count}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Default price</dt>
            <dd className="tabular-nums text-[var(--fg-secondary)]">
              ${detail.default_price.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--fg-muted)]">Last health check</dt>
            <dd className="text-[var(--fg-secondary)]">
              {relativeTime(detail.last_health_check_at)}
            </dd>
          </div>
        </dl>
      </div>

      <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tools">Discovered Tools</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Connection state</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-muted)]">Current state</dt>
                  <dd><MCPConnectionPill state={detail.connection_state} /></dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {detail.health_check_history.length > 0 && (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle>Health check history</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.health_check_history.map((entry, i) => (
                    <li key={i} className="text-[var(--fg-secondary)]">
                      {entry}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent
          value="tools"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          <Card>
            <CardHeader>
              <CardTitle>Discovered Tools</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.discovered_tools.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.discovered_tools.map((tool) => (
                    <li key={tool} className="font-mono text-[var(--fg-secondary)]">
                      {tool}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">No tools discovered.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="actions"
          className="flex-1 overflow-y-auto px-4 pb-4 focus-visible:outline-none"
        >
          {!isOperator ? (
            <Card>
              <CardHeader>
                <CardTitle>Server controls</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[var(--fg-muted)]">
                  These actions require the Operator role.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Register MCP server</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="mcp-name" className="text-xs font-medium text-[var(--fg-secondary)]">
                    Name (required)
                  </label>
                  <Input
                    id="mcp-name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="filesystem"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="mcp-command" className="text-xs font-medium text-[var(--fg-secondary)]">
                    Command (required)
                  </label>
                  <Input
                    id="mcp-command"
                    value={regCommand}
                    onChange={(e) => setRegCommand(e.target.value)}
                    placeholder="npx -y @modelcontextprotocol/server-filesystem /tmp"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="mcp-url" className="text-xs font-medium text-[var(--fg-secondary)]">
                    URL (optional)
                  </label>
                  <Input
                    id="mcp-url"
                    value={regUrl}
                    onChange={(e) => setRegUrl(e.target.value)}
                    placeholder="https://example.com/mcp"
                    disabled={isLoading}
                  />
                </div>
                <Button
                  variant="default"
                  disabled={!formValid || isLoading}
                  onClick={handleRegisterClick}
                  aria-label="Register MCP server"
                  className="w-full"
                >
                  Register MCP server
                </Button>
                {mutationError && <ErrorState reason={mutationError} />}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {confirmOpen && (
        <ConfirmMutationDialog
          open
          onOpenChange={handleDialogClose}
          title="Register MCP server"
          description="Register a new MCP server with the kernel. The server will be started and its tools discovered."
          confirmLabel="Register"
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
