import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Sprite from "../components/Sprite";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  DEFAULT_ZOOM,
  clampCamera,
  easeInOut,
  fromScreen,
  lerpCamera,
  mapTiles,
  panBy,
  screenXs,
  toScreen,
  zoomAround,
  type Camera,
  type Viewport,
} from "./camera";
import { mapImageFor } from "./eras";
import { MapViewContext, type MapView } from "./MapViewContext";

const DRAG_THRESHOLD_PX = 5;
const ZOOM_STEP = 1.5;
const CROSSFADE_MS = 600;

/** Ask the map to bring a point into view. Bump `seq` to repeat a request. */
export interface FocusRequest {
  lon: number;
  lat: number;
  seq: number;
}

/**
 * Full-bleed wrapping world map with a custom camera:
 * drag to pan, wheel / pinch to zoom toward the pointer, +/−/recenter buttons,
 * arrow keys and +/- when focused. `children` are screen-space overlays that
 * read the camera via useMapView(); mark interactive overlay UI with
 * `data-map-ui` so presses on it don't pan the map or count as map clicks.
 */
export default function WorldMap({
  initialCenter,
  home,
  era,
  interactive = true,
  onMapClick,
  focus,
  children,
}: {
  initialCenter: { lon: number; lat: number };
  /** Where the recenter button goes (Glorp). */
  home: { lon: number; lat: number };
  /** Displayed year: picks the terrain image together with the zoom (see eras.ts). */
  era: number;
  /** False while something else (time travel) is driving the camera. */
  interactive?: boolean;
  /** A click (not a drag) on empty map. */
  onMapClick?: (lon: number, lat: number) => void;
  /** Pan (keeping the zoom) so this point is centred. */
  focus?: FocusRequest | null;
  children?: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [vp, setVp] = useState<Viewport>({ w: 0, h: 0 });
  const vpRef = useRef(vp);
  const [rawCamera, setRawCamera] = useState<Camera>({ ...initialCenter, zoom: DEFAULT_ZOOM });
  const camera = clampCamera(rawCamera, vp);

  // --- viewport size ---------------------------------------------------------
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const next = { w: entry.contentRect.width, h: entry.contentRect.height };
      vpRef.current = next;
      setVp(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- camera updates (clamped) and short eased moves for the buttons ---------
  const tweenRef = useRef(0);
  const stopTween = () => cancelAnimationFrame(tweenRef.current);

  const setCamera = useCallback((next: Camera | ((c: Camera) => Camera)) => {
    setRawCamera((c) => {
      const cur = clampCamera(c, vpRef.current);
      return clampCamera(typeof next === "function" ? next(cur) : next, vpRef.current);
    });
  }, []);

  /** Eased camera move; always starts on the next frame (instant with reduced motion). */
  const flyTo = (target: Camera, ms = 300) => {
    stopTween();
    const start = camera;
    const duration = reduced ? 0 : ms;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const t = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      setCamera(lerpCamera(start, target, easeInOut(t)));
      if (t < 1) tweenRef.current = requestAnimationFrame(step);
    };
    tweenRef.current = requestAnimationFrame(step);
  };
  useEffect(() => stopTween, []);
  useEffect(() => {
    if (!interactive) stopTween();
  }, [interactive]);

  const onFocus = useEffectEvent((f: FocusRequest) => flyTo({ lon: f.lon, lat: f.lat, zoom: camera.zoom }, 500));
  useEffect(() => {
    if (focus) onFocus(focus);
  }, [focus]);

  const zoomBy = (factor: number) =>
    flyTo(zoomAround(camera, vp, vp.w / 2, vp.h / 2, camera.zoom * factor));
  const recenter = () => flyTo({ ...home, zoom: DEFAULT_ZOOM }, 500);

  // --- pointer input: drag to pan, two pointers to pinch-zoom ----------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, startX: 0, startY: 0, pinchDist: 0 });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Let overlay UI (pins, the travel bubble, buttons) handle its own presses.
    if (!interactive || (e.target as Element).closest("button, a, [data-map-ui]")) return;
    stopTween();
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      gesture.current = { moved: false, startX: p.x, startY: p.y, pinchDist: 0 };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.moved = true; // a pinch is never a click
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      stageRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;

    if (pointers.current.size === 1) {
      if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) > DRAG_THRESHOLD_PX) {
        g.moved = true;
        // Capture only once it's a real drag, so plain clicks keep their target.
        stageRef.current?.setPointerCapture(e.pointerId);
      }
      if (g.moved) setCamera((c) => panBy(c, vpRef.current, p.x - prev.x, p.y - prev.y));
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const factor = g.pinchDist > 0 ? dist / g.pinchDist : 1;
      g.pinchDist = dist;
      setCamera((c) => {
        const zoomed = zoomAround(c, vpRef.current, mid.x, mid.y, c.zoom * factor);
        return panBy(zoomed, vpRef.current, (p.x - prev.x) / 2, (p.y - prev.y) / 2);
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const wasClick = pointers.current.size === 1 && !gesture.current.moved;
    pointers.current.delete(e.pointerId);
    if (wasClick && e.type === "pointerup" && onMapClick) {
      const p = local(e);
      const at = fromScreen(camera, vp, p.x, p.y);
      onMapClick(at.lon, at.lat);
    }
  };

  // --- wheel zoom (non-passive listener so we can stop the page scrolling) ---
  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault();
    if (!interactive) return;
    stopTween();
    const p = local(e);
    // ctrlKey = trackpad pinch on most browsers; it reports smaller deltas.
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    setCamera((c) => zoomAround(c, vpRef.current, p.x, p.y, c.zoom * factor));
  });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => onWheel(e);
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive || e.target !== stageRef.current) return;
    const PAN = 80;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [PAN, 0],
      ArrowRight: [-PAN, 0],
      ArrowUp: [0, PAN],
      ArrowDown: [0, -PAN],
    };
    if (moves[e.key]) {
      e.preventDefault();
      setCamera((c) => panBy(c, vpRef.current, ...moves[e.key]));
    } else if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
    else if (e.key === "-") zoomBy(1 / ZOOM_STEP);
  };

  // --- context for overlays --------------------------------------------------
  const view = useMemo<MapView>(
    () => ({
      camera,
      viewport: vp,
      setCamera,
      toScreen: (lon, lat) => toScreen(camera, vp, lon, lat),
      screenXs: (lon) => screenXs(camera, vp, lon),
    }),
    // camera is a fresh object each render; depend on its fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera.lon, camera.lat, camera.zoom, vp, setCamera],
  );

  const tiles = mapTiles(camera, vp);
  // Simplified overview map when zoomed out, detailed terrain when zoomed in.
  const src = mapImageFor(era, camera.zoom);

  return (
    <div
      ref={stageRef}
      className={`world-map ${interactive ? "" : "locked"}`}
      tabIndex={0}
      aria-label="World map. Drag or use arrow keys to pan, plus and minus to zoom."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {vp.h > 0 && (
        <>
          <MapLayers src={src} tiles={tiles} reduced={reduced} />
          <MapViewContext.Provider value={view}>{children}</MapViewContext.Provider>
          <div className="map-controls">
            <button className="px-button icon" onClick={() => zoomBy(ZOOM_STEP)} disabled={!interactive || camera.zoom >= 8} aria-label="Zoom in">
              <Sprite name="icon-plus" width={16} height={16} fallback="+" />
            </button>
            <button className="px-button icon" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={!interactive || camera.zoom <= 1} aria-label="Zoom out">
              <Sprite name="icon-minus" width={16} height={16} fallback="−" />
            </button>
            <button className="px-button icon" onClick={recenter} disabled={!interactive} aria-label="Recenter on Glorp">
              <Sprite name="btn_recenter_glorp" width={16} height={16} fallback="◎" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The map image, tiled east–west, crossfading when `src` changes. */
function MapLayers({
  src,
  tiles,
  reduced,
}: {
  src: string;
  tiles: ReturnType<typeof mapTiles>;
  reduced: boolean;
}) {
  const [layers, setLayers] = useState([{ src, id: 0 }]);
  const top = layers[layers.length - 1];
  if (top.src !== src) {
    // New era image: keep the old one underneath while the new one fades in.
    setLayers([top, { src, id: top.id + 1 }]);
  }
  useEffect(() => {
    if (layers.length < 2) return;
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), reduced ? 0 : CROSSFADE_MS);
    return () => clearTimeout(t);
  }, [layers, reduced]);

  return (
    <div className="map-layers" aria-hidden="true">
      {layers.map((layer, i) => (
        <div key={layer.id} className={`map-layer ${i > 0 ? "fading-in" : ""}`}>
          {tiles.lefts.map((left, k) => (
            <img
              key={k}
              className="map-tile"
              src={layer.src}
              alt=""
              draggable={false}
              style={{ width: tiles.W, height: tiles.H, transform: `translate3d(${left}px, ${tiles.top}px, 0)` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
