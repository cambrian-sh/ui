import { useCallback, useRef, useState } from "react";

export interface MutationApi<TArgs extends unknown[], T> {
  mutate: (...args: TArgs) => Promise<T | undefined>;
  isLoading: boolean;
  error: string | null;
  resetError: () => void;
}

export function useMutation<TArgs extends unknown[], T>(
  fn: (...args: TArgs) => Promise<T>,
): MutationApi<TArgs, T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const mutate = useCallback(
    async (...args: TArgs): Promise<T | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setIsLoading(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return undefined;
      } finally {
        setIsLoading(false);
        inFlight.current = false;
      }
    },
    [fn],
  );

  const resetError = useCallback(() => setError(null), []);

  return { mutate, isLoading, error, resetError };
}
