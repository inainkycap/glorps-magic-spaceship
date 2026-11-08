import { formatEra, PRESENT_YEAR } from "./game/time";
import type { Place } from "./types";

/** Where Glorp starts before the first trip: London, today. */
export const HOME: Place = { lat: 51.5, lon: -0.1, era_year: PRESENT_YEAR };

export function isPlace(x: unknown): x is Place {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return [p.lat, p.lon, p.era_year].every((v) => typeof v === "number" && Number.isFinite(v));
}

/** The one era label used everywhere ("today", "1600", "1,000 BC", "66 million yrs ago"). */
export const formatYear = formatEra;

export function samePlace(a: Place, b: Place): boolean {
  return a.lat === b.lat && a.lon === b.lon && a.era_year === b.era_year;
}
