import { createFileRoute, redirect } from '@tanstack/react-router';

// `/` lands in Chat: it is where an end user asks for work and watches it run,
// and the old Now dashboard duplicated the Inbox and Tasks while reading spend
// and breaker state the Rust fold never populates (deleted 2026-11-06, see
// cambrian-knowledge/investigations/2026-11-06-operator-console-redesign.md).
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/chat' });
  },
});
