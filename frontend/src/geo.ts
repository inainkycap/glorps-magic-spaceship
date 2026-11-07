import type { Place } from "./types";

/** Where Glorp starts before the first trip: London, today. */
export const HOME: Place = { lat: 51.5, lon: -0.1, era_year: 2026 };

/** Equirectangular projection to % of the map box (0–100 on both axes). */
export function project(lat: number, lon: number): { x: number; y: number } {
  return { x: ((lon + 180) / 360) * 100, y: ((90 - lat) / 180) * 100 };
}

export function isPlace(x: unknown): x is Place {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return [p.lat, p.lon, p.era_year].every((v) => typeof v === "number" && Number.isFinite(v));
}

export function formatYear(year: number): string {
  return year < 0 ? `${-year} BCE` : String(year);
}

export function samePlace(a: Place, b: Place): boolean {
  return a.lat === b.lat && a.lon === b.lon && a.era_year === b.era_year;
}
