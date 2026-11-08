import { describe, expect, it } from "vitest";
import type { NeedKey, Species } from "../types";
import { discoveryMessage, formatNeed, knownMessage, NEED_KEYS, needKeysOf, revealsOf } from "./needs";
import { PRESENT_YEAR } from "./time";
import { describeJump, formatJumpShort } from "./timeJump";

const mocks = import.meta.glob("../mocks/species/*.json", { eager: true, import: "default" });
const SPECIES = Object.values(mocks) as Species[];

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

  it("covers all species (the mocks mirror the backend files)", () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(14);
  });

  it.each(SPECIES.map((s) => [s.id, s] as const))("every need of %s is revealed by some hotspot", (_, s) => {
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
  it("labels direction and size, BCE and deep time included", () => {
    expect(formatJumpShort(1600, 1870)).toBe("+270 yrs");
    expect(formatJumpShort(1870, 1600)).toBe("−270 yrs");
    expect(formatJumpShort(1600, 1601)).toBe("+1 yr");
    expect(formatJumpShort(1, -1)).toBe("−1 yr"); // no year 0
    expect(describeJump(1600, 1870)).toBe("1600 → 1870 · 270 years into the future");
    expect(describeJump(PRESENT_YEAR, 1600)).toBe("today → 1600 · 426 years into the past");
    expect(describeJump(1600, -2000)).toBe("1600 → 2,000 BC · 3,599 years into the past");
    expect(describeJump(PRESENT_YEAR, PRESENT_YEAR - 66e6)).toBe(
      "today → 66 million yrs ago · 66 million years into the past",
    );
  });
});
