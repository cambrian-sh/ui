import { createFileRoute } from '@tanstack/react-router';
import { LinkReviewConsole } from '@/screens/links/LinkReviewConsole';

export const Route = createFileRoute('/links')({
  component: LinkReviewConsole,
});
