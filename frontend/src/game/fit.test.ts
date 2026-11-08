import { describe, expect, it } from "vitest";
import dodo from "../mocks/species/dodo.json";
import type { DomeConditions, Species } from "../types";
import { knownFit, overallFit, parseBound } from "./fit";

const species = dodo as unknown as Species;
const GOOD: DomeConditions = { terrain: "forest", temperature: 24, humidity: 75, oxygen: 21, pressure: 101 };

describe("fit", () => {
  it("parses uncertain bounds", () => {
    expect(parseBound("~18")).toBe(18);
    expect(parseBound("~-5")).toBe(-5);
    expect(parseBound("?")).toBeUndefined();
    expect(parseBound(95)).toBe(95);
  });

  it("player-facing fit ignores undiscovered needs; the sim's fit doesn't", () => {
    const thinAir = { ...GOOD, oxygen: 12, pressure: 60 }; // terrible for undiscovered oxygen/pressure
    const discovered = ["terrain", "temperature", "humidity"] as const;
    const shown = knownFit(species, thinAir, discovered);
    expect(shown.fit).toBeCloseTo(1, 5); // no hint from the bad undiscovered needs
    expect(shown.segments.map((s) => (s.fit === null ? "?" : "#")).join("")).toBe("###??");
    expect(overallFit(species, thinAir)).toBeLessThan(0.1); // the sim still feels it
  });

  it("is null when nothing is discovered, and reflects discovered mismatches", () => {
    expect(knownFit(species, GOOD, []).fit).toBeNull();
    const cold = { ...GOOD, temperature: 0 };
    expect(knownFit(species, cold, ["temperature"]).fit!).toBeLessThan(0.1);
    expect(knownFit(species, cold, ["terrain"]).fit).toBeCloseTo(1, 5);
  });
});
