// Sanctuary rules and helpers (pure, no React). Domes sit on Glorp's home
// planet; each has its own controlled environment and residents.

import { DOME_SITES } from "./fuel";
import type {
  DomeConditions,
  DomeState,
  DomeTerrain,
  SanctuarySimRequest,
  SanctuaryState,
  Species,
} from "../types";
import { overallFit } from "./fit";

export const TERRAINS: DomeTerrain[] = ["forest", "grassland", "wetland", "tundra"];

export const TERRAIN_LABEL: Record<DomeTerrain, string> = {
  forest: "Forest",
  grassland: "Grassland",
  wetland: "Wetland",
  tundra: "Tundra",
};

/** Dial ranges on Glorp's control panel. */
export const CONTROLS = {
  temperature: { label: "Temperature", min: -30, max: 50, step: 1, unit: "°C" },
  humidity: { label: "Humidity", min: 0, max: 100, step: 1, unit: "%" },
  oxygen: { label: "Oxygen", min: 10, max: 35, step: 0.5, unit: "%" },
  pressure: { label: "Pressure", min: 50, max: 200, step: 1, unit: "kPa" },
} as const;
export type ControlKey = keyof typeof CONTROLS;

/** A new dome: Earth-like, mild grassland. */
export const DEFAULT_CONDITIONS: DomeConditions = {
  terrain: "grassland",
  temperature: 20,
  humidity: 60,
  oxygen: 21,
  pressure: 101,
};

const SITE_NAMES = ["Dome Zib", "Dome Glorpa", "Dome Blip", "Dome Wub", "Dome Quorx", "Dome Fizz"];

export function newDome(site: number): DomeState {
  return { id: `dome-${site + 1}`, site, name: SITE_NAMES[site] ?? `Dome ${site + 1}`, residents: {}, ...DEFAULT_CONDITIONS };
}

/** What a player starts with: one dome, built on the first site. */
export function defaultSanctuary(): SanctuaryState {
  return { domes: [newDome(0)] };
}

/** Per-dome disasters (correlated within a dome, independent between domes). */
export const DISASTERS = [
  { id: "breach", label: "Dome breach", text: "The glass cracks and the outside air rushes in." },
  { id: "power", label: "Power failure", text: "Climate control goes dark for a season." },
  { id: "meteor", label: "Meteor strike", text: "Rare, but it can flatten a whole dome." },
  { id: "disease", label: "Disease outbreak", text: "Spreads through everyone sharing the dome." },
] as const;
export type DisasterId = (typeof DISASTERS)[number]["id"];

export const SIM_YEARS = 50;
export const SIM_RUNS = 1000;

/** Individuals placed in any dome, per species. */
export function placedOf(domes: DomeState[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of domes) for (const [id, n] of Object.entries(d.residents)) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** Rescued individuals not yet placed in a dome, per species (never negative). */
export function poolOf(rescued: Record<string, number>, domes: DomeState[]): Record<string, number> {
  const placed = placedOf(domes);
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(rescued)) out[id] = Math.max(0, n - (placed[id] ?? 0));
  return out;
}

export const residentTotal = (d: DomeState) => Object.values(d.residents).reduce((a, b) => a + b, 0);

export function buildRequest(domes: DomeState[], years = SIM_YEARS, runs = SIM_RUNS): SanctuarySimRequest {
  return {
    domes: domes.map(({ id, terrain, temperature, humidity, oxygen, pressure, residents }) => ({
      id,
      terrain,
      temperature,
      humidity,
      oxygen,
      pressure,
      residents: Object.entries(residents)
        .filter(([, n]) => n > 0)
        .map(([species_id, count]) => ({ species_id, count })),
    })),
    years,
    runs,
  };
}

/** Fingerprint of everything that affects a run, so results can be flagged as out of date. */
export function runKey(domes: DomeState[]): string {
  return JSON.stringify(buildRequest(domes).domes);
}

export function runLabel(domes: DomeState[]): string {
  const used = domes.filter((d) => residentTotal(d) > 0).length;
  const placed = domes.reduce((s, d) => s + residentTotal(d), 0);
  return `${used} dome${used === 1 ? "" : "s"} · ${placed} placed`;
}

/** Count-weighted average fit of a dome's residents (null if empty). */
export function domeFit(dome: DomeState, speciesById: Record<string, Pick<Species, "needs">>): number | null {
  let total = 0;
  let weighted = 0;
  for (const [id, n] of Object.entries(dome.residents)) {
    const s = speciesById[id];
    if (!s || n <= 0) continue;
    total += n;
    weighted += n * overallFit(s, dome);
  }
  return total > 0 ? weighted / total : null;
}

export const isSite = (n: number) => Number.isInteger(n) && n >= 0 && n < DOME_SITES;

/**
 * How the dome interior looks for its conditions: sky colour from temperature
 * (icy blue → warm amber), haze from humidity, dimmer and purpler with low
 * oxygen, paler with low pressure.
 */
export function domeTint(c: DomeConditions) {
  const t = Math.min(1, Math.max(0, (c.temperature + 30) / 80)); // -30 °C → 0, 50 °C → 1
  const hue = 215 - t * 185; // 215 (blue) → 30 (amber)
  const lowO2 = Math.min(1, Math.max(0, (21 - c.oxygen) / 11));
  const thin = Math.min(1, Math.max(0, (101 - c.pressure) / 51));
  const sat = 35 - lowO2 * 10;
  const light = 62 - lowO2 * 18 + thin * 14;
  return {
    sky: `hsl(${hue - lowO2 * 40} ${sat}% ${light}%)`,
    haze: Math.min(0.55, (c.humidity / 100) * 0.55), // 0..0.55 white fog
    gloom: lowO2 * 0.35, // dark overlay for thin oxygen
  };
}
