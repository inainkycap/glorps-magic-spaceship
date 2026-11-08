import { describe, expect, it } from "vitest";
import type { DomeConditions, SanctuarySimRequest, Species } from "../types";
import { mockSanctuaryAdvance, mockSanctuarySimulate, outbreakChance } from "./mockSanctuarySim";
import dodo from "./species/dodo.json";
import pigeon from "./species/passenger_pigeon.json";

const species = [dodo, pigeon] as unknown as Species[];

/** Conditions that suit both species (forest, warm, humid, sea-level air), default capacity. */
const GOOD: DomeConditions & { capacity: number } = { terrain: "forest", temperature: 24, humidity: 75, oxygen: 21, pressure: 101, capacity: 60 };

const concentrated = (years: number, runs: number): SanctuarySimRequest => ({
  domes: [{ id: "a", ...GOOD, residents: [{ species_id: "dodo", count: 10 }, { species_id: "passenger_pigeon", count: 10 }] }],
  years,
  runs,
});
const split = (years: number, runs: number): SanctuarySimRequest => ({
  domes: ["a", "b"].map((id) => ({
    id,
    ...GOOD,
    residents: [{ species_id: "dodo", count: 5 }, { species_id: "passenger_pigeon", count: 5 }],
  })),
  years,
  runs,
});

