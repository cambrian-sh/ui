import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { queryClient } from './queryClient';

/**
 * A request/response read that is NOT on the feed.
 *
 * The rule this enforces is the one in `queryClient.ts`: live state is pushed
 * and folded into `projectionStore`, and nothing that arrives on `kernel://state`
 * may be cached here. What belongs here is the static-ish half — the label
 * vocabulary, the document listing, the policy set, the decision journal —
 * reads that change at author time rather than at runtime.
 *
 * `staleTime: Infinity` and every refetch disabled come from the shared client,
 * so a read added through this hook cannot start polling the kernel.
 *
 * The client is passed explicitly rather than taken from context, for the same
 * reason `useMutation` does it: a pane deep in a tab should not impose a
 * provider on every test that renders it.
 */
export function useKernelQuery<T>(
  key: readonly unknown[],
  fn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>,
): UseQueryResult<T, Error> {
  return useQuery<T, Error, T, readonly unknown[]>(
    { queryKey: key, queryFn: fn, ...options },
    queryClient,
  );
}
