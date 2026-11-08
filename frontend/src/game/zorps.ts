// Zorps: Glorp's alien currency. Uncapped. The one place for its rules.
// Documented in CLAUDE.md "Game rules" (keep in sync).
//
// Where each number comes from:
//   BACKEND (source of truth when reachable, via GET /api/economy):
//     start balance, dome (habitat) cost, Zorps per surviving animal, era multipliers.
//     Payout on "Advance 10 years": the advance response's `zorps_earned` if present.
//   FRONTEND (the backend has nothing for these):
//     travel cost (the backend's /api/travel-cost formula makes recent decades cost MORE
//     than older ones, which breaks the travel rule below; proposed back to the backend),
//     DNA Lab retry cost, and encyclopedia discovery rewards.
//   FALLBACK_ECONOMY below mirrors backend/data/economy.json for when the API is down.

import { samePlace } from "../geo";
import type { Economy, Place } from "../types";
import { PRESENT_YEAR, yearsAgo } from "./time";

/** Copy of backend/data/economy.json + its era multiplier formula, used only offline. */
export const FALLBACK_ECONOMY = {
  start_zorps: 100,
  habitat_cost: 25,
  zorps_per_survivor: 0.5,
  era_multiplier_per_decade_of_age: 1.535,
} as const;

/** Sanctuary dome sites (and the max number of domes). The first dome is free. */
export const MAX_DOMES = 6;
export const FREE_DOMES = 1;

/** Replaying the DNA Lab for a species (the first attempt is free). Frontend-only. */
export const DNA_RETRY_COST = 5;

/**
 * "Upgrade capacity (+20)" on a dome (frontend-only). Each upgrade of the same dome
 * costs more: 10, 15, 20, … Zorps (capacity 60 → 80 → 100 → …).
 */
export const CAPACITY_UPGRADE_BASE = 10;
export const CAPACITY_UPGRADE_STEP_COST = 5;
export function capacityUpgradeCost(capacity: number, defaultCapacity = 60, step = 20): number {
  const done = Math.max(0, Math.round((capacity - defaultCapacity) / step));
  return CAPACITY_UPGRADE_BASE + CAPACITY_UPGRADE_STEP_COST * done;
}

/**
 * Encyclopedia checklist items (frontend-only; the backend has no reward values yet).
 * Each is paid once (per species, hotspot or need) with a "+N Zorps" popup.
 */
export const REWARDS = {
  /** Finding its signal on the map (opening its pin for the first time). */
  foundOnMap: 1,
  /** Travelling to its world for the first time. */
  visited: 1,
  /** Scanning a hotspot for the first time (a new fact). */
  newFact: 1,
  /** Each need discovered. */
  newNeed: 1,
  /** Collecting the species' full set of DNA fragments. */
  dnaComplete: 2,
  /** The species' first DNA Lab rescue. */
  rescue: 5,
  /** Thriving in a dome after an "Advance 10 years", the first time. */
  thriving: 5,
} as const;

// --- Travel ------------------------------------------------------------------------
// cost = TRAVEL_BASE + TRAVEL_K × |depth(older) − depth(newer)|,  depth in "time-depth" units:
//
//   depth(t) = t² / (2·KNEE)                      for t ≤ KNEE years ago
//            = KNEE · (ln(t / KNEE) + ½)          beyond
//
// i.e. the cost of each year crossed grows with how long ago it is for the last
// ~KNEE years (so 1610→1600 costs more than 2020→2010), then each year gets
// cheaper in proportion (log time), so every factor of 10 further back costs the
// same. That's what keeps 66 million years ago affordable: ≈ 5× a trip to 1600.
// depth is continuous and smooth at the knee; costs are symmetric and never negative.

export const TRAVEL_BASE = 28;
export const TRAVEL_K = 0.03;
export const TRAVEL_KNEE = 400; // years ago

export function timeDepth(yearsBack: number): number {
  const t = Math.max(0, yearsBack);
  return t <= TRAVEL_KNEE ? (t * t) / (2 * TRAVEL_KNEE) : TRAVEL_KNEE * (Math.log(t / TRAVEL_KNEE) + 0.5);
}

/** Exact (unrounded) Zorps for a trip. Staying put (same place and era) is free. */
export function travelCostExact(from: Place, to: Place): number {
  if (samePlace(from, to)) return 0;
  return TRAVEL_BASE + TRAVEL_K * Math.abs(timeDepth(yearsAgo(from.era_year)) - timeDepth(yearsAgo(to.era_year)));
}

/** Zorps charged for a trip: the exact cost rounded up to a whole Zorp. */
export function travelCost(from: Place, to: Place): number {
  return Math.max(0, Math.ceil(travelCostExact(from, to) - 1e-9));
}

// --- Prices and payouts (backend first, fallback second) ------------------------------

export const startZorps = (eco?: Economy | null) => eco?.start_zorps ?? FALLBACK_ECONOMY.start_zorps;
export const domeCost = (eco?: Economy | null) => eco?.habitat_cost ?? FALLBACK_ECONOMY.habitat_cost;

/** Era multiplier: the backend's per-species value, else the backend's formula. */
export function eraMultiplier(speciesId: string, eraYear: number, eco?: Economy | null): number {
  const fromApi = eco?.species.find((s) => s.species_id === speciesId)?.era_multiplier;
  if (fromApi !== undefined) return fromApi;
  const k = eco?.era_multiplier_per_decade_of_age ?? FALLBACK_ECONOMY.era_multiplier_per_decade_of_age;
  const age = (y: number) => Math.log10(yearsAgo(y) + 10);
  return Math.round((1 + k * (age(eraYear) - age(PRESENT_YEAR))) * 100) / 100;
}

/**
 * Payout after "Advance 10 years", when the backend doesn't send `zorps_earned`:
 * each THRIVING species (still alive, ≥ 2 animals, at the end) pays
 * zorps_per_survivor × animals alive × its era multiplier (the backend's rule).
 */
export function advancePayout(
  aliveBySpecies: Record<string, number>,
  eraYearOf: (speciesId: string) => number | undefined,
  eco?: Economy | null,
): { total: number; perSpecies: { speciesId: string; zorps: number }[] } {
  const perSurvivor = eco?.zorps_per_survivor ?? FALLBACK_ECONOMY.zorps_per_survivor;
  const perSpecies = Object.entries(aliveBySpecies)
    .filter(([, n]) => n >= 2)
    .map(([speciesId, n]) => {
      const era = eraYearOf(speciesId) ?? PRESENT_YEAR;
      return { speciesId, zorps: Math.round(perSurvivor * n * eraMultiplier(speciesId, era, eco)) };
    })
    .filter((p) => p.zorps > 0);
  return { total: perSpecies.reduce((s, p) => s + p.zorps, 0), perSpecies };
}

export function canAfford(balance: number, cost: number): boolean {
  return balance >= cost;
}

/** Zorps a species' encyclopedia pays out WITHOUT advancing time (found, visited, facts, needs, DNA, rescue; not thriving). */
export function discoveryRewardsFor(species: { hotspots: unknown[]; needs?: object }): number {
  const needs = Object.keys(species.needs ?? {}).length;
  return (
    REWARDS.foundOnMap +
    REWARDS.visited +
    species.hotspots.length * REWARDS.newFact +
    needs * REWARDS.newNeed +
    REWARDS.dnaComplete +
    REWARDS.rescue
  );
}
