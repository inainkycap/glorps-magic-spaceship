import { useEffect, useEffectEvent, useState } from "react";
import { formatYear } from "../geo";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  DEFAULT_ZOOM,
  clampZoom,
  easeInOut,
  lerpCamera,
  pxPerDeg,
  shortestDLon,
  type Camera,
} from "../map/camera";
import FlightGlorp from "../map/FlightGlorp";
import { TRAVEL_FLIGHT } from "../map/flightPath";
import { useMapView } from "../map/MapViewContext";
import type { Place } from "../types";
import GlorpSprite from "./GlorpSprite";

/**
 * Glorp's trip from one place/era to another.
 *
 * Swappable: render it as a child of <WorldMap> (it reads and drives the camera
 * through useMapView) and it calls `onDone` once when the trip ends.
 * `onEraChange` (optional) fires each time the displayed year ticks over, which
 * the map uses for the timeline and to crossfade era terrain.
 *
 * Sequence: zoom out to fit the route → fly (shortest way, across the dateline
 * if shorter) while the year ticks over → zoom in on the destination. The
 * flight itself (hop, wobble, zib trail) is <FlightGlorp> (map/FlightGlorp.tsx, map/flightPath.ts),
 * shared with the short hop when you click empty map.
 * A zero-distance trip (pure time travel) zooms out and back in place.
 * With prefers-reduced-motion: no camera moves; Glorp appears at the
 * destination and `onDone` fires after a short pause.
 */
export interface TravelAnimationProps {
  from: Place;
  to: Place;
  onDone: () => void;
  onEraChange?: (year: number) => void;
}

const REDUCED_PAUSE_MS = 400;
const GLORP_PX = 64;
// Timeline (fractions of the trip): camera zooms out, Glorp flies, camera zooms in.
const ZOOM_OUT_END = 0.25;
const FLY_START = 0.15;
const FLY_END = 0.85;
const ZOOM_IN_START = 0.75;

export default function TravelAnimation({ from, to, onDone, onEraChange }: TravelAnimationProps) {
  const reduced = useReducedMotion();
  const view = useMapView();
  const [t, setT] = useState(0);

  const dLon = shortestDLon(from.lon, to.lon);
  const dLat = to.lat - from.lat;
  /** The flight's own time (0–1) at trip time tt: Glorp flies between FLY_START and FLY_END. */
  const flightTime = (tt: number) => Math.min(1, Math.max(0, (tt - FLY_START) / (FLY_END - FLY_START)));
  /** Flight progress (0–1, eased) at trip time tt. */
  const flightAt = (tt: number) => easeInOut(flightTime(tt));
  const yearAt = (f: number) => Math.round(from.era_year + (to.era_year - from.era_year) * f);

  const finish = useEffectEvent(() => onDone());
  const tickEra = useEffectEvent((year: number) => onEraChange?.(year));
  const snapshot = useEffectEvent(() => ({ cam: view.camera, vp: view.viewport }));
  const moveCamera = useEffectEvent((c: Camera) => view.setCamera(c));

  useEffect(() => {
    const { cam: start, vp } = snapshot();

    if (reduced) {
      moveCamera({ lon: to.lon, lat: to.lat, zoom: start.zoom });
      const id = setTimeout(() => {
        tickEra(to.era_year);
        finish();
      }, REDUCED_PAUSE_MS);
      return () => clearTimeout(id);
    }

    // Zoom that fits the whole route on screen (with room for Glorp and labels).
    const ppd1 = pxPerDeg(1, vp);
    const fit = Math.min(
      (vp.w - 240) / Math.max(1e-6, Math.abs(dLon) * ppd1),
      (vp.h - 280) / Math.max(1e-6, Math.abs(dLat) * ppd1),
    );
    const endZoom = Math.max(DEFAULT_ZOOM, start.zoom);
    const midZoom = clampZoom(Math.min(fit, Math.min(start.zoom, endZoom) / 1.6));
    const mid: Camera = { lon: from.lon + dLon / 2, lat: from.lat + dLat / 2, zoom: midZoom };
    const end: Camera = { lon: to.lon, lat: to.lat, zoom: endZoom };
    // Longer trips take a bit longer.
    const duration = 2600 + Math.min(1600, Math.hypot(dLon, dLat) * 8);

    let raf = 0;
    let t0: number | null = null;
    let lastYear = NaN;
    const frame = (now: number) => {
      t0 ??= now;
      const tt = Math.min(1, (now - t0) / duration);
      setT(tt);

      if (tt < ZOOM_IN_START) {
        moveCamera(lerpCamera(start, mid, easeInOut(tt / ZOOM_OUT_END)));
      } else {
        moveCamera(lerpCamera(mid, end, easeInOut((tt - ZOOM_IN_START) / (1 - ZOOM_IN_START))));
      }

      const year = yearAt(flightAt(tt));
      if (year !== lastYear) {
        lastYear = year;
        tickEra(year);
      }
      if (tt < 1) raf = requestAnimationFrame(frame);
      else finish();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, reduced]);

  const announce = (
    <span className="visually-hidden" role="status">
      Travelling to {formatYear(to.era_year)}…
    </span>
  );

  if (reduced) {
    const end = view.toScreen(to.lon, to.lat);
    return (
      <div className="travel">
        {announce}
        <div className="glorp-anchor" style={{ left: end.x, top: end.y }}>
          <GlorpSprite size={GLORP_PX} variant="fly" />
          <span className="travel-era">{formatYear(to.era_year)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="travel">
      {announce}
      <FlightGlorp
        from={from}
        to={to}
        t={flightTime(t)}
        style={TRAVEL_FLIGHT}
        label={<span className="travel-era">{formatYear(yearAt(flightAt(t)))}</span>}
      />
    </div>
  );
}
