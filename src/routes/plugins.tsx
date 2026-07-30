import { createFileRoute } from '@tanstack/react-router';
import { PluginsConsole } from '@/screens/plugins/PluginsConsole';

export const Route = createFileRoute('/plugins')({
  component: PluginsConsole,
});
