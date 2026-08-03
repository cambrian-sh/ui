import { useEffect, useRef } from "react";
import { queryClient } from "./queryClient";

/**
 * Re-read the request/response half when the kernel comes back.
 *
 * # Why this is not a violation of the no-polling rule
 *
 * `queryClient` disables every automatic refetch, and that is right for LIVE
 * state: sessions, plans and costs are pushed on the feed, and wrapping them in
 * a cache with staleness would double-store the truth.
 *
 * But the reads that go through `useKernelQuery` are not live state — they are
 * kernel-side CONFIGURATION: which pipelines are authored, which watches exist,
 * what the label vocabulary is. Those change, and nothing pushes them. With
 * `staleTime: Infinity` and every refetch off, they were fetched once per app
 * launch and never again, so a kernel restart — or a pipeline armed by anything
 * other than this window — left the console showing a list that was quietly
 * wrong until someone reloaded the app.
 *
 * That is the failure this closes, and it is the same failure the whole design
 * keeps guarding against: a surface that looks like coverage and provides none.
 *
 * This is not a poll. It fires on one edge — the connection becoming live —
 * which is exactly when what the kernel holds may have changed underneath us.
 */
export function useRefetchOnReconnect(status: string) {
  const previous = useRef(status);
  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    // Only on the EDGE into live. Staying live must not refetch, or this becomes
    // the poll the architecture rejects.
    if (status !== "live" || was === "live") return;
    void queryClient.invalidateQueries();
  }, [status]);
}
