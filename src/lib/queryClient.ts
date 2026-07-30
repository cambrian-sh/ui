import { QueryClient } from '@tanstack/react-query';

/**
 * The query client for the console's *imperative edges only*.
 *
 * Cambrian's live state is pushed, not fetched. The Rust core folds the
 * StreamEvents feed and pushes absolute-state projections over `kernel://state`;
 * that feed is the only source of live state and there is no "click to refresh"
 * anywhere in this app (CONTEXT.md §4).
 *
 * So sessions, plans, pending_hitl, agents, memory events, cost, lifecycle,
 * verifier and connection state MUST NOT live here. Query's model — a cache with
 * staleness, refetch-on-focus, refetch intervals — is exactly the model this
 * architecture rejects. Wrapping the feed in it would reintroduce polling,
 * double-store the truth, and produce a console that can disagree with the
 * kernel. That state belongs in `projectionStore`, folded by `onKernelState`.
 *
 * What DOES belong here is the request/response half that is not on the feed:
 *   - every mutation (useMutation), for `isPending` / `error` / retry
 *   - `answerMemory` — a question is an action, not a cache key
 *   - `queryAudit` — the one genuinely paginated read (useInfiniteQuery)
 *   - `explainAccess`, `listClassificationTags`, `statFile` — static-ish reads
 *
 * The defaults below are deliberately inert: every automatic refetch is off, so
 * a future `useQuery` cannot start polling the kernel by accident. Turning any
 * of these back on is an architecture change, not a tuning change.
 *
 * Mutations never invalidate anything. The effect of a command arrives on the
 * feed — that is the whole point of the two-tier model, and it is why optimistic
 * updates are wrong here too. Show `isPending`, and let the fold confirm.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: false,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });
}

export const queryClient = createQueryClient();
