import { describe, expect, it } from "vitest";
import { buildEraScale, formatEra, formatYears, lerpEra, PRESENT_YEAR, yearFromYearsAgo, yearsAgo } from "./time";

const DEEP = PRESENT_YEAR - 66_000_000; // ~66 million years ago (dinosaurs)

describe("years ago (BCE, no year 0)", () => {
  it("counts across the BCE/CE boundary without a year 0", () => {
    expect(yearsAgo(2026)).toBe(0);
    expect(yearsAgo(1600)).toBe(426);
    expect(yearsAgo(1)).toBe(2025);
    expect(yearsAgo(-1)).toBe(2026); // 1 BCE is the year right before 1 CE
    expect(yearsAgo(-2000)).toBe(4025);
    expect(yearsAgo(0)).toBe(yearsAgo(-1)); // tolerated, treated as 1 BCE
  });

  it("round-trips", () => {
    for (const y of [2026, 1987, 1600, 1, -1, -50, -2000, DEEP]) expect(yearFromYearsAgo(yearsAgo(y))).toBe(y);
  });
});

describe("era formatting (one format everywhere)", () => {
  it.each([
    [2026, "today"],
    [1987, "1987"],
    [1600, "1600"],
    [900, "900 CE"],
    [-50, "50 BC"],
    [-1000, "1,000 BC"],
    [-2000, "2,000 BC"],
    [-12_000, "14,025 yrs ago"],
    [PRESENT_YEAR - 2_500_000, "2.5 million yrs ago"],
    [DEEP, "66 million yrs ago"],
  ])("%d → %s", (year, label) => expect(formatEra(year)).toBe(label));

  it("formats durations", () => {
    expect(formatYears(1)).toBe("1 yr");
    expect(formatYears(270)).toBe("270 yrs");
    expect(formatYears(4025, true)).toBe("4,025 years");
    expect(formatYears(66e6, true)).toBe("66 million years");
  });
});

describe("era timeline scale", () => {
  const ERAS = [-2000, -50, 900, 1300, 1350, 1600, 1741, 1800, 1870, 1900, 1910, 1915, 1987];

  it("uses a linear scale for a short span and a log scale beyond ~1,000 years", () => {
    expect(buildEraScale([1600, 1870]).kind).toBe("linear");
    expect(buildEraScale(ERAS).kind).toBe("log");
    expect(buildEraScale([DEEP, 1600]).kind).toBe("log");
  });

  it("keeps order, puts the present at the right and the oldest era near the left", () => {
    for (const eras of [ERAS, [1600, 1870], [DEEP, 1987]]) {
      const s = buildEraScale(eras);
      const sorted = [...eras, PRESENT_YEAR].sort((a, b) => a - b);
      const ps = sorted.map(s.pos);
      for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThan(ps[i - 1]);
      expect(s.pos(PRESENT_YEAR)).toBeGreaterThan(0.95);
      expect(s.pos(sorted[0])).toBeLessThan(0.15);
      expect(s.pos(sorted[0])).toBeGreaterThan(0); // padding before the oldest
      for (const p of ps) expect(Number.isFinite(p)).toBe(true);
    }
  });

  it("doesn't squash recent eras on a log scale", () => {
    const s = buildEraScale([DEEP, 1600, 1987]);
    // 1600 and 1987 are visibly apart even with 66 million years on the same track
    expect(s.pos(1987) - s.pos(1600)).toBeGreaterThan(0.08);
  });

  it("has sensible, non-overlapping ticks at any scale", () => {
    for (const eras of [[1600, 1870], ERAS, [DEEP, 1987]]) {
      const ticks = buildEraScale(eras).ticks;
      expect(ticks[ticks.length - 1].label).toBe("today");
      for (let i = 1; i < ticks.length; i++) expect(ticks[i].pos - ticks[i - 1].pos).toBeGreaterThan(0.08);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.every((t) => t.label.length > 0 && !t.label.includes("NaN"))).toBe(true);
    }
    const deepLabels = buildEraScale([DEEP, 1987]).ticks.map((t) => t.label);
    expect(deepLabels).toContain("10 million yrs ago");
    expect(deepLabels).toContain("100 yrs ago");
  });
});

describe("lerpEra (log-time interpolation for the travel counter)", () => {
  it("hits the endpoints and moves monotonically across huge spans", () => {
    expect(lerpEra(PRESENT_YEAR, DEEP, 0)).toBe(PRESENT_YEAR);
    expect(lerpEra(PRESENT_YEAR, DEEP, 1)).toBe(DEEP);
    let prev = PRESENT_YEAR;
    for (let f = 0.05; f <= 1; f += 0.05) {
      const y = lerpEra(PRESENT_YEAR, DEEP, f);
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeLessThanOrEqual(prev);
      prev = y;
    }
    // halfway in log time is thousands of years ago, not 33 million
    expect(yearsAgo(lerpEra(PRESENT_YEAR, DEEP, 0.5))).toBeLessThan(100_000);
  });
});
