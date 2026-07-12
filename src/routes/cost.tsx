import { createFileRoute } from '@tanstack/react-router';
import { CostConsole } from '@/screens/cost/CostConsole';

export const Route = createFileRoute('/cost')({
  component: CostConsole,
});
