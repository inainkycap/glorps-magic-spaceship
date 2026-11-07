import { describe, expect, it } from "vitest";
import { rng } from "../mocks/mockSanctuarySim";
import { dnaDifficulty, individualsFromQuality, makeStrand, PARTNER, quality, type Base } from "./dna";

describe("DNA Lab difficulty", () => {
  it("matches the documented values for the current species", () => {
    expect(dnaDifficulty(1870)).toEqual({ bases: 11, degraded: 1, seconds: 20 });
    expect(dnaDifficulty(1600)).toEqual({ bases: 13, degraded: 3, seconds: 21 });
    expect(dnaDifficulty(2026)).toEqual({ bases: 10, degraded: 0, seconds: 20 });
  });

  it("gets harder (never easier) the older the species", () => {
    let prev = dnaDifficulty(2026);
    for (let year = 2000; year >= -3000; year -= 25) {
      const d = dnaDifficulty(year);
      expect(d.bases).toBeGreaterThanOrEqual(prev.bases);
      expect(d.degraded).toBeGreaterThanOrEqual(prev.degraded);
      prev = d;
    }
  });

  it("stays playable in under a minute at any age", () => {
    for (const year of [2026, 1600, 0, -100000]) {
      const d = dnaDifficulty(year);
      expect(d.bases).toBeLessThanOrEqual(16);
      expect(d.degraded).toBeLessThanOrEqual(Math.floor(d.bases / 3));
      expect(d.seconds).toBeLessThan(60);
    }
  });
});

describe("DNA Lab scoring", () => {
  it("builds a strand with the right number of degraded bases", () => {
    const s = makeStrand(dnaDifficulty(1600), rng(3));
    expect(s.bases).toHaveLength(13);
    expect(s.degraded.size).toBe(3);
    expect([...s.degraded].every((i) => i >= 0 && i < 13)).toBe(true);
  });

  it("scores pairs A↔T, C↔G; unanswered counts as wrong", () => {
    const strand: Base[] = ["A", "C", "G", "T"];
    expect(quality(strand, strand.map((b) => PARTNER[b]))).toBe(1);
    expect(quality(strand, ["T", "G", null, "A"])).toBe(0.75);
    expect(quality(strand, ["A", "C", "G", "T"])).toBe(0); // same base is not the partner
  });

  it("converts quality to 4–20 individuals", () => {
    expect(individualsFromQuality(0)).toBe(4);
    expect(individualsFromQuality(1)).toBe(20);
    expect(individualsFromQuality(0.5)).toBe(12);
    expect(individualsFromQuality(2)).toBe(20);
    expect(individualsFromQuality(-1)).toBe(4);
  });
});
