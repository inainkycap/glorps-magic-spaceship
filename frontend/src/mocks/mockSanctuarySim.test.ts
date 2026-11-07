import { describe, expect, it } from "vitest";
import type { DomeConditions, SanctuarySimRequest, Species } from "../types";
import dodo from "./dodo.json";
import pigeon from "./passenger_pigeon.json";
import { mockSanctuarySimulate } from "./mockSanctuarySim";

const species = [dodo, pigeon] as unknown as Species[];

/** Conditions that suit both mock species (forest, warm, humid, sea-level air). */
const GOOD: DomeConditions = { terrain: "forest", temperature: 24, humidity: 75, oxygen: 21, pressure: 101 };

const concentrated: SanctuarySimRequest = {
  domes: [{ id: "a", ...GOOD, residents: [{ species_id: "dodo", count: 10 }, { species_id: "passenger_pigeon", count: 10 }] }],
  years: 50,
  runs: 1000,
};
const split: SanctuarySimRequest = {
  domes: [
    { id: "a", ...GOOD, residents: [{ species_id: "dodo", count: 5 }, { species_id: "passenger_pigeon", count: 5 }] },
    { id: "b", ...GOOD, residents: [{ species_id: "dodo", count: 5 }, { species_id: "passenger_pigeon", count: 5 }] },
  ],
  years: 50,
  runs: 1000,
};

describe("mock sanctuary sim (MOCK ONLY)", () => {
  it("splitting the same individuals across domes beats concentrating them on worst_case_species_saved", () => {
    // Several seeds, so this isn't a lucky draw.
    for (const seed of [1, 2, 3, 42, 2026]) {
      const one = mockSanctuarySimulate(concentrated, species, seed);
      const two = mockSanctuarySimulate(split, species, seed);
      expect(two.worst_case_species_saved, `seed ${seed}`).toBeGreaterThan(one.worst_case_species_saved);
    }
  });

  it("returns the proposed response shape", () => {
    const r = mockSanctuarySimulate(split, species, 7);
    expect(r.years).toHaveLength(51);
    for (const band of Object.values(r.species_alive)) expect(band).toHaveLength(51);
    expect(r.sample_paths).toHaveLength(25);
    expect(r.per_species.map((s) => s.species_id).sort()).toEqual(["dodo", "passenger_pigeon"]);
    expect(r.per_dome.map((d) => d.id)).toEqual(["a", "b"]);
    for (const d of r.per_dome) expect(d.disaster_rate).toBeGreaterThanOrEqual(0);
    expect(r.species_alive.p5[0]).toBe(2); // both alive at the start
    expect(r.worst_case_species_saved).toBeLessThanOrEqual(r.expected_species_saved);
  });

  it("a poorly fitting dome loses species that a good dome keeps", () => {
    const harsh = { ...concentrated, domes: [{ ...concentrated.domes[0], terrain: "tundra" as const, temperature: -25, humidity: 10 }] };
    const good = mockSanctuarySimulate(concentrated, species, 9);
    const bad = mockSanctuarySimulate(harsh, species, 9);
    expect(bad.expected_species_saved).toBeLessThan(good.expected_species_saved - 1);
  });

  it("is reproducible for a given seed", () => {
    expect(mockSanctuarySimulate(split, species, 5)).toEqual(mockSanctuarySimulate(split, species, 5));
  });
});
