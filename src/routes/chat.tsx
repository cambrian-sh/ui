import { createFileRoute } from '@tanstack/react-router';
import { ChatConsole } from '@/screens/chat/ChatConsole';

// The front door (12a). Distinct from `/sessions/$id`, which is a session that
// already exists: chat is where work is SHAPED, and the session begins on
// approval of a proposed plan.
export const Route = createFileRoute('/chat')({
  component: ChatConsole,
});
