import { describe, expect, it } from "vitest";
import type { Progress, SanctuaryState, Species, StoredAdvance } from "../types";
import {
  completionOf,
  diversityScore,
  isComplete,
  isUnlocked,
  newlyUnlocked,
  overallCompletion,
  thrivingIds,
  unlockedWaveFor,
  wavesOf,
} from "./encyclopedia";

const mocks = import.meta.glob("../mocks/species/*.json", { eager: true, import: "default" });
const SPECIES = Object.values(mocks) as Species[];
const byId = (id: string) => SPECIES.find((s) => s.id === id)!;

const dome = (residents: Record<string, number>, id = "dome-1") => ({
  id, site: 0, name: "Dome Zib", terrain: "forest" as const, temperature: 24, humidity: 75, oxygen: 21, pressure: 101, residents,
});
const advance = (end: Record<string, number>): StoredAdvance => ({
  at: 0, fromYear: 0, toYear: 10, zorps: 0, domeNames: {},
  result: { years: 10, domes: [{ id: "dome-1", start: end, end, events: [] }], species_alive_end: 0, luck_percentile: 0.5 },
});

describe("unlock waves", () => {
  it("without unlock_wave: by era, most recent first, 3 + 3 + the rest", () => {
    const w = wavesOf(SPECIES);
    const wave = (n: number) => Object.keys(w).filter((id) => w[id] === n).sort();
    expect(wave(1)).toEqual(["golden_toad", "lord_howe_stick_insect", "pyrenean_ibex"]); // 1987, 1915, 1910
    expect(wave(2)).toEqual(["passenger_pigeon", "quagga", "thylacine"]); // 1900, 1870, 1870
    expect(wave(3)).toHaveLength(SPECIES.length - 6);
    expect(w.woolly_mammoth).toBe(3);
  });

  it("unlock_wave in the data wins; species without one go last", () => {
    const w = wavesOf([
      { id: "a", era_year: 2000, unlock_wave: 3 },
      { id: "b", era_year: -5000, unlock_wave: 1 },
      { id: "c", era_year: 1900 },
      { id: "d", era_year: 1800, unlock_wave: 7 }, // invalid: ignored
    ]);
    expect(w).toEqual({ a: 3, b: 1, c: 3, d: 3 });
  });

  it("3 rescues unlock wave 2, 6 unlock wave 3", () => {
    expect([0, 2, 3, 5, 6, 14].map(unlockedWaveFor)).toEqual([1, 1, 2, 2, 3, 3]);
    const w = wavesOf(SPECIES);
    expect(isUnlocked("golden_toad", w, 1)).toBe(true);
    expect(isUnlocked("quagga", w, 1)).toBe(false);
    expect(isUnlocked("quagga", w, 2)).toBe(true);
    expect(isUnlocked("woolly_mammoth", w, 2)).toBe(false);
    expect(newlyUnlocked(w, 1, 2).sort()).toEqual(["passenger_pigeon", "quagga", "thylacine"]);
  });
});

describe("completion", () => {
  const dodo = byId("dodo");
  const fresh: Progress = { scanned: {}, saved: [] };

  it("is 0 for a fresh start and 100% when every item is done", () => {
    expect(completionOf(dodo, fresh).fraction).toBe(0);
    const done: Progress = {
      scanned: { dodo: dodo.hotspots.map((h) => h.id) },
      discovered: { dodo: ["terrain", "temperature", "humidity", "oxygen", "pressure"] },
      saved: ["dodo"],
      found: ["dodo"],
      visited: ["dodo"],
      dnaComplete: ["dodo"],
      sanctuary: { domes: [dome({ dodo: 12 })], lastAdvance: advance({ dodo: 12 }) },
    };
    const c = completionOf(dodo, done);
    expect(c.fraction).toBe(1);
    expect(c.items.map((i) => i.key)).toEqual(["found", "visited", "facts", "needs", "dna", "rescued", "thriving"]);
  });

  it("counts partial facts and needs, and visiting implies found", () => {
    const p: Progress = {
      scanned: { dodo: [dodo.hotspots[0].id, dodo.hotspots[1].id] },
      discovered: { dodo: ["terrain"] },
      saved: [],
      visited: ["dodo"],
    };
    const c = completionOf(dodo, p);
    const item = (k: string) => c.items.find((i) => i.key === k)!;
    expect(item("found").done).toBe(1);
    expect(item("facts").count).toBe(`2/${dodo.hotspots.length}`);
    expect(item("needs").count).toBe("1/5");
    expect(c.fraction).toBeCloseTo((1 + 1 + 2 / dodo.hotspots.length + 1 / 5) / 7, 10);
  });

  it("overall completion averages every species (locked ones count 0)", () => {
    const p: Progress = { scanned: {}, saved: [], found: ["dodo"], visited: ["dodo"] };
    expect(overallCompletion(SPECIES, p)).toBeCloseTo(2 / 7 / SPECIES.length, 10);
    expect(overallCompletion([], p)).toBe(0);
  });
});

describe("thriving, diversity score and the goal", () => {
  it("thriving needs an advance: placed animals alone don't count", () => {
    const placedOnly: SanctuaryState = { domes: [dome({ dodo: 10 })] };
    expect(thrivingIds(placedOnly)).toEqual([]);
    const after: SanctuaryState = { domes: [dome({ dodo: 10, moa: 1 })], lastAdvance: advance({ dodo: 10, moa: 1 }) };
    expect(thrivingIds(after)).toEqual(["dodo"]); // a lone moa isn't thriving
    const movedOut: SanctuaryState = { domes: [dome({})], lastAdvance: advance({ dodo: 10 }) };
    expect(thrivingIds(movedOut)).toEqual([]); // no longer in a dome
  });

  it("diversity = sum of diversity_value of species alive in domes (default 1)", () => {
    const s: SanctuaryState = { domes: [dome({ dodo: 5, moa: 3 }), dome({ dodo: 2, quagga: 0 }, "dome-2")] };
    expect(diversityScore(s, {})).toBe(2); // dodo + moa, each 1 by default; quagga has 0 alive
    expect(diversityScore(s, { dodo: { diversity_value: 3 }, moa: { diversity_value: 1.5 } })).toBe(4.5);
    expect(diversityScore({ domes: [] }, {})).toBe(0);
    expect(diversityScore(undefined, {})).toBe(0);
  });

  it("the goal is reached when every species is rescued and thriving", () => {
    const sp = [{ id: "dodo" }, { id: "moa" }];
    const base = { scanned: {}, sanctuary: { domes: [dome({ dodo: 9, moa: 4 })], lastAdvance: advance({ dodo: 9, moa: 4 }) } };
    expect(isComplete(sp, { ...base, saved: ["dodo"] })).toBe(false);
    expect(isComplete(sp, { ...base, saved: ["dodo", "moa"] })).toBe(true);
    expect(isComplete([], { ...base, saved: [] })).toBe(false);
  });
});
