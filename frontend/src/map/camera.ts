// Camera maths for the wrapping equirectangular world map. Pure functions, no React.
//
// The camera is a centre (lon, lat) plus a zoom. At zoom 1 the whole world's
// height exactly fills the viewport (so you can never see past the poles); the
// world is twice as wide as it is tall and repeats forever east–west.
// Pixels per degree are the same on both axes.

export interface Camera {
  lon: number; // centre, -180…180
  lat: number; // centre, clamped so the poles never come into view
  zoom: number; // MIN_ZOOM…MAX_ZOOM
}

export interface Viewport {
  w: number;
  h: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 2;

/** Wrap a longitude into [-180, 180). */
export function normLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Signed longitude change from a to b the short way round (crosses the dateline if shorter). */
export function shortestDLon(a: number, b: number): number {
  return normLon(b - a);
}

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function pxPerDeg(zoom: number, vp: Viewport): number {
  return (vp.h * zoom) / 180;
}

/** World size in px at this zoom: width is one full copy of the map. */
export function worldSize(zoom: number, vp: Viewport) {
  const h = vp.h * zoom;
  return { w: h * 2, h };
}

/** Normalise lon, clamp zoom, and clamp lat so the poles stay at or beyond the viewport edges. */
export function clampCamera(cam: Camera, vp: Viewport): Camera {
  const zoom = clampZoom(cam.zoom);
  if (vp.h <= 0) return { lon: normLon(cam.lon), lat: cam.lat, zoom };
  const halfDeg = vp.h / 2 / pxPerDeg(zoom, vp);
  const maxLat = Math.max(0, 90 - halfDeg);
  return { lon: normLon(cam.lon), lat: Math.min(maxLat, Math.max(-maxLat, cam.lat)), zoom };
}

/**
 * Screen position of (lon, lat), using the copy of the world nearest the
 * viewport centre. Use for things that exist once (Glorp).
 */
export function toScreen(cam: Camera, vp: Viewport, lon: number, lat: number) {
  const ppd = pxPerDeg(cam.zoom, vp);
  return {
    x: vp.w / 2 + shortestDLon(cam.lon, lon) * ppd,
    y: vp.h / 2 - (lat - cam.lat) * ppd,
  };
}

/**
 * Every on-screen x position of a longitude (there can be several when the
 * viewport is wider than one world). `margin` keeps things just off-screen too.
 */
export function screenXs(cam: Camera, vp: Viewport, lon: number, margin = 120): number[] {
  const { w: W } = worldSize(cam.zoom, vp);
  const base = toScreen(cam, vp, lon, 0).x;
  const xs: number[] = [];
  const kMin = Math.ceil((-margin - base) / W);
  const kMax = Math.floor((vp.w + margin - base) / W);
  for (let k = kMin; k <= kMax; k++) xs.push(base + k * W);
  return xs;
}

/** The (lon, lat) under a screen point. */
export function fromScreen(cam: Camera, vp: Viewport, x: number, y: number) {
  const ppd = pxPerDeg(cam.zoom, vp);
  return {
    lon: normLon(cam.lon + (x - vp.w / 2) / ppd),
    lat: Math.max(-90, Math.min(90, cam.lat - (y - vp.h / 2) / ppd)),
  };
}

/** Pan by a screen-space drag delta (content follows the pointer). */
export function panBy(cam: Camera, vp: Viewport, dx: number, dy: number): Camera {
  const ppd = pxPerDeg(cam.zoom, vp);
  return clampCamera({ ...cam, lon: cam.lon - dx / ppd, lat: cam.lat + dy / ppd }, vp);
}

/** Zoom to `zoom`, keeping the point under screen (x, y) fixed. */
export function zoomAround(cam: Camera, vp: Viewport, x: number, y: number, zoom: number): Camera {
  const z = clampZoom(zoom);
  const before = pxPerDeg(cam.zoom, vp);
  const after = pxPerDeg(z, vp);
  const lon = cam.lon + (x - vp.w / 2) / before; // unwrapped on purpose
  const lat = cam.lat - (y - vp.h / 2) / before;
  return clampCamera({ lon: lon - (x - vp.w / 2) / after, lat: lat + (y - vp.h / 2) / after, zoom: z }, vp);
}

/**
 * Where to draw the map image copies: left edges (px) of every copy needed to
 * cover the viewport, plus the shared top edge and the copy size.
 */
export function mapTiles(cam: Camera, vp: Viewport) {
  const { w: W, h: H } = worldSize(cam.zoom, vp);
  const ppd = pxPerDeg(cam.zoom, vp);
  let x0 = vp.w / 2 - (cam.lon + 180) * ppd;
  x0 = (((x0 % W) + W) % W) - W; // wrap into [-W, 0)
  const lefts: number[] = [];
  for (let x = x0; x < vp.w; x += W) lefts.push(x);
  while (lefts.length < 3) lefts.push(lefts[lefts.length - 1] + W); // always ≥ 3 copies
  return { lefts, top: vp.h / 2 - (90 - cam.lat) * ppd, W, H };
}

/** Interpolate cameras; longitude goes the short way, zoom geometrically (feels linear). */
export function lerpCamera(a: Camera, b: Camera, s: number): Camera {
  return {
    lon: normLon(a.lon + shortestDLon(a.lon, b.lon) * s),
    lat: a.lat + (b.lat - a.lat) * s,
    zoom: a.zoom * (b.zoom / a.zoom) ** s,
  };
}

export const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;
