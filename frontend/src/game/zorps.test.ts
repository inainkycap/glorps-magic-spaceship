import { describe, expect, it } from "vitest";
import type { Place, Species } from "../types";
import { wavesOf } from "./encyclopedia";
import { PRESENT_YEAR } from "./time";
import {
  advancePayout,
  capacityUpgradeCost,
  discoveryRewardsFor,
  DNA_RETRY_COST,
  domeCost,
  eraMultiplier,
  FREE_DOMES,
  MAX_DOMES,
  startZorps,
  travelCost,
  travelCostExact,
} from "./zorps";

const mocks = import.meta.glob("../mocks/species/*.json", { eager: true, import: "default" });
const SPECIES = Object.values(mocks) as Species[];
const byId = (id: string) => SPECIES.find((s) => s.id === id)!;
const at = (era_year: number, lat = 0, lon = 0): Place => ({ lat, lon, era_year });
const placeOf = (s: Species): Place => ({ lat: s.lat, lon: s.lon, era_year: s.era_year });
const HOME = at(PRESENT_YEAR, 51.5, -0.1);
const DEEP = PRESENT_YEAR - 66_000_000; // ~66 million years ago

describe("travel cost (deep-time safe)", () => {
  it("(a) older trips cost more for the same jump", () => {
    expect(travelCostExact(at(1610), at(1600))).toBeGreaterThan(travelCostExact(at(2020), at(2010)));
    // visible after rounding for a century jump
    expect(travelCost(at(1700), at(1600))).toBeGreaterThan(travelCost(at(2026), at(1926)));
  });

  it("(b) 66 million years ago costs a lot but stays affordable: 3–6× a trip to 1600", () => {
    const to1600 = travelCost(HOME, at(1600));
    const deep = travelCost(HOME, at(DEEP));
    expect(deep / to1600).toBeGreaterThanOrEqual(3);
    expect(deep / to1600).toBeLessThanOrEqual(6);
  });

  it("(c) handles BCE / years ago: further back always costs at least as much", () => {
    const years = [2026, 1987, 1600, 900, 1, -1, -50, -2000, -10_000, DEEP];
    for (let i = 1; i < years.length; i++) {
      expect(travelCostExact(HOME, at(years[i]))).toBeGreaterThanOrEqual(travelCostExact(HOME, at(years[i - 1])));
    }
    // 1 CE ↔ 1 BCE is a one-year hop, not two
    expect(travelCostExact(at(1), at(-1))).toBeCloseTo(travelCostExact(at(2), at(1)), 0);
  });

  it("is symmetric, never negative and never NaN", () => {
    const years = [2026, 2000, 1900, 1600, 1, -1, -2000, -50_000, DEEP];
    for (const a of years)
      for (const b of years) {
        const ab = travelCost(at(a), at(b, 1, 1));
        expect(Number.isFinite(ab)).toBe(true);
        expect(ab).toBeGreaterThanOrEqual(0);
        expect(ab).toBe(travelCost(at(b, 1, 1), at(a)));
      }
    expect(travelCost(at(1600, 3, 4), at(1600, 3, 4))).toBe(0); // staying put is free
  });
});

describe("payout and prices", () => {
  it("capacity upgrades cost more each time: 10, 15, 20 …", () => {
    expect([60, 80, 100, 180].map((c) => capacityUpgradeCost(c))).toEqual([10, 15, 20, 40]);
  });
  it("uses the backend's era multiplier when given, its formula otherwise", () => {
    const eco = { species: [{ species_id: "dodo", era_multiplier: 9 }] } as never;
    expect(eraMultiplier("dodo", 1600, eco)).toBe(9);
    expect(eraMultiplier("dodo", 1600)).toBeCloseTo(3.52, 2); // matches backend/app/economy.py
    expect(eraMultiplier("x", PRESENT_YEAR)).toBe(1);
  });

  it("pays only thriving species (≥ 2 alive)", () => {
    const p = advancePayout({ dodo: 10, passenger_pigeon: 1 }, (id) => byId(id)?.era_year);
    expect(p.perSpecies.map((x) => x.speciesId)).toEqual(["dodo"]);
    expect(p.total).toBe(Math.round(0.5 * 10 * 3.52));
  });
});

describe("early-game Zorps budget", () => {
  const route = (...stops: Place[]) => stops.slice(1).reduce((s, to, i) => s + travelCost(stops[i], to), 0);
  // Wave 1 as the game unlocks it (game/encyclopedia.ts), visited newest era first.
  const WAVES = wavesOf(SPECIES);
  const WAVE1 = SPECIES.filter((s) => WAVES[s.id] === 1).sort((a, b) => b.era_year - a.era_year);
  const REST = SPECIES.filter((s) => !WAVE1.includes(s)).sort((a, b) => b.era_year - a.era_year);

  /** Play wave 1 in order: travel, then earn its discoveries. Fails if a trip is unaffordable. */
  function playWave1(retries: number) {
    let balance = startZorps();
    let here = HOME;
    for (const s of WAVE1) {
      const cost = travelCost(here, placeOf(s));
      expect(balance, `can afford the trip to ${s.id}`).toBeGreaterThanOrEqual(cost);
      balance -= cost;
      here = placeOf(s);
      balance += discoveryRewardsFor(s) - retries * DNA_RETRY_COST;
    }
    return { balance, here };
  }

  it("from a fresh start: rescue the first 3 species and build 2 domes (with a DNA retry each)", () => {
    const { balance } = playWave1(1);
    expect(balance).toBeGreaterThanOrEqual(2 * domeCost());
  });

  it("…or 3 domes without retries", () => {
    const { balance } = playWave1(0);
    expect(balance).toBeGreaterThanOrEqual(3 * domeCost());
    expect(FREE_DOMES + 3).toBeLessThanOrEqual(MAX_DOMES);
  });

  it("later waves need advancing time: discoveries alone can't pay for the rest", () => {
    const { balance, here } = playWave1(0);
    const afterDomes = balance - 2 * domeCost();
    const restTravel = route(here, ...REST.map(placeOf));
    const restRewards = REST.reduce((s, sp) => s + discoveryRewardsFor(sp), 0);
    expect(afterDomes + restRewards).toBeLessThan(restTravel);
    // and the deepest species is out of reach right after wave 1
    const mammoth = byId("woolly_mammoth");
    expect(afterDomes).toBeLessThan(travelCost(here, placeOf(mammoth)));
  });
});
