import { createFileRoute } from '@tanstack/react-router';
import { AuditConsole } from '@/screens/audit/AuditConsole';

export const Route = createFileRoute('/audit')({
  component: AuditConsole,
});
