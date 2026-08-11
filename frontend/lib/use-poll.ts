"use client";

import { useCallback, useEffect, useState } from "react";

type PollState<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: T };

type Poll<T> = { state: PollState<T>; reload: () => void };

// Polls `fn` every `intervalMs`, aborting in-flight requests on unmount.
// `fn` must be referentially stable (wrap it in useCallback at the call site).
export function usePoll<T>(fn: (signal: AbortSignal) => Promise<T>, intervalMs: number): Poll<T> {
  const [state, setState] = useState<PollState<T>>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const load = async () => {
      try {
        const data = await fn(controller.signal);
        if (!disposed) setState({ kind: "ready", data });
      } catch (e: unknown) {
        if (disposed || controller.signal.aborted) return;
        setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), intervalMs);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [fn, intervalMs, tick]);

  return { state, reload };
}
