import { useEffect, useState } from "react";
import Sprite from "../components/Sprite";
import { DISASTERS, SIM_RUNS, SIM_YEARS } from "../game/sanctuary";
import { useReducedMotion } from "../hooks/useReducedMotion";

const DURATION_MS = 700;

/**
 * The "simulating" overlay on the planet while a forecast runs (~0.7 s): a year
 * counter ticking, a "future 1 … 1,000" counter, and disaster icons flickering
 * over the domes. Reduced motion: just "Simulating…".
 */
export default function ForecastAnimation({ domeSpots }: { domeSpots: { x: number; y: number }[] }) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const tt = Math.min(1, (now - t0) / DURATION_MS);
      setT(tt);
      if (tt < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  if (reduced) {
    return (
      <div className="forecast-anim" role="status">
        <p className="fa-plain">Simulating…</p>
      </div>
    );
  }

  const future = Math.max(1, Math.round(t * SIM_RUNS));
  const year = Math.round(((t * 7) % 1) * SIM_YEARS); // years sweep several times
  const frame = Math.floor(t * 14); // which icons flicker this frame
  return (
    <div className="forecast-anim" role="status" aria-label="Simulating 1,000 futures">
      <div className="fa-counters">
        <span className="fa-year">Year +{year}</span>
        <span className="fa-future">
          future {future.toLocaleString("en-US")} / {SIM_RUNS.toLocaleString("en-US")}
        </span>
      </div>
      {domeSpots.map((p, i) =>
        (frame + i) % 3 === 0 ? (
          <span key={i} className="fa-flicker" style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-hidden="true">
            <Sprite
              name={`disaster-${DISASTERS[(frame + i) % DISASTERS.length].id}`}
              width={16}
              height={16}
              fallback={<span className="disaster-fallback" />}
            />
          </span>
        ) : null,
      )}
    </div>
  );
}
