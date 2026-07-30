import { createFileRoute } from '@tanstack/react-router';
import { InboxConsole } from '@/screens/inbox/InboxConsole';

export const Route = createFileRoute('/inbox')({
  component: InboxConsole,
});
