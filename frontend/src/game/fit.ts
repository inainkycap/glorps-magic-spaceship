// How well a dome's conditions suit a species, from its `needs`.
// Used by the dome UI (fit bars) and the client-side MOCK sim. The real sim
// will compute fit on the backend; this is the frontend's proposal for it
// (documented in "Proposed: sanctuary sim" in CLAUDE.md).

import type { DomeConditions, Need, NeedBound, NeedKey, Species } from "../types";

/** Parse a need bound: 18, "~18" → 18, "~-5" → -5, "?" / "" → undefined. */
export function parseBound(b: NeedBound | undefined): number | undefined {
  if (b === undefined) return undefined;
  if (typeof b === "number") return Number.isFinite(b) ? b : undefined;
  const n = Number.parseFloat(b.replace(/^~/, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

/**
 * How far outside the ideal range still counts as "survivable": fit falls off
 * as a bell curve with this width (in the need's unit).
 */
export const FIT_TOLERANCE: Record<Exclude<NeedKey, "terrain">, number> = {
  temperature: 6, // °C
  humidity: 15, // %
  oxygen: 2, // %
  pressure: 10, // kPa
};

/** Fit for a terrain the species doesn't list (it can cope, but poorly). */
export const WRONG_TERRAIN_FIT = 0.4;

export type FitVerdict = "good" | "close" | "poor";

export interface NeedFit {
  key: NeedKey;
  fit: number; // 0..1
  verdict: FitVerdict;
}

const verdictOf = (fit: number): FitVerdict => (fit >= 0.95 ? "good" : fit >= 0.6 ? "close" : "poor");

/** Fit of one numeric need: 1 inside [min, max], bell-curve falloff outside. Undefined if no bounds. */
function rangeFit(value: number, need: Need, tolerance: number): number | undefined {
  const min = parseBound(need.min);
  const max = parseBound(need.max);
  if (min === undefined && max === undefined) return undefined;
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  const d = value < lo ? lo - value : value > hi ? value - hi : 0;
  return Math.exp(-((d / tolerance) ** 2));
}

/** Per-need fits for whatever needs the species has data for. */
export function needFits(species: Pick<Species, "needs">, dome: DomeConditions): NeedFit[] {
  const needs = species.needs ?? {};
  const out: NeedFit[] = [];
  const terrain = needs.terrain;
  if (terrain?.types && terrain.types.length > 0) {
    const fit = terrain.types.includes(dome.terrain) ? 1 : WRONG_TERRAIN_FIT;
    out.push({ key: "terrain", fit, verdict: verdictOf(fit) });
  }
  for (const key of ["temperature", "humidity", "oxygen", "pressure"] as const) {
    const need = needs[key];
    if (!need) continue;
    const fit = rangeFit(dome[key], need, FIT_TOLERANCE[key]);
    if (fit !== undefined) out.push({ key, fit, verdict: verdictOf(fit) });
  }
  return out;
}

/**
 * Overall fit, 0..1: the geometric mean of the per-need fits, so one bad need
 * drags it down hard. A species with no need data scores a neutral 0.5.
 */
export function overallFit(species: Pick<Species, "needs">, dome: DomeConditions): number {
  const fits = needFits(species, dome);
  if (fits.length === 0) return 0.5;
  const logSum = fits.reduce((s, f) => s + Math.log(Math.max(f.fit, 1e-6)), 0);
  return Math.exp(logSum / fits.length);
}
