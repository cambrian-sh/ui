import { createFileRoute } from '@tanstack/react-router';
import { MCPServersConsole } from '@/screens/mcp/MCPServersConsole';

export const Route = createFileRoute('/mcp')({
  validateSearch: (search: Record<string, unknown>) => ({
    focus: search.focus as string | undefined,
  }),
  component: MCPServersConsole,
});
