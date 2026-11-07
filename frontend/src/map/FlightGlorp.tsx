import type { ReactNode } from "react";
import GlorpSprite from "../components/GlorpSprite";
import { easeInOut, shortestDLon } from "./camera";
import { flightPoint, timeAtProgress, type FlightStyle, type LonLat } from "./flightPath";
import { useMapView } from "./MapViewContext";

const GLORP_PX = 64;

/**
 * Glorp mid-flight plus the zib trail, in screen space (render inside <WorldMap>).
 * `t` is the flight's own time, 0 → 1; easing is applied here.
 */
export default function FlightGlorp({
  from,
  to,
  t,
  style,
  label,
}: {
  from: LonLat;
  to: LonLat;
  t: number;
  style: FlightStyle;
  /** Optional tag under Glorp (the ticking year during time travel). */
  label?: ReactNode;
}) {
  const view = useMapView();
  const westward = shortestDLon(from.lon, to.lon) < 0;

  const screenAt = (tt: number) => {
    const f = easeInOut(tt);
    const g = flightPoint(from, to, f);
    const s = view.toScreen(g.lon, g.lat);
    const hop = Math.sin(Math.PI * f);
    const phase = tt * Math.PI * 2 * style.wobbleCycles;
    return {
      x: s.x,
      y: s.y - hop * style.lift + Math.sin(phase) * hop * style.wobble,
      tilt: Math.cos(phase) * style.tilt * hop,
    };
  };

  const pos = screenAt(t);
  const progress = easeInOut(t);
  const zibs = [];
  // Evenly spaced along the path, so they don't bunch up while Glorp accelerates.
  for (let i = 1; i * style.zibEvery < progress; i++) {
    const ti = timeAtProgress(i * style.zibEvery);
    const age = (t - ti) / style.zibLife;
    if (age >= 1) continue;
    const z = screenAt(ti);
    zibs.push(
      <span
        key={i}
        className="zib"
        style={{ left: z.x, top: z.y, opacity: 1 - age, transform: `translate(-50%, -50%) translateY(${-age * 16}px)` }}
      >
        zib
      </span>,
    );
  }

  return (
    <>
      {zibs}
      <div className="glorp-anchor" style={{ left: pos.x, top: pos.y }}>
        <div style={{ transform: `rotate(${pos.tilt}deg)` }}>
          <GlorpSprite size={GLORP_PX} variant="fly" flip={westward} />
        </div>
        {label}
      </div>
    </>
  );
}
