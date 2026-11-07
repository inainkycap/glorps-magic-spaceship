import { useEffect, useState } from "react";
import GlorpSprite from "../components/GlorpSprite";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { easeInOut, shortestDLon } from "./camera";
import { useMapView } from "./MapViewContext";

const HOVER_MS = 700;
const GLORP_PX = 64;

type LonLat = { lon: number; lat: number };

/**
 * Glorp idling on the map. When `at` changes (e.g. the player clicked empty
 * map), Glorp hovers there the short way round instead of teleporting.
 * Reduced motion: moves instantly.
 */
export default function GlorpMarker({ at }: { at: LonLat }) {
  const view = useMapView();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(at); // last target we started animating to
  const [from, setFrom] = useState<LonLat | null>(null);
  const [t, setT] = useState(1);

  if (shown.lon !== at.lon || shown.lat !== at.lat) {
    // New target: start from wherever Glorp currently appears.
    const f = easeInOut(t);
    const cur = from
      ? { lon: from.lon + shortestDLon(from.lon, shown.lon) * f, lat: from.lat + (shown.lat - from.lat) * f }
      : shown;
    setFrom(reduced ? null : cur);
    setShown(at);
    setT(reduced ? 1 : 0);
  }

  useEffect(() => {
    if (!from) return;
    let raf = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const tt = Math.min(1, (now - t0) / HOVER_MS);
      setT(tt);
      if (tt < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, shown]);

  const f = easeInOut(t);
  const lon = from ? from.lon + shortestDLon(from.lon, shown.lon) * f : shown.lon;
  const lat = from ? from.lat + (shown.lat - from.lat) * f : shown.lat;
  const p = view.toScreen(lon, lat);
  const hop = from ? Math.sin(Math.PI * f) * 14 : 0;
  const flying = from !== null && t < 1;

  return (
    <div className="glorp-anchor idle" style={{ left: p.x, top: p.y - hop }}>
      <GlorpSprite size={GLORP_PX} variant={flying ? "fly" : "idle"} flip={!!from && shortestDLon(from.lon, shown.lon) < 0} />
    </div>
  );
}
