
import { createFileRoute } from '@tanstack/react-router';
import { ConnectionSettings } from '@/screens/settings/ConnectionSettings';

export const Route = createFileRoute('/settings')({
  component: ConnectionSettings,
});
