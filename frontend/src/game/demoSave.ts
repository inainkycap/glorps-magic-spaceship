// "Load demo save" (Settings menu): a mid-game state for demos. Tweak the PRESET below;
// buildDemoSave() turns it into a full Progress using the real species files (hotspot
// ids, needs), so scans and discovered needs always match the data.
//
// What it sets up:
// - waves 1 and 2 unlocked (6 species); 5 rescued and visited; the quagga is unlocked
//   but unvisited (a silhouette pin on the map, "???" in the encyclopedia)
// - sanctuary year +20 with a last advance report, so species show as thriving
// - 3 domes: Zib + Glorpa split the stick insect and passenger pigeon between them
//   (well split), Blip is packed with golden toads (crowded: outbreak risk)
// - the Pyrenean ibex waits in the pool (it needs a cold dome: build one)
// - enough Zorps to travel and build
//
// Waves assume the era order (no unlock_wave in the data yet); demoSave.test.ts checks
// that every species here is unlocked by wave 2, so a data change shows up there.

import type { DomeState, Progress, Species, StoredAdvance } from "../types";
import { needKeysOf, revealsOf } from "./needs";
import { newDome } from "./sanctuary";

interface DemoSpecies {
  id: string;
  /** Best DNA Lab result (animals rescued, 4–20). */
  rescued: number;
  /** How many of its hotspots have been scanned (default: all). */
  scanned?: number;
}

export const PRESET = {
  zorps: 140,
  year: 20,
  /** Visited, scanned and rescued (5 → unlocks stay at wave 2: 6 rescues unlock wave 3). */
  species: [
    { id: "golden_toad", rescued: 18 },
    { id: "lord_howe_stick_insect", rescued: 16 },
    { id: "pyrenean_ibex", rescued: 15 },
    { id: "thylacine", rescued: 14, scanned: 5 },
    { id: "passenger_pigeon", rescued: 17 },
  ] satisfies DemoSpecies[],
  /** Glorp's position: this species' place and era. */
  glorpAt: "thylacine",
  /** Domes on sites 0, 1, 2: conditions and residents (live animals, after 2 advances). */
  domes: [
    {
      name: "Dome Zib",
      conditions: { terrain: "forest", temperature: 18, humidity: 72, oxygen: 21, pressure: 98 },
      residents: { lord_howe_stick_insect: 9, passenger_pigeon: 10, thylacine: 8 },
    },
    {
      name: "Dome Glorpa",
      conditions: { terrain: "forest", temperature: 20, humidity: 75, oxygen: 21, pressure: 99 },
      residents: { lord_howe_stick_insect: 8, passenger_pigeon: 9 },
    },
    {
      name: "Dome Blip",
      conditions: { terrain: "wetland", temperature: 17, humidity: 92, oxygen: 21, pressure: 85 },
      residents: { golden_toad: 50 }, // 50 of 60: crowded (over 80%), so outbreaks get likelier
    },
  ],
  /** Rescued animals not placed yet. */
  pool: { pyrenean_ibex: 15 },
  /** The last "Advance 10 years" (year +10 → +20), for the report and thriving ticks. */
  lastAdvance: {
    luck: 0.62,
    zorps: 64,
    /** A disaster to show in the report: dome index, year within the decade, animals lost. */
    event: { dome: 0, year: 6, type: "power" as const, lost: { passenger_pigeon: 2 } },
  },
} as const;

/** Build the demo save from the species files (full Species, as the API returns them). */
export function buildDemoSave(speciesById: Record<string, Pick<Species, "id" | "hotspots" | "needs" | "lat" | "lon" | "era_year">>): Progress {
  const ids: string[] = PRESET.species.map((s) => s.id);
  const missing = ids.filter((id) => !speciesById[id]);
  if (missing.length) throw new Error(`Demo save: unknown species ${missing.join(", ")}`);

  const scanned: Record<string, string[]> = {};
  const discovered: Record<string, string[]> = {};
  for (const d of PRESET.species as readonly DemoSpecies[]) {
    const s = speciesById[d.id];
    const hs = s.hotspots.slice(0, d.scanned ?? s.hotspots.length);
    scanned[d.id] = hs.map((h) => h.id);
    // Needs discovered = what the scanned hotspots reveal (as if played).
    const revealed = new Set(hs.flatMap((h) => revealsOf(h)));
    discovered[d.id] = needKeysOf(s.needs).filter((k) => revealed.has(k));
  }

  const domes: DomeState[] = PRESET.domes.map((d, site) => ({
    ...newDome(site),
    name: d.name,
    ...d.conditions,
    residents: { ...d.residents },
  }));

  // Last advance: start = end + what the event killed; end = today's residents.
  const ev = PRESET.lastAdvance.event;
  const lastAdvance: StoredAdvance = {
    at: Date.now(),
    fromYear: PRESET.year - 10,
    toYear: PRESET.year,
    zorps: PRESET.lastAdvance.zorps,
    domeNames: Object.fromEntries(domes.map((d) => [d.id, d.name])),
    result: {
      years: 10,
      domes: domes.map((d, i) => {
        const lost: Record<string, number> = i === ev.dome ? { ...ev.lost } : {};
        const start = Object.fromEntries(Object.entries(d.residents).map(([id, n]) => [id, Math.max(2, n - 3) + (lost[id] ?? 0)]));
        return {
          id: d.id,
          start,
          end: { ...d.residents },
          events: i === ev.dome ? [{ year: ev.year, type: ev.type, lost }] : [],
          outbreak: null,
        };
      }),
      species_alive_end: new Set(domes.flatMap((d) => Object.keys(d.residents))).size,
      luck_percentile: PRESET.lastAdvance.luck,
    },
  };

  const thrived = [...new Set(domes.flatMap((d) => Object.entries(d.residents).filter(([, n]) => n >= 2).map(([id]) => id)))];
  const at = speciesById[PRESET.glorpAt];
  const rescued = Object.fromEntries(PRESET.species.map((s) => [s.id, s.rescued]));

  return {
    scanned,
    discovered: discovered as Progress["discovered"],
    saved: [...ids],
    found: [...ids],
    visited: [...ids],
    dnaComplete: [...ids],
    rescued,
    dnaBest: Object.fromEntries(PRESET.species.map((s) => [s.id, { quality: (s.rescued - 4) / 16, individuals: s.rescued }])),
    pool: { ...PRESET.pool },
    zorps: PRESET.zorps,
    glorp: { lat: at.lat, lon: at.lon, era_year: at.era_year },
    thrived,
    unlock: { wave: 2, seenMap: 2, seenGuide: 2 },
    sanctuary: { domes, year: PRESET.year, lastAdvance },
  };
}
