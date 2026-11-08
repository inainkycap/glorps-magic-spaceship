import { useEffect, useState } from "react";
import GlorpSprite from "../components/GlorpSprite";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { easeInOut } from "./camera";
import FlightGlorp from "./FlightGlorp";
import { flightPoint, HOP_FLIGHT } from "./flightPath";
import { useMapView } from "./MapViewContext";

/** Short hop: no zoom, no era change, free. Slightly longer for longer hops. */
const HOP_BASE_MS = 900;
const HOP_MAX_EXTRA_MS = 500;
const GLORP_PX = 64;

type LonLat = { lon: number; lat: number };

/**
 * Glorp idling on the map. When `at` changes (e.g. the player clicked empty
 * map), Glorp flies there in the same style as time travel (hop, wobble,
 * "zib zib zib" trail; see map/FlightGlorp.tsx), just shorter and without moving
 * the camera. Reduced motion: Glorp just moves.
 */
export default function GlorpMarker({ at }: { at: LonLat }) {
  const view = useMapView();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(at); // last target we started flying to
  const [from, setFrom] = useState<LonLat | null>(null);
  const [t, setT] = useState(1);

  if (shown.lon !== at.lon || shown.lat !== at.lat) {
    // New target, even mid-hop: start from wherever Glorp currently appears.
    const cur = from ? flightPoint(from, shown, easeInOut(t)) : shown;
    setFrom(reduced ? null : cur);
    setShown(at);
    setT(reduced ? 1 : 0);
  }

  useEffect(() => {
    if (!from) return;
    const a = view.toScreen(from.lon, from.lat);
    const b = view.toScreen(shown.lon, shown.lat);
    const duration = HOP_BASE_MS + Math.min(HOP_MAX_EXTRA_MS, Math.hypot(b.x - a.x, b.y - a.y));
    let raf = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const tt = Math.min(1, (now - t0) / duration);
      setT(tt);
      if (tt < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Duration is fixed when the hop starts; later camera moves don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, shown]);

  if (from && t < 1) {
    return <FlightGlorp from={from} to={shown} t={t} style={HOP_FLIGHT} />;
  }

  const p = view.toScreen(shown.lon, shown.lat);
  return (
    <div className="glorp-anchor idle" style={{ left: p.x, top: p.y }}>
      <GlorpSprite size={GLORP_PX} />
    </div>
  );
}
