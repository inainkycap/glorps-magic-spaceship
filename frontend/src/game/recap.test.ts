import { describe, expect, it } from "vitest";
import { mockSanctuaryAdvance } from "../mocks/mockSanctuarySim";
import dodo from "../mocks/species/dodo.json";
import pigeon from "../mocks/species/passenger_pigeon.json";
import type { AdvanceDome, SanctuaryAdvanceRequest, Species } from "../types";
import { populationAt } from "./recap";

const YEARS = 10;
const recap = (d: AdvanceDome, years = YEARS) => Array.from({ length: years + 1 }, (_, y) => populationAt(d, y, years));

/** Every year before the end: no species shows 0 while its end population is above 0. */
function expectNoFalseExtinction(d: AdvanceDome, years = YEARS) {
  const frames = recap(d, years);
  for (const [id, end] of Object.entries(d.end)) {
    if (end <= 0) continue;
    frames.forEach((f, y) => expect(f[id], `${d.id}: ${id} in year ${y} (ends at ${end})`).toBeGreaterThan(0));
  }
  expect(frames[years]).toEqual(d.end);
}

describe("advance recap", () => {
  it("doesn't kill off a species that grew back (the old start-minus-losses bug)", () => {
    // An outbreak's whole-decade toll (12) exceeds the start (10) because of births in between.
    const d: AdvanceDome = {
      id: "dome-1",
      start: { dodo: 10 },
      end: { dodo: 8 },
      events: [{ year: 2, type: "disease", lost: { dodo: 12 } }],
    };
    expectNoFalseExtinction(d);
  });

  it("never shows a species at 0 before the end when it ends above 0 (random reports)", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const types = ["breach", "power", "meteor", "disease"] as const;
    for (let i = 0; i < 500; i++) {
      const start = { a: Math.floor(rand() * 30), b: 2 + Math.floor(rand() * 30) };
      const end = { a: Math.floor(rand() * 40), b: rand() < 0.3 ? 0 : 2 + Math.floor(rand() * 40) };
      const events = Array.from({ length: Math.floor(rand() * 4) }, () => ({
        year: 1 + Math.floor(rand() * YEARS),
        type: types[Math.floor(rand() * types.length)],
        lost: { a: Math.floor(rand() * 40), b: Math.floor(rand() * 40) },
      }));
      expectNoFalseExtinction({ id: `r${i}`, start, end, events });
    }
  });

  it("…including the mock's real advances, with and without history", () => {
    const species = [dodo, pigeon] as unknown as Species[];
    const req: SanctuaryAdvanceRequest = {
      domes: ["a", "b"].map((id) => ({
        id,
        terrain: "forest" as const,
        temperature: 24,
        humidity: 75,
        oxygen: 21,
        pressure: 101,
        capacity: 60,
        residents: [
          { species_id: "dodo", count: 25 },
          { species_id: "passenger_pigeon", count: 25 },
        ],
      })),
      years: YEARS,
      runs: 20,
    };
    for (let s = 1; s <= 60; s++) {
      for (const d of mockSanctuaryAdvance(req, species, s).domes) {
        expectNoFalseExtinction(d);
        expectNoFalseExtinction({ ...d, history: undefined });
      }
    }
  });

  it("uses the history when the response has one", () => {
    const d: AdvanceDome = {
      id: "dome-1",
      start: { dodo: 10 },
      end: { dodo: 14 },
      events: [],
      history: { dodo: [10, 12, 9, 9, 11, 13, 15, 16, 15, 14, 14] },
    };
    expect(recap(d).map((f) => f.dodo)).toEqual(d.history!.dodo);
  });

  it("without a history: a smooth line, with a visible dip in the year a sudden disaster struck", () => {
    const d: AdvanceDome = {
      id: "dome-1",
      start: { dodo: 20 },
      end: { dodo: 20 },
      events: [{ year: 4, type: "meteor", lost: { dodo: 15 } }],
    };
    const path = recap(d).map((f) => f.dodo);
    expect(path[0]).toBe(20);
    expect(path[4]).toBeLessThan(path[3] - 10); // the meteor shows in its year
    for (let y = 4; y < YEARS; y++) expect(path[y + 1]).toBeGreaterThanOrEqual(path[y]); // then it regrows
    expect(path[YEARS]).toBe(20);
  });

  it("a species that really dies out can show 0", () => {
    const d: AdvanceDome = {
      id: "dome-1",
      start: { dodo: 6 },
      end: { dodo: 0 },
      events: [{ year: 3, type: "breach", lost: { dodo: 6 } }],
    };
    const path = recap(d).map((f) => f.dodo);
    expect(path[3]).toBe(0);
    expect(path[YEARS]).toBe(0);
  });
});

describe("mock advance history (PROPOSED field)", () => {
  it("has years + 1 entries per species, from start to end", () => {
    const species = [dodo, pigeon] as unknown as Species[];
    const req: SanctuaryAdvanceRequest = {
      domes: [
        {
          id: "a",
          terrain: "forest",
          temperature: 24,
          humidity: 75,
          oxygen: 21,
          pressure: 101,
          capacity: 60,
          residents: [{ species_id: "dodo", count: 10 }],
        },
      ],
      years: YEARS,
      runs: 20,
    };
    for (let s = 1; s <= 20; s++) {
      const [d] = mockSanctuaryAdvance(req, species, s).domes;
      expect(Object.keys(d.history!)).toEqual(["dodo"]);
      expect(d.history!.dodo).toHaveLength(YEARS + 1);
      expect(d.history!.dodo[0]).toBe(d.start.dodo);
      expect(d.history!.dodo[YEARS]).toBe(d.end.dodo);
    }
  });
});
