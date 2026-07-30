import { createFileRoute } from '@tanstack/react-router';
import { MCPServersConsole } from '@/screens/mcp/MCPServersConsole';
import { RuntimeSection } from '@/screens/runtime/RuntimeSection';

export const Route = createFileRoute('/mcp')({
  component: () => (
    <RuntimeSection>
      <MCPServersConsole />
    </RuntimeSection>
  ),
  validateSearch: (search: Record<string, unknown>): { focus?: string } =>
    typeof search.focus === 'string' ? { focus: search.focus } : {},
});
