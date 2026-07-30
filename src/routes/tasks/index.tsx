
import { createFileRoute } from '@tanstack/react-router';
import { TasksConsole } from '@/screens/tasks/TasksConsole';

export const Route = createFileRoute('/tasks/')({
  component: TasksConsole,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === 'string' ? search.focus : undefined,
  }),
});
