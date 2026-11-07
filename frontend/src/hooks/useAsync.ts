import { useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ok"; data: T };

/**
 * Runs `load` whenever `key` changes and returns its state. Results from a
 * stale key are ignored, and a new key reads as "loading" until it resolves.
 */
export function useAsync<T>(key: string, load: () => Promise<T>): AsyncState<T> {
  const [settled, setSettled] = useState<{ key: string; state: AsyncState<T> } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setSettled({ key, state: { status: "ok", data } });
      },
      (e: unknown) => {
        if (!cancelled)
          setSettled({
            key,
            state: { status: "error", error: e instanceof Error ? e : new Error(String(e)) },
          });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is usually an inline closure; `key` is what identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return settled && settled.key === key ? settled.state : { status: "loading" };
}
