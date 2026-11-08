import { describe, expect, it } from "vitest";
import { buildRequest, capacityLevel, cutLabel, luckLine, newDome, outbreakStatus } from "../game/sanctuary";
import { migrate } from "./useProgress";

describe("saved-progress migration", () => {
  it("drops fuel and derives the unplaced pool from an old save", () => {
    const old: Record<string, unknown> = {
      scanned: { dodo: ["egg"] },
      saved: ["dodo"],
      fuel: 37,
      rescued: { dodo: 20, passenger_pigeon: 8 },
      sanctuary: {
        domes: [
          { id: "dome-1", site: 0, name: "Dome Zib", terrain: "forest", temperature: 24, humidity: 75, oxygen: 21, pressure: 101, residents: { dodo: 5 } },
        ],
      },
    };
    migrate(old);
    expect(old).not.toHaveProperty("fuel");
    expect(old).not.toHaveProperty("zorps"); // starts at the Zorps start amount
    expect(old.pool).toEqual({ dodo: 15, passenger_pigeon: 8 });
    expect(old.scanned).toEqual({ dodo: ["egg"] }); // everything else kept
  });

  it("keeps an existing pool and drops broken optional parts", () => {
    const save: Record<string, unknown> = { scanned: {}, saved: [], pool: { dodo: 3 }, zorps: "lots", dnaComplete: [1] };
    migrate(save);
    expect(save.pool).toEqual({ dodo: 3 });
    expect(save).not.toHaveProperty("zorps");
    expect(save).not.toHaveProperty("dnaComplete");
  });
});

describe("capacity, outbreaks and chart labels", () => {
  it("capacity bar levels: crowded from 80%, full at 100%", () => {
    expect(capacityLevel(47, 60)).toBe("ok");
    expect(capacityLevel(48, 60)).toBe("crowded");
    expect(capacityLevel(60, 60)).toBe("full");
    expect(capacityLevel(75, 60)).toBe("full");
  });

  it("report says whether an outbreak continues or ended", () => {
    expect(outbreakStatus(true, { years_left: 3 })).toBe("Outbreak continues (3 years left).");
    expect(outbreakStatus(true, { years_left: 1 })).toBe("Outbreak continues (1 year left).");
    expect(outbreakStatus(true, null)).toBe("Outbreak ended.");
    expect(outbreakStatus(false, null)).toBeNull();
  });

  it("requests send capacity, the running outbreak and exposed animals", () => {
    const dome = { ...newDome(0), residents: { dodo: 10 }, exposed: { dodo: 3 }, outbreak: { years_left: 2, severity: 0.2 } };
    const [d] = buildRequest([dome]).domes;
    expect(d.capacity).toBe(60);
    expect(d.outbreak).toEqual({ years_left: 2, severity: 0.2 });
    expect(d.residents).toEqual([{ species_id: "dodo", count: 10, from_infected: 3 }]);
    expect(buildRequest([newDome(1)]).domes[0]).not.toHaveProperty("outbreak");
  });

  it("chart labels are cut with … but keep the number", () => {
    expect(cutLabel("Dodo", "98%", 18)).toBe("Dodo 98%");
    expect(cutLabel("Passenger pigeon", "72%", 18)).toBe("Passenger pig… 72%");
    expect(cutLabel("Passenger pigeon", "72%", 18).length).toBeLessThanOrEqual(18);
  });
});

describe("luck line", () => {
  it("reads the luck percentile", () => {
    expect(luckLine(0.08)).toBe("This was an unlucky future: only 8% of forecasts were this bad.");
    expect(luckLine(0.85)).toBe("Lucky! Better than 85% of forecasts.");
    expect(luckLine(0.5)).toBe("A fairly typical future: 50% of forecasts were this bad or worse.");
  });
});
