import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SessionWorkSurface } from '@/screens/chat/SessionWorkSurface';

function SessionRoute() {
  const { taskId } = Route.useParams();
  const { step } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <SessionWorkSurface
      sessionId={taskId}
      selectedStep={step}
      // The selected step lives in the URL so a step is deep-linkable and the
      // command palette can jump straight to one. `replace` keeps step-picking
      // out of the back stack — back should leave the session, not walk back
      // through every step the operator glanced at.
      onSelectStep={(index) =>
        navigate({
          to: '/tasks/$taskId',
          params: { taskId },
          search: { step: index ?? undefined },
          replace: true,
        })
      }
    />
  );
}

export const Route = createFileRoute('/tasks/$taskId')({
  component: SessionRoute,
  // Typed as optional so linking to a session without naming a step stays legal —
  // most navigations here (the rail, the inbox, the sessions list) have no step
  // in mind, and the inspector is meant to be absent until one is picked.
  validateSearch: (search: Record<string, unknown>): { step?: number } => {
    const step = Number(search.step);
    return Number.isInteger(step) && step >= 0 ? { step } : {};
  },
});
