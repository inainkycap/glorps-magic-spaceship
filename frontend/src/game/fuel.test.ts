import { describe, expect, it } from "vitest";
import {
  DOME_SITES,
  FREE_DOMES,
  FUEL_COSTS,
  FUEL_START,
  PRESENT_YEAR,
  TRAVEL_BASE_COST,
  TRAVEL_TIME_COST_K,
  thicknessIntegral,
  timeThickness,
  travelCost,
  travelCostExact,
} from "./fuel";
import dodo from "../mocks/dodo.json";
import pigeon from "../mocks/passenger_pigeon.json";
import { discoveryMessage, formatNeed, knownMessage, NEED_KEYS, needKeysOf, revealsOf } from "./needs";
import { describeJump, formatJumpShort } from "./timeJump";
import type { NeedKey, Place, Species } from "../types";

const at = (era_year: number, lat = 0, lon = 0): Place => ({ lat, lon, era_year });

/** Brute-force numeric integral, to check the closed form against. */
function riemann(a: number, b: number, steps = 100_000) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const h = (hi - lo) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) sum += timeThickness(lo + (i + 0.5) * h) * h;
  return sum;
}

describe("travel cost", () => {
  it("a decade further back costs more: 1610→1600 > 2020→2010", () => {
    expect(travelCostExact(at(1610), at(1600))).toBeGreaterThan(travelCostExact(at(2020), at(2010)));
    expect(travelCost(at(1610), at(1600))).toBeGreaterThan(travelCost(at(2020), at(2010)));
  });

  it("is symmetric: A→B costs the same as B→A", () => {
    const pairs: [Place, Place][] = [
      [at(1600, -20.3, 57.5), at(1870, 44.5, -84.7)],
      [at(2026, 51.5, -0.1), at(1600, -20.3, 57.5)],
      [at(-500), at(1999)],
    ];
    for (const [a, b] of pairs) {
      expect(travelCostExact(a, b)).toBeCloseTo(travelCostExact(b, a), 12);
      expect(travelCost(a, b)).toBe(travelCost(b, a));
    }
  });

  it("matches a numeric integral of thickness", () => {
    for (const [a, b] of [[1600, 1870], [2026, 1600], [1000, 1001], [-3000, 2026]]) {
      expect(thicknessIntegral(a, b)).toBeCloseTo(riemann(a, b), 6);
    }
  });

  it("thickness is 1 at the present and grows going back", () => {
    expect(timeThickness(PRESENT_YEAR)).toBe(1);
    expect(timeThickness(1926)).toBe(2);
  });

  it("same place and era is free; same era elsewhere is the base cost", () => {
    expect(travelCost(at(1600, 1, 2), at(1600, 1, 2))).toBe(0);
    expect(travelCostExact(at(1600, 1, 2), at(1600, 3, 4))).toBe(TRAVEL_BASE_COST);
  });

  it("charges whole units, rounded up", () => {
    // 2026 → 1600: 426 years × thickness(1813) = 426 × 3.13
    const exact = TRAVEL_BASE_COST + TRAVEL_TIME_COST_K * 426 * 3.13;
    expect(travelCostExact(at(2026), at(1600))).toBeCloseTo(exact, 9);
    expect(travelCost(at(2026), at(1600))).toBe(Math.ceil(exact));
  });
});

