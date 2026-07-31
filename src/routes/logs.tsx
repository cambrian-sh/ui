import { createFileRoute } from '@tanstack/react-router';
import { LogsConsole } from '@/screens/logs/LogsConsole';

export const Route = createFileRoute('/logs')({
  component: LogsConsole,
});
