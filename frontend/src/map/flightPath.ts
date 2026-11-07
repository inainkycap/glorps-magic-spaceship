import { shortestDLon } from "./camera";

/**
 * Glorp's flight look, shared by the long time-travel trip (TravelAnimation)
 * and the short hop when you click empty map (GlorpMarker): an eased path the
 * short way round the globe, a hop, a wobble with tilt, and a fading
 * "zib zib zib" trail. Only the numbers differ, via FlightStyle.
 */
export interface FlightStyle {
  /** Peak hop height, screen px. */
  lift: number;
  /** Wobble amplitude, screen px, and wobbles per flight. */
  wobble: number;
  wobbleCycles: number;
  /** Max tilt, degrees. */
  tilt: number;
  /** A "zib" every this fraction of the distance; each fades over `zibLife` of the flight time. */
  zibEvery: number;
  zibLife: number;
}

export const TRAVEL_FLIGHT: FlightStyle = { lift: 56, wobble: 8, wobbleCycles: 5, tilt: 12, zibEvery: 0.1, zibLife: 0.28 };
export const HOP_FLIGHT: FlightStyle = { lift: 22, wobble: 5, wobbleCycles: 2.5, tilt: 10, zibEvery: 0.22, zibLife: 0.4 };

export type LonLat = { lon: number; lat: number };

/** Where Glorp is (lon/lat) at eased progress f ∈ [0, 1], going the short way round. */
export function flightPoint(from: LonLat, to: LonLat, f: number): LonLat {
  return { lon: from.lon + shortestDLon(from.lon, to.lon) * f, lat: from.lat + (to.lat - from.lat) * f };
}

/** Flight time at which eased progress p is reached (inverse of easeInOut). */
export const timeAtProgress = (p: number) => Math.acos(1 - 2 * p) / Math.PI;