describe("mock forecast (MOCK ONLY)", () => {
  it("splitting the same animals across domes beats concentrating them on the worst case", () => {
    for (const seed of [1, 2, 3, 42, 2026]) {
      const one = mockSanctuarySimulate(concentrated(50, 1000), species, seed);
      const two = mockSanctuarySimulate(split(50, 1000), species, seed);
      expect(two.worst_case_species_saved, `seed ${seed}`).toBeGreaterThanOrEqual(one.worst_case_species_saved);
      expect(two.expected_species_saved, `seed ${seed}`).toBeGreaterThan(one.expected_species_saved);
    }
  });

  it("returns the response shape, including per-species survival by year", () => {
    const r = mockSanctuarySimulate(split(50, 400), species, 7);
    expect(r.years).toHaveLength(51);
    expect(r.sample_paths).toHaveLength(25);
    for (const s of r.per_species) {
      expect(s.survival_by_year).toHaveLength(51);
      expect(s.survival_by_year![0]).toBe(1); // everyone alive at the start
      expect(s.survival_by_year![50]).toBeCloseTo(s.survival_probability, 10);
      for (let y = 1; y <= 50; y++) expect(s.survival_by_year![y]).toBeLessThanOrEqual(s.survival_by_year![y - 1]);
    }
    expect(r.per_dome.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("a poorly fitting dome loses species that a good dome keeps", () => {
    const harsh = { ...concentrated(50, 400), domes: [{ ...concentrated(50, 400).domes[0], terrain: "tundra" as const, temperature: -25, humidity: 10 }] };
    expect(mockSanctuarySimulate(harsh, species, 9).expected_species_saved).toBeLessThan(
      mockSanctuarySimulate(concentrated(50, 400), species, 9).expected_species_saved - 1,
    );
  });
});

describe("mock advance: one realised future (MOCK ONLY)", () => {
  it("luck_percentile is in [0, 1], and the report is self-consistent", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = mockSanctuaryAdvance(split(10, 500), species, seed);
      expect(r.luck_percentile).toBeGreaterThanOrEqual(0);
      expect(r.luck_percentile).toBeLessThanOrEqual(1);
      expect(r.years).toBe(10);
      for (const d of r.domes) {
        expect(d.start).toEqual({ dodo: 5, passenger_pigeon: 5 });
        for (const n of Object.values(d.end)) expect(n).toBeGreaterThanOrEqual(0);
        for (const e of d.events) {
          expect(e.year).toBeGreaterThanOrEqual(1);
          expect(e.year).toBeLessThanOrEqual(10);
          expect(["breach", "power", "meteor", "disease"]).toContain(e.type);
        }
      }
      const aliveEnd = ["dodo", "passenger_pigeon"].filter((id) => r.domes.some((d) => (d.end[id] ?? 0) > 0)).length;
      expect(r.species_alive_end).toBe(aliveEnd);
    }
  });

  it("concentrating species in one dome loses more of them than splitting", () => {
    const lost = (req: SanctuarySimRequest) => {
      let speciesLost = 0;
      for (let seed = 1; seed <= 600; seed++) speciesLost += 2 - mockSanctuaryAdvance(req, species, seed).species_alive_end;
      return speciesLost;
    };
    expect(lost(concentrated(10, 50))).toBeGreaterThan(lost(split(10, 50)) * 2);
  });
});

describe("mock capacity and lingering outbreaks (MOCK ONLY)", () => {
  /** One dome per entry: the same 50 dodos, in domes of different capacity. */
  const domesOf = (capacities: number[], years: number, runs: number): SanctuarySimRequest => ({
    domes: capacities.map((capacity, i) => ({ id: `d${i}`, ...GOOD, capacity, residents: [{ species_id: "dodo", count: 50 }] })),
    years,
    runs,
  });

  it("the outbreak chance rises once a dome is over 80% full", () => {
    expect(outbreakChance(40, 60)).toBe(outbreakChance(10, 60)); // under 80%: base chance
    expect(outbreakChance(54, 60)).toBeGreaterThan(outbreakChance(48, 60));
    expect(outbreakChance(60, 60)).toBeGreaterThan(outbreakChance(48, 60) * 3);
  });

  it("a crowded dome gets more outbreaks than an uncrowded one", () => {
    // Same animals: 50 dodos in a 55-place dome (crowded) vs a 200-place dome.
    let crowded = 0;
    let roomy = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = mockSanctuaryAdvance(domesOf([55, 200], 3, 10), species, seed);
      crowded += r.domes[0].events.filter((e) => e.type === "disease").length;
      roomy += r.domes[1].events.filter((e) => e.type === "disease").length;
    }
    expect(crowded).toBeGreaterThan(roomy * 1.5);
  });

  it("species share the capacity: no dome ever ends above it", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = mockSanctuaryAdvance(
        { domes: [{ id: "a", ...GOOD, capacity: 40, residents: [{ species_id: "dodo", count: 25 }, { species_id: "passenger_pigeon", count: 25 }] }], years: 10, runs: 50 },
        species,
        seed,
      );
      expect(Object.values(r.domes[0].start).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(40); // over-full input is trimmed
      expect(Object.values(r.domes[0].end).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(40);
    }
  });

  it("an outbreak lingers: it keeps killing, is reported as ongoing, and its end state comes back", () => {
    const req = (years: number): SanctuarySimRequest => ({
      domes: [{ id: "a", ...GOOD, outbreak: { years_left: 3, severity: 0.5 }, residents: [{ species_id: "dodo", count: 30 }] }],
      years,
      runs: 50,
    });
    const short = mockSanctuaryAdvance(req(2), species, 5);
    const first = short.domes[0].events.find((e) => e.type === "disease")!;
    expect(first.ongoing).toBe(true);
    expect(first.year).toBe(1);
    expect(first.lost.dodo).toBeGreaterThan(0);
    expect(short.domes[0].outbreak).toEqual({ years_left: 1, severity: 0.5 }); // 3 − 2 years
    const long = mockSanctuaryAdvance(req(10), species, 5);
    for (const e of long.domes[0].events.filter((x) => x.type === "disease" && !x.ongoing)) expect(e.year).toBeGreaterThan(3);
    if (long.domes[0].outbreak) expect(long.domes[0].outbreak.years_left).toBeGreaterThanOrEqual(1);
  });

  it("animals moved from an infected dome sometimes bring the outbreak along", () => {
    let spread = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = mockSanctuaryAdvance(
        { domes: [{ id: "a", ...GOOD, residents: [{ species_id: "dodo", count: 20, from_infected: 4 }] }], years: 1, runs: 10 },
        species,
        seed,
      );
      spread += r.domes[0].events.filter((e) => e.spread).length;
    }
    // 1 − 0.85⁴ ≈ 48% of futures
    expect(spread).toBeGreaterThan(60);
    expect(spread).toBeLessThan(140);
  });
});
