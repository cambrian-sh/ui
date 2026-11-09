import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsConsole } from '@/screens/integrations/IntegrationsConsole';

export const Route = createFileRoute('/integrations/')({
  component: IntegrationsConsole,
});
