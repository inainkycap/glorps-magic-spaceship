import { useEffect, useState } from "react";
import { onZorpsGain, type ZorpsGain } from "../hooks/useProgress";
import Sprite from "./Sprite";

const SHOW_MS = 2400;

/**
 * "+N Zorps" popups for every gain (discoveries, rescues, sanctuary payouts).
 * Rendered once at the app root. They float up and fade (CSS); under
 * prefers-reduced-motion they just appear and disappear.
 */
export default function ZorpsToasts() {
  const [gains, setGains] = useState<ZorpsGain[]>([]);

  useEffect(
    () =>
      onZorpsGain((g) => {
        setGains((gs) => [...gs.slice(-3), g]);
        setTimeout(() => setGains((gs) => gs.filter((x) => x.id !== g.id)), SHOW_MS);
      }),
    [],
  );

  return (
    <div className="zorps-toasts" aria-live="polite">
      {gains.map((g) => (
        <div key={g.id} className="zorps-toast">
          <Sprite name="zorps" width={16} height={16} fallback={<span className="zorps-fallback">Z</span>} />
          <span className="zt-amount">+{g.amount} Zorps</span>
          <span className="zt-reason">{g.reason}</span>
        </div>
      ))}
    </div>
  );
}
