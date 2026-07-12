import { createFileRoute } from '@tanstack/react-router';
import { LifecycleConsole } from '@/screens/lifecycle/LifecycleConsole';

export const Route = createFileRoute('/lifecycle')({
  component: LifecycleConsole,
});
