import { useEffect, useEffectEvent, useState } from "react";
import { formatYear, project } from "../geo";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { Place } from "../types";
import GlorpSprite from "./GlorpSprite";

/**
 * Glorp's trip from one place/era to another, drawn over the world map.
 *
 * Self-contained so it can be swapped for a fancier animation: render it inside
 * a positioned box with the same aspect as the map (it fills it with
 * `position: absolute; inset: 0`) and it calls `onDone` once when the trip ends.
 * `onEraChange` (optional) fires each time the displayed year ticks over.
 *
 * With prefers-reduced-motion it skips the flight: Glorp appears at the
 * destination and `onDone` fires after a short pause.
 */
export interface TravelAnimationProps {
  from: Place;
  to: Place;
  onDone: () => void;
  onEraChange?: (year: number) => void;
}

const DURATION_MS = 2600;
const REDUCED_PAUSE_MS = 400;
const ZIB_EVERY = 0.1; // drop a "zib" every 10% of the distance
const ZIB_LIFE = 0.25; // each one fades out over 25% of the trip's time

const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
/** Inverse of easeInOut: the time at which progress p is reached. */
const timeAtProgress = (p: number) => Math.acos(1 - 2 * p) / Math.PI;

/** Position (map %) and tilt (deg) at time t ∈ [0, 1]. */
function pathAt(from: Place, to: Place, t: number) {
  const a = project(from.lat, from.lon);
  const b = project(to.lat, to.lon);
  const p = easeInOut(t);
  const lift = Math.sin(Math.PI * p); // 0 at both ends, 1 mid-flight
  const wobble = Math.sin(t * Math.PI * 10);
  const x = a.x + (b.x - a.x) * p;
  const y = a.y + (b.y - a.y) * p - lift * 10 + wobble * lift * 2.5;
  return { x, y: Math.max(2, y), tilt: Math.cos(t * Math.PI * 10) * 14 * lift };
}

function yearAt(from: Place, to: Place, t: number) {
  return Math.round(from.era_year + (to.era_year - from.era_year) * easeInOut(t));
}

export default function TravelAnimation({ from, to, onDone, onEraChange }: TravelAnimationProps) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const finish = useEffectEvent(() => onDone());
  const tickEra = useEffectEvent((year: number) => onEraChange?.(year));

  useEffect(() => {
    if (reduced) {
      const id = setTimeout(() => {
        tickEra(to.era_year);
        finish();
      }, REDUCED_PAUSE_MS);
      return () => clearTimeout(id);
    }

    let raf = 0;
    let start: number | null = null;
    let lastYear = NaN;
    const frame = (now: number) => {
      start ??= now;
      const tt = Math.min(1, (now - start) / DURATION_MS);
      setT(tt);
      const year = yearAt(from, to, tt);
      if (year !== lastYear) {
        lastYear = year;
        tickEra(year);
      }
      if (tt < 1) raf = requestAnimationFrame(frame);
      else finish();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [from, to, reduced]);

  const announce = (
    <span className="visually-hidden" role="status">
      Travelling to {formatYear(to.era_year)}…
    </span>
  );

  if (reduced) {
    const end = project(to.lat, to.lon);
    return (
      <div className="travel">
        {announce}
        <div className="travel-glorp" style={{ left: `${end.x}%`, top: `${end.y}%` }}>
          <GlorpSprite size={48} />
          <span className="travel-era">{formatYear(to.era_year)}</span>
        </div>
      </div>
    );
  }

  const pos = pathAt(from, to, t);
  const zibs = [];
  // Evenly spaced along the path, so they don't bunch up while Glorp accelerates.
  const progress = easeInOut(t);
  for (let i = 1; i * ZIB_EVERY < progress; i++) {
    const ti = timeAtProgress(i * ZIB_EVERY);
    const age = (t - ti) / ZIB_LIFE;
    if (age >= 1) continue;
    const z = pathAt(from, to, ti);
    zibs.push(
      <span
        key={i}
        className="zib"
        style={{
          left: `${z.x}%`,
          top: `${z.y}%`,
          opacity: 1 - age,
          transform: `translate(-50%, -50%) translateY(${-age * 14}px)`,
        }}
      >
        zib
      </span>,
    );
  }

  return (
    <div className="travel">
      {announce}
      {zibs}
      <div className="travel-glorp" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
        <div style={{ transform: `rotate(${pos.tilt}deg)` }}>
          <GlorpSprite size={48} />
        </div>
        <span className="travel-era">{formatYear(yearAt(from, to, t))}</span>
      </div>
    </div>
  );
}
