// Fuel rules: the single place they live. Every screen reads costs and limits
// from here; the current amount is persisted in Progress.fuel (see useProgress).
// The rules are documented under "Game rules" in CLAUDE.md; keep them in sync.
//
// PLACEHOLDERS: the numbers below are tuning values until fuel is added to the
// backend contract. When it is, read them from the API and keep these as
// fallbacks, or delete them; nothing else should hard-code a cost.

import { samePlace } from "../geo";
import type { Place } from "../types";

/** Fuel a new player starts with (and the tank size). */
export const FUEL_START = 100;
export const FUEL_MAX = 100;
/** At or below this the gauge shows a warning colour. */
export const FUEL_LOW = 25;

// --- Budget target (checked by fuel.test.ts) -------------------------------------
// Starting from 100 fuel, with the 2 current species (dodo 1600, passenger
// pigeon 1870), visiting newest era first (the cheapest route) and allowing
// one DNA retry per species:
//   ✓ 2 species + 2 extra domes          (94)
//   ✓ 3 species + 1 extra dome           (88; 3rd = a hypothetical ~1750 species)
//   ✗ 3 species + 2 extra domes          (106)
//   ✗ 2 species + all 5 extra domes      (148)
// i.e. the player has to choose between more species and more domes. Route
// order matters: jumping to 1600 first and back to 1870 re-crosses thick time
// (77 instead of 50 for the two trips), which costs about a dome.

// --- Travel ------------------------------------------------------------------
// cost = TRAVEL_BASE_COST + TRAVEL_TIME_COST_K × ∫ thickness(year) d(year)
// over the years crossed, where time gets "thicker" the further back it is:
//   thickness(year) = 1 + (PRESENT_YEAR − year) / 100
// so a decade in 1600 costs more fuel than a decade in 2010.

/** Flat cost of any trip (even one that stays in the same era). */
export const TRAVEL_BASE_COST = 8;
/** Fuel per unit of integrated time thickness. */
export const TRAVEL_TIME_COST_K = 0.025;
/** "Now" for the thickness curve: thickness is 1 here and grows going back. */
export const PRESENT_YEAR = 2026;

/** How hard a single year is to travel through. */
export function timeThickness(year: number): number {
  return 1 + (PRESENT_YEAR - year) / 100;
}

/**
 * ∫ thickness(y) dy over the years between a and b (in either order), in
 * closed form. thickness is linear, so the integral is the span times the
 * thickness at the midpoint. Symmetric: thicknessIntegral(a, b) === thicknessIntegral(b, a).
 */
export function thicknessIntegral(a: number, b: number): number {
  const span = Math.abs(b - a);
  return span * timeThickness((a + b) / 2);
}

/** Exact (unrounded) fuel for a trip. Same place and era: free. */
export function travelCostExact(from: Place, to: Place): number {
  if (samePlace(from, to)) return 0;
  return TRAVEL_BASE_COST + TRAVEL_TIME_COST_K * thicknessIntegral(from.era_year, to.era_year);
}

/** Fuel charged for a trip: the exact cost rounded up to a whole unit. */
export function travelCost(from: Place, to: Place): number {
  // -1e-9 tolerates float noise on whole numbers; max(0, …) turns ceil's -0 into 0.
  return Math.max(0, Math.ceil(travelCostExact(from, to) - 1e-9));
}

// --- Other costs ---------------------------------------------------------------

export const FUEL_COSTS = {
  /** Replaying the DNA Lab minigame for a species (the first attempt is free). */
  dnaRetry: 4,
  /** Building one more sanctuary dome on Glorp's planet (the first is free). */
  buildDome: 18,
} as const;

/** Dome sites on Glorp's planet, and how many come built. */
export const DOME_SITES = 6;
export const FREE_DOMES = 1;

// --- Helpers -------------------------------------------------------------------

export function canAfford(fuel: number, cost: number): boolean {
  return fuel >= cost;
}

/** Keep any stored or computed amount inside the tank. */
export function clampFuel(fuel: number): number {
  return Math.max(0, Math.min(FUEL_MAX, Math.round(fuel)));
}

export function isLowFuel(fuel: number): boolean {
  return fuel <= FUEL_LOW;
}
