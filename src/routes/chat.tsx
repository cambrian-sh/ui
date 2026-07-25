import { createFileRoute } from '@tanstack/react-router';
import { ConversationPanel } from '@/screens/chat/ConversationPanel';

// The OSS chat lane (ADR-0084 D9). The screen itself gates on the "chat" capability, so an
// OSS kernel without the chat worker pool shows an unavailable state rather than a broken UI.
export const Route = createFileRoute('/chat')({
  component: ConversationPanel,
});
