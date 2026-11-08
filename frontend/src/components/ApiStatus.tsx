import { useEffect, useState } from "react";
import { onFallback, onSimSource } from "../api";
import type { SimSource } from "../simRouter";

/**
 * Small notes when something comes from the built-in mocks instead of the backend:
 * "offline data: …" for species/economy, and "offline sim" when Forecast and
 * Advance run on the built-in sanctuary model.
 */
export default function ApiStatus() {
  const [what, setWhat] = useState<string[]>([]);
  const [sim, setSim] = useState<SimSource | null>(null);
  useEffect(() => onFallback((w) => setWhat((ws) => (ws.includes(w) ? ws : [...ws, w]))), []);
  useEffect(() => onSimSource(setSim), []);
  return (
    <>
      {what.length > 0 && (
        <span className="api-status" title={`Using built-in data for: ${what.join(", ")}`}>
          offline data: {what.join(", ")}
        </span>
      )}
      <SimBadge source={sim} />
    </>
  );
}

/** "offline sim": Forecast and Advance both run on the built-in model (the backend's isn't complete or reachable). */
export function SimBadge({ source }: { source: SimSource | null }) {
  if (source !== "mock") return null;
  return (
    <span
      className="api-status"
      title="Forecast and Advance both use the built-in sanctuary model until the backend has /api/sanctuary/advance"
    >
      offline sim
    </span>
  );
}
