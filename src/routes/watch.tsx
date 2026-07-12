import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { WatchConsole } from '@/screens/watch/WatchConsole';

const watchSearchSchema = z.object({
  focus: z.string().optional(),
});

export const Route = createFileRoute('/watch')({
  validateSearch: watchSearchSchema,
  component: WatchConsole,
});