describe("fuel budget (see 'Budget target' in fuel.ts)", () => {
  const home = { lat: 51.5, lon: -0.1, era_year: PRESENT_YEAR };
  const placeOf = (s: { lat: number; lon: number; era_year: number }) => ({ lat: s.lat, lon: s.lon, era_year: s.era_year });
  const DODO = placeOf(dodo);
  const PIGEON = placeOf(pigeon);
  const THIRD = { lat: 0, lon: 0, era_year: 1750 }; // a hypothetical third species
  const route = (...stops: Place[]) => stops.slice(1).reduce((s, to, i) => s + travelCost(stops[i], to), 0);
  const retries = (species: number) => species * FUEL_COSTS.dnaRetry; // one retry each
  const domes = (n: number) => n * FUEL_COSTS.buildDome;

  // The cheaper of the two orders for the current species.
  const twoSpecies = Math.min(route(home, PIGEON, DODO), route(home, DODO, PIGEON));
  const threeSpecies = Math.min(route(home, PIGEON, DODO, THIRD), route(home, PIGEON, THIRD, DODO));

  it("affords 2 species + 2 extra domes", () => {
    expect(twoSpecies + domes(2) + retries(2)).toBeLessThanOrEqual(FUEL_START);
  });

  it("affords 3 species + 1 extra dome", () => {
    expect(threeSpecies + domes(1) + retries(3)).toBeLessThanOrEqual(FUEL_START);
  });

  it("does not afford everything", () => {
    expect(threeSpecies + domes(2) + retries(3)).toBeGreaterThan(FUEL_START);
    expect(twoSpecies + domes(DOME_SITES - FREE_DOMES) + retries(2)).toBeGreaterThan(FUEL_START);
  });

  it("route order matters: re-crossing thick time costs about a dome", () => {
    const worse = route(home, DODO, PIGEON);
    expect(worse).toBeGreaterThan(twoSpecies);
    expect(worse + retries(2)).toBeLessThanOrEqual(FUEL_START); // both species still reachable
    expect(worse + domes(1) + retries(2)).toBeGreaterThan(FUEL_START);
  });
});

describe("need reveals", () => {
  it("normalises one key, several keys, unknown keys and absence", () => {
    expect(revealsOf({ reveals: "terrain" })).toEqual(["terrain"]);
    expect(revealsOf({ reveals: ["pressure", "oxygen", "oxygen"] })).toEqual(["oxygen", "pressure"]);
    expect(revealsOf({ reveals: ["bogus" as NeedKey] })).toEqual([]);
    expect(revealsOf({})).toEqual([]);
    expect(discoveryMessage(["oxygen", "pressure"])).toBe("New: ideal oxygen and air pressure discovered!");
    expect(discoveryMessage(["terrain", "humidity", "pressure"])).toBe(
      "New: ideal terrain, humidity and air pressure discovered!",
    );
    expect(knownMessage(["oxygen", "pressure"])).toBe("Ideal oxygen and air pressure: in your field guide");
  });

  it.each([
    ["dodo", dodo],
    ["passenger_pigeon", pigeon],
  ])("every need of %s is revealed by some hotspot", (_, json) => {
    const s = json as unknown as Species;
    const revealable = new Set(s.hotspots.flatMap((h) => revealsOf(h)));
    const needs = needKeysOf(s.needs);
    expect(needs).toEqual(NEED_KEYS); // all five needs have content
    for (const k of needs) expect(revealable.has(k), `${k} is revealable`).toBe(true);
  });
});

describe("need formatting", () => {
  it("formats ranges, one-sided bounds, terrain and empty needs", () => {
    expect(formatNeed({ min: "~18", max: "~30", unit: "°C" })).toBe("~18 to ~30 °C");
    expect(formatNeed({ min: 95, max: 102, unit: "kPa" })).toBe("95 to 102 kPa");
    expect(formatNeed({ min: 5, unit: "%" })).toBe("at least 5 %");
    expect(formatNeed({ max: "?", unit: "%" })).toBe("up to ? %");
    expect(formatNeed({ value: "Forest floor" })).toBe("Forest floor");
    expect(formatNeed({ why: "only a reason" })).toBeNull();
    expect(discoveryMessage("pressure")).toBe("New: ideal air pressure discovered!");
  });
});

describe("time jump wording", () => {
  it("labels direction and size", () => {
    expect(formatJumpShort(1600, 1870)).toBe("+270 yrs");
    expect(formatJumpShort(1870, 1600)).toBe("−270 yrs");
    expect(formatJumpShort(1600, 1601)).toBe("+1 yr");
    expect(describeJump(1600, 1870)).toBe("1600 → 1870 · 270 years into the future");
    expect(describeJump(2026, 1600)).toBe("2026 → 1600 · 426 years into the past");
  });
});
