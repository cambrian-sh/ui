import { createFileRoute } from '@tanstack/react-router';
import { OrganisationConsole } from '@/screens/organisation/OrganisationConsole';

export const Route = createFileRoute('/organisation')({
  component: OrganisationConsole,
});
