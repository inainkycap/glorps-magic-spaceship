// Sanctuary rules and helpers (pure, no React). Domes sit on Glorp's home
// planet; each has its own controlled environment and residents.

import { MAX_DOMES } from "./zorps";
import type {
  DomeConditions,
  DomeState,
  DomeTerrain,
  NeedKey,
  SanctuarySimRequest,
  SanctuarySimResponse,
  SanctuaryState,
  Species,
} from "../types";
import { knownFit } from "./fit";

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
  {
    id: "disease",
    label: "Disease outbreak",
    text: "Lingers for a few years, taking some of everyone in the dome each year. Likelier when the dome is crowded (over 80% full), and moved animals can carry it.",
  },
] as const;
export type DisasterId = (typeof DISASTERS)[number]["id"];

/** A forecast looks this far ahead; "Advance" moves the sanctuary clock this much. */
export const SIM_YEARS = 50;
export const SIM_RUNS = 1000;
export const ADVANCE_YEARS = 10;

/** Animals in all domes, per species. */
export function placedOf(domes: DomeState[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of domes) for (const [id, n] of Object.entries(d.residents)) out[id] = (out[id] ?? 0) + n;
  return out;
}

/**
 * True if every species in a forecast has the PROPOSED survival_by_year (else
 * the UI falls back to the band chart; the backend doesn't send it yet).
 */
export function hasSurvivalCurves(r: SanctuarySimResponse): boolean {
  return r.per_species.length > 0 && r.per_species.every((s) => (s.survival_by_year?.length ?? 0) === r.years.length);
}

/**
 * A chart label of at most `max` characters: "Passenger pigeon 72%" →
 * "Passenger pi… 72%". The suffix (the number) always shows in full.
 */
export function cutLabel(name: string, suffix: string, max: number): string {
  const full = `${name} ${suffix}`;
  if (full.length <= max) return full;
  const keep = Math.max(1, max - suffix.length - 2); // room for "…" and the space
  return `${name.slice(0, keep).trimEnd()}… ${suffix}`;
}

/** "This was an unlucky future: only 8% of forecasts were this bad", etc. */
export function luckLine(p: number): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (p <= 0.25) return `This was an unlucky future: only ${pct(p)} of forecasts were this bad.`;
  if (p >= 0.75) return `Lucky! Better than ${pct(p)} of forecasts.`;
  return `A fairly typical future: ${pct(p)} of forecasts were this bad or worse.`;
}

/** Plural for report lines: "1 dodo", "6 passenger pigeons", "3 moa", "2 aurochs". */
export function animals(n: number, name: string): string {
  const lower = name.toLowerCase();
  const same = /(s|moa|sheep|deer|ibex)$/.test(lower); // plural = singular
  return `${n} ${n === 1 || same ? lower : `${lower}s`}`;
}

export const residentTotal = (d: DomeState) => Object.values(d.residents).reduce((a, b) => a + b, 0);

// --- Capacity (shared by every species in a dome) -------------------------------------------
/** A new dome's capacity (animals in all). Matches the PROPOSED backend default. */
export const DEFAULT_DOME_CAPACITY = 60;
/** One "Upgrade capacity" adds this many places (price: capacityUpgradeCost in zorps.ts). */
export const CAPACITY_STEP = 20;
export const MAX_DOME_CAPACITY = 200;
/** At or above this share of capacity a dome is "crowded" (and outbreaks get likelier). */
export const CROWDED_AT = 0.8;

export const capacityOf = (d: DomeState) => d.capacity ?? DEFAULT_DOME_CAPACITY;
/** Places still free in a dome (0 when full or over). */
export const roomIn = (d: DomeState) => Math.max(0, capacityOf(d) - residentTotal(d));

export type CapacityLevel = "ok" | "crowded" | "full";
export function capacityLevel(total: number, capacity: number): CapacityLevel {
  const fill = capacity > 0 ? total / capacity : 1;
  return fill >= 1 ? "full" : fill >= CROWDED_AT ? "crowded" : "ok";
}

// --- Lingering outbreaks ----------------------------------------------------------------------
export const isInfected = (d: DomeState) => !!d.outbreak && d.outbreak.years_left > 0;
const yearsWord = (n: number) => `${n} year${n === 1 ? "" : "s"}`;
/** "Disease outbreak: 3 years left" style badge text. */
export const outbreakBadge = (yearsLeft: number) => `Outbreak · ${yearsWord(yearsLeft)} left`;
/** Report line for a dome's outbreak at the end of an advance. */
export function outbreakStatus(hadOutbreak: boolean, end: { years_left: number } | null | undefined): string | null {
  if (end && end.years_left > 0) return `Outbreak continues (${yearsWord(end.years_left)} left).`;
  return hadOutbreak ? "Outbreak ended." : null;
}

export function buildRequest(domes: DomeState[], years = SIM_YEARS, runs = SIM_RUNS): SanctuarySimRequest {
  return {
    domes: domes.map((d) => ({
      id: d.id,
      terrain: d.terrain,
      temperature: d.temperature,
      humidity: d.humidity,
      oxygen: d.oxygen,
      pressure: d.pressure,
      capacity: capacityOf(d),
      ...(isInfected(d) ? { outbreak: d.outbreak } : {}),
      residents: Object.entries(d.residents)
        .filter(([, n]) => n > 0)
        .map(([species_id, count]) => {
          const exposed = Math.min(count, d.exposed?.[species_id] ?? 0);
          return exposed > 0 ? { species_id, count, from_infected: exposed } : { species_id, count };
        }),
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
  const total = domes.reduce((s, d) => s + residentTotal(d), 0);
  return `${used} dome${used === 1 ? "" : "s"} · ${total} animals`;
}

/**
 * Count-weighted average fit of a dome's residents, as the player knows it:
 * only discovered needs count (see knownFit). Null if empty or nothing is
 * discovered for any resident.
 */
export function domeFit(
  dome: DomeState,
  speciesById: Record<string, Pick<Species, "needs">>,
  discoveredFor: (speciesId: string) => readonly NeedKey[],
): number | null {
  let total = 0;
  let weighted = 0;
  for (const [id, n] of Object.entries(dome.residents)) {
    const s = speciesById[id];
    if (!s || n <= 0) continue;
    const { fit } = knownFit(s, dome, discoveredFor(id));
    if (fit === null) continue;
    total += n;
    weighted += n * fit;
  }
  return total > 0 ? weighted / total : null;
}

export const isSite = (n: number) => Number.isInteger(n) && n >= 0 && n < MAX_DOMES;

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
