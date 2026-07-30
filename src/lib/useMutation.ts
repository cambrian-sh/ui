import { useCallback, useRef } from "react";
import { useMutation as useTanstackMutation } from "@tanstack/react-query";
import { errorMessage } from "./errorMessage";
import { queryClient } from "./queryClient";

export interface MutationApi<TArgs extends unknown[], T> {
  mutate: (...args: TArgs) => Promise<T | undefined>;
  isLoading: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * A kernel command, as a hook.
 *
 * Backed by TanStack Query's `useMutation` rather than hand-rolled state, so
 * every command gets the same pending/error lifecycle the rest of the app can
 * rely on. The shape stays `{ mutate, isLoading, error, resetError }` because
 * that is what the call sites read, and `error` stays a *string* — this console
 * renders the real reason from the core, never a generic toast.
 *
 * Two deliberate departures from Query's usual habits:
 *
 *  - **Nothing is invalidated on success.** The effect of a command arrives on
 *    the StreamEvents feed and is folded into the projection. Invalidating a
 *    cache here would either do nothing or race the fold. Optimistic updates
 *    are wrong for the same reason: show `isLoading`, and let the fold confirm.
 *  - **Concurrent calls are dropped, not queued.** Every mutating command
 *    carries a client-generated `command_id`, so a second call from a
 *    double-click is a second command, not a retry — the kernel would apply
 *    both. A genuine retry reuses the same `command_id` and is deduped
 *    kernel-side.
 */
export function useMutation<TArgs extends unknown[], T>(
  fn: (...args: TArgs) => Promise<T>,
): MutationApi<TArgs, T> {
  const inFlight = useRef(false);

  // The client is passed explicitly rather than read from context. A command is
  // a leaf concern — a list row, a detail aside, a confirmation dialog — and
  // making every one of those require a provider above it would put a test
  // harness requirement on components whose behaviour has nothing to do with
  // caching. The provider in main.tsx still covers hooks that do need context.
  const mutation = useTanstackMutation<T, unknown, TArgs>(
    { mutationFn: (args: TArgs) => fn(...args) },
    queryClient,
  );

  const { mutateAsync, reset } = mutation;

  const mutate = useCallback(
    async (...args: TArgs): Promise<T | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      try {
        return await mutateAsync(args);
      } catch {
        // The message is read off `mutation.error` below. Swallowing here keeps
        // `mutate` awaitable at call sites that only care whether it worked,
        // without forcing every one of them into a try/catch.
        return undefined;
      } finally {
        inFlight.current = false;
      }
    },
    [mutateAsync],
  );

  const resetError = useCallback(() => reset(), [reset]);

  return {
    mutate,
    isLoading: mutation.isPending,
    error: mutation.error != null ? errorMessage(mutation.error) : null,
    resetError,
  };
}
