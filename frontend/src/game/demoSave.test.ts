import { describe, expect, it } from "vitest";
import { migrate } from "../hooks/useProgress";
import type { Species } from "../types";
import { buildDemoSave, PRESET } from "./demoSave";
import { isRevealed, isUnlocked, thrivingIds, unlockedWaveFor, wavesOf } from "./encyclopedia";
import { capacityLevel, capacityOf, placedOf, residentTotal } from "./sanctuary";
import { domeCost, travelCost } from "./zorps";

const SPECIES = Object.values(import.meta.glob("../mocks/species/*.json", { eager: true, import: "default" })) as Species[];
const byId = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

describe("demo save", () => {
  const save = buildDemoSave(byId);

  it("survives the save migration unchanged (it's a valid save)", () => {
    const copy = JSON.parse(JSON.stringify(save));
    migrate(copy);
    expect(copy).toEqual(JSON.parse(JSON.stringify(save)));
  });

  it("has waves 1–2 unlocked, ~5 species rescued and visited, one unlocked but unvisited", () => {
    const waves = wavesOf(SPECIES);
    expect(save.unlock?.wave).toBe(2);
    expect(unlockedWaveFor(save.saved.length)).toBe(2); // consistent with the rescues
    expect(save.saved).toHaveLength(5);
    for (const id of save.saved) {
      expect(isUnlocked(id, waves, 2), id).toBe(true);
      expect(isRevealed(id, save), id).toBe(true);
    }
    const unvisited = SPECIES.filter((s) => isUnlocked(s.id, waves, 2) && !isRevealed(s.id, save));
    expect(unvisited.map((s) => s.id)).toEqual(["quagga"]);
  });

  it("sets up 3 domes: one species split across two domes, one dome crowded", () => {
    const domes = save.sanctuary!.domes;
    expect(domes).toHaveLength(3);
    const homes = (id: string) => domes.filter((d) => (d.residents[id] ?? 0) > 0).length;
    expect(homes("passenger_pigeon")).toBe(2);
    expect(homes("lord_howe_stick_insect")).toBe(2);
    expect(domes.some((d) => capacityLevel(residentTotal(d), capacityOf(d)) === "crowded")).toBe(true);
    for (const d of domes) expect(residentTotal(d)).toBeLessThanOrEqual(capacityOf(d));
  });

  it("is internally consistent: pool, scans, needs, thriving", () => {
    const placed = placedOf(save.sanctuary!.domes);
    expect(Object.keys(placed).every((id) => save.saved.includes(id))).toBe(true);
    expect(save.pool).toEqual(PRESET.pool);
    expect(save.scanned.thylacine).toHaveLength(5);
    for (const id of save.saved) expect(save.discovered?.[id]?.length, id).toBeGreaterThan(0);
    expect(thrivingIds(save.sanctuary).sort()).toEqual(Object.keys(placed).sort());
  });

  it("has enough Zorps to travel to the unvisited species and build a dome", () => {
    const quagga = byId.quagga;
    const trip = travelCost(save.glorp!, { lat: quagga.lat, lon: quagga.lon, era_year: quagga.era_year });
    expect(save.zorps!).toBeGreaterThanOrEqual(trip + domeCost());
  });

  it("names unknown species clearly", () => {
    expect(() => buildDemoSave({})).toThrow(/unknown species/);
  });
});
