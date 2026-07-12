import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMutation } from "./useMutation";

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

    act(() => result.current.resetError());
    expect(result.current.error).toBeNull();
  });

  it("ignores concurrent calls while one is in flight", async () => {
    let release: () => void;
    const fn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("done");
        }),
    );
    const { result } = renderHook(() => useMutation(fn));

    act(() => {
      void result.current.mutate();
      void result.current.mutate();
    });

    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      release!();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
