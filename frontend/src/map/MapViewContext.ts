import { createContext, useContext } from "react";
import type { Camera, Viewport } from "./camera";

/**
 * What <WorldMap> shares with things drawn on top of it (pins, Glorp, the
 * travel animation). Overlays are positioned in screen pixels, so they stay a
 * constant on-screen size at every zoom.
 */
export interface MapView {
  camera: Camera;
  viewport: Viewport;
  /** Move the camera (clamped). Accepts an updater like setState. */
  setCamera: (next: Camera | ((c: Camera) => Camera)) => void;
  /** Screen position of (lon, lat) on the copy of the world nearest the centre. */
  toScreen: (lon: number, lat: number) => { x: number; y: number };
  /** Every on-screen x for a longitude (more than one on very wide screens). */
  screenXs: (lon: number) => number[];
}

export const MapViewContext = createContext<MapView | null>(null);

export function useMapView(): MapView {
  const v = useContext(MapViewContext);
  if (!v) throw new Error("useMapView must be used inside <WorldMap>");
  return v;
}
