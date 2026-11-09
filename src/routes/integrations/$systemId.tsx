import { createFileRoute } from '@tanstack/react-router';
import { SystemPage } from '@/screens/integrations/SystemPage';

function SystemRoute() {
  const { systemId } = Route.useParams();
  return <SystemPage systemId={systemId} />;
}

// ADR-0141 D9: one page per external system (accounts · data in · agent actions).
export const Route = createFileRoute('/integrations/$systemId')({
  component: SystemRoute,
});
