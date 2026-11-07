import type { AsyncState } from "../hooks/useAsync";

/** Renders loading / error for an AsyncState; returns null once data is ready. */
export default function Status({ state }: { state: AsyncState<unknown> }) {
  if (state.status === "loading") return <p className="muted blink">Loading…</p>;
  if (state.status === "error")
    return <p className="error">Error: {state.error.message}</p>;
  return null;
}
