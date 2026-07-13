
import { createFileRoute } from '@tanstack/react-router';
import { ChatSurface } from '@/screens/chat/ChatSurface';

function SessionDetail() {
  const { sessionId } = Route.useParams();
  return <ChatSurface sessionId={sessionId} />;
}

export const Route = createFileRoute('/sessions/$sessionId')({
  component: SessionDetail,
});
