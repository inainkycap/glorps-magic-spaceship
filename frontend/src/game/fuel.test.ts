import { describe, expect, it } from "vitest";
import {
  PRESENT_YEAR,
  TRAVEL_BASE_COST,
  TRAVEL_TIME_COST_K,
  thicknessIntegral,
  timeThickness,
  travelCost,
  travelCostExact,
} from "./fuel";
import { describeJump, formatJumpShort } from "./timeJump";
import type { Place } from "../types";

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

describe("time jump wording", () => {
  it("labels direction and size", () => {
    expect(formatJumpShort(1600, 1870)).toBe("+270 yrs");
    expect(formatJumpShort(1870, 1600)).toBe("−270 yrs");
    expect(formatJumpShort(1600, 1601)).toBe("+1 yr");
    expect(describeJump(1600, 1870)).toBe("1600 → 1870 · 270 years into the future");
    expect(describeJump(2026, 1600)).toBe("2026 → 1600 · 426 years into the past");
  });
});
