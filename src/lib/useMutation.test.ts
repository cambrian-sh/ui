import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMutation } from "./useMutation";

// These assert the hook's *contract* — a result, a surfaced error message, a
// clearable error, and one command per call however many times the button is
// pressed. They deliberately do not assert when the underlying function is
// invoked: since moving onto TanStack Query, dispatch happens on a microtask
// rather than synchronously inside `mutate`, which is invisible to a caller
// that awaits it and is not something a call site should depend on.
describe("useMutation", () => {
  it("resolves and exposes the result", async () => {
    const fn = vi.fn(async (n: number) => n * 2);
    const { result } = renderHook(() => useMutation(fn));

    let value: number | undefined;
    await act(async () => {
      value = await result.current.mutate(21);
    });

    expect(value).toBe(42);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fn).toHaveBeenCalledWith(21);
  });

  it("captures the error message and clears on reset", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useMutation(fn));

    await act(async () => {
      await result.current.mutate();
    });

    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      result.current.resetError();
    });
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("ignores concurrent calls while one is in flight", async () => {
    let release: (() => void) | undefined;
    const fn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("done");
        }),
    );
    const { result } = renderHook(() => useMutation(fn));

    let first: Promise<string | undefined>;
    let second: Promise<string | undefined>;
    act(() => {
      first = result.current.mutate();
      second = result.current.mutate();
    });

    // The second press is dropped, not queued: every mutating command carries
    // its own command_id, so firing twice would apply the command twice.
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    await expect(second!).resolves.toBeUndefined();

    await act(async () => {
      release!();
      await first!;
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
