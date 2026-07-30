import { createFileRoute } from '@tanstack/react-router';
import { PipelinesConsole } from '@/screens/reactive/PipelinesConsole';

// The reactive plane. Replaces the old watch list, which could only show a
// watch's id and error count — the pipeline console shows the source, the
// throttle, the gate and what each one actually did.
export const Route = createFileRoute('/watch')({
  component: PipelinesConsole,
  validateSearch: (search: Record<string, unknown>): { focus?: string } =>
    typeof search.focus === 'string' ? { focus: search.focus } : {},
});
