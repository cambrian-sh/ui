/* Chat surface route — the session detail.
 *
 * PRD-03 §3: the centre column of the shell. Per-session chat at
 * /sessions/$sessionId; the sessions list is the /sessions/ index.
 */
import { createFileRoute } from '@tanstack/react-router';
import { ChatSurface } from '@/screens/chat/ChatSurface';

function SessionDetail() {
  const { sessionId } = Route.useParams();
  return <ChatSurface sessionId={sessionId} />;
}

export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionDetail,
});
