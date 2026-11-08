// Mirror of the contract in /CLAUDE.md. Keep in sync with the backend.

export type SpeciesStatus =
  | "extinct"
  | "extinct_in_wild"
  | "critically_endangered"
  | "endangered"
  | "vulnerable";

export interface SpeciesSummary {
  id: string;
  name: string;
  scientific_name: string;
  status: SpeciesStatus;
  era: string;
  location: string;
  kind: string;
  lat: number; // degrees, -90 (south) to 90 (north)
  lon: number; // degrees, -180 (west) to 180 (east)
  era_year: number; // the year Glorp travels to; negative = BCE, no year 0
  /** PROPOSED (2026-11-08): how much saving this species adds to the diversity score (default 1). */
  diversity_value?: number;
  /** PROPOSED (2026-11-08): unlock wave 1–3 (absent: the frontend orders by era, newest first). */
  unlock_wave?: number;
}

export interface Hotspot {
  id: string;
  label: string;
  sprite: string;
  x: number; // % from left (0–100)
  y: number; // % from top (0–100)
  fact: string;
  dna: boolean;
  unlocks?: string | null; // legacy, unused
  reveals?: NeedKey | NeedKey[]; // scanning it discovers this need / these needs
}

// ---- Species content (CLAUDE.md "Species content + needs"; agreed) ----
// Everything here is optional: the UI shows whatever is present and skips the rest.
// Uncertain values are marked in the text with "~" (approximate) or "?" (unknown).

export type NeedKey = "terrain" | "temperature" | "humidity" | "oxygen" | "pressure";

/** A bound is a number, or a string when approximate/unknown, e.g. "~18" or "?". */
export type NeedBound = number | string;

export interface Need {
  value?: string; // terrain: a description, e.g. "Forest floor with fallen fruit"
  types?: DomeTerrain[]; // terrain only: dome terrains that suit it
  min?: NeedBound; // the others: a range…
  max?: NeedBound;
  unit?: string; // …in °C, %, % or kPa
  why?: string; // one sentence: why the species needs this
}

export interface SpeciesFacts {
  height?: string;
  weight?: string;
  diet?: string;
  lifespan?: string;
  extinct_year?: string | number;
  cause?: string;
}

export interface Habitat {
  biome?: string;
  climate?: string;
  elevation?: string;
}

export interface Source {
  title: string;
  url: string;
}

export interface Species extends SpeciesSummary {
  hotspots: Hotspot[];
  dna_required: number;
  intro?: string; // ≤ 2 sentences in Glorp's voice (arrival bubble)
  description?: string; // a paragraph (field guide)
  facts?: SpeciesFacts;
  habitat?: Habitat;
  needs?: Partial<Record<NeedKey, Need>>;
  sources?: Source[];
}

export interface Percentiles {
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
}

// ---- Sanctuary sim (CLAUDE.md "Sanctuary sim"; agreed, plus PROPOSED additions) ----

export type DomeTerrain = "forest" | "grassland" | "wetland" | "tundra";

/** A dome's controlled environment. */
export interface DomeConditions {
  terrain: DomeTerrain;
  temperature: number; // °C
  humidity: number; // %
  oxygen: number; // %
  pressure: number; // kPa
}

export interface SpeciesCount {
  species_id: string;
  count: number; // live animals in this dome (clamped to 0..the dome's capacity)
  /**
   * PROPOSED: how many of `count` were moved here from a dome with an active
   * outbreak since the last advance. Each may bring the outbreak along (the
   * backend decides; the frontend only warns).
   */
  from_infected?: number;
}

/** PROPOSED: a lingering disease outbreak in one dome. */
export interface Outbreak {
  years_left: number; // whole years still to run (≥ 1)
  severity: number; // 0..1: fraction of each species in the dome killed per outbreak year
}

export interface SanctuaryDomeInput extends DomeConditions {
  id: string;
  /** PROPOSED: animals this dome holds in all, shared by every species inside (default 60). */
  capacity: number;
  /** PROPOSED: an outbreak already running (from the last advance), or null/absent. */
  outbreak?: Outbreak | null;
  residents: SpeciesCount[];
}

export interface SanctuarySimRequest {
  domes: SanctuaryDomeInput[];
  years: number;
  runs: number;
}

export interface SpeciesSurvival {
  species_id: string;
  survival_probability: number; // fraction of runs with the species alive at the end
}

/** per_species entry of a forecast. */
export interface SpeciesForecast extends SpeciesSurvival {
  /** PROPOSED: fraction of runs with the species alive, for each entry of `years`. */
  survival_by_year?: number[];
}

export interface DomeResult {
  id: string;
  survival_by_species: SpeciesSurvival[]; // alive in THIS dome at the end
  disaster_rate: number; // fraction of runs in which this dome had at least one disaster
}

/** Zorps a run would produce (backend, `app/economy.py`). */
export interface ZorpsEarned {
  total: number;
  per_species: { species_id: string; mean_survivors: number; era_multiplier: number; zorps: number }[];
}

export interface SanctuarySimResponse {
  years: number[];
  species_alive: Percentiles; // number of species alive (in any dome), per year
  sample_paths: number[][]; // 25 runs of species_alive
  per_species: SpeciesForecast[]; // alive in ANY dome at the end
  per_dome: DomeResult[];
  expected_species_saved: number; // mean species alive at the end
  worst_case_species_saved: number; // 5th percentile of species alive at the end
  zorps?: ZorpsEarned; // backend: what the surviving animals would earn
}

// ---- PROPOSED: POST /api/sanctuary/advance (one realised future) ----

export type DisasterType = "breach" | "power" | "meteor" | "disease";

/** Same body as simulate; `years` is 10 for one advance. */
export type SanctuaryAdvanceRequest = SanctuarySimRequest;

export interface AdvanceEvent {
  year: number; // 1..years, within this advance
  type: DisasterType;
  lost: Record<string, number>; // species id -> animals killed (an outbreak: its whole toll in this advance)
  /** PROPOSED, disease only: the outbreak was already running before this advance. */
  ongoing?: boolean;
  /** PROPOSED, disease only: brought in by animals moved from an infected dome. */
  spread?: boolean;
}

export interface AdvanceDome {
  id: string;
  start: Record<string, number>; // species id -> animals at the start
  end: Record<string, number>; // ... and at the end (the new populations)
  events: AdvanceEvent[];
  /** PROPOSED: the outbreak still running at the end (send it back next time), or null. */
  outbreak?: Outbreak | null;
}

export interface SanctuaryAdvanceResponse {
  years: number;
  domes: AdvanceDome[];
  species_alive_end: number;
  /** Fraction of the Monte Carlo runs whose outcome was worse than or equal to this one. */
  luck_percentile: number;
  zorps_earned?: number; // if the backend pays out, this is the source of truth
}

// ---- Zorps economy (backend `GET /api/economy`, proposed by the backend) ----

export interface EconomySpecies {
  species_id: string;
  era_year: number;
  era_label: string;
  era_multiplier: number;
  travel_cost_from_present: number;
}

export interface Economy {
  present_year: number;
  start_zorps: number;
  zorps_per_survivor: number;
  habitat_cost: number;
  travel_base_cost: number;
  era_multiplier_per_decade_of_age: number;
  travel_cost_per_decade_of_age: number;
  species: EconomySpecies[];
}

/** GET /api/wiki/{title}: a Wikipedia summary (cached by the backend). */
export interface WikiSummary {
  title: string;
  summary: string;
  image_url: string | null;
  url: string | null; // the article, for "read more"
}

// ---- Frontend-only below (not part of the backend contract) ----

/** A point in space and time: where/when Glorp's ship is. */
export interface Place {
  lat: number;
  lon: number;
  era_year: number;
}

// What we persist in localStorage
export interface Progress {
  scanned: Record<string, string[]>; // species id -> scanned hotspot ids
  saved: string[]; // species ids rescued (DNA Lab done)
  glorp?: Place; // Glorp's current location; absent = home (see geo.ts)
  zorps?: number; // balance; absent = the starting amount (see game/zorps.ts)
  discovered?: Record<string, NeedKey[]>; // species id -> needs revealed by scanning
  dnaComplete?: string[]; // species whose DNA set is complete (rewarded once)
  rescued?: Record<string, number>; // species id -> best DNA Lab result (individuals)
  dnaBest?: Record<string, DnaResult>; // species id -> best DNA Lab run
  pool?: Record<string, number>; // species id -> rescued animals not yet in a dome
  poolExposed?: Record<string, number>; // ... of which came out of an infected dome since the last advance
  sanctuary?: SanctuaryState;
  // Encyclopedia + progression (frontend-only)
  found?: string[]; // species whose signal was found on the map (pin opened)
  visited?: string[]; // species whose world Glorp has travelled to
  thrived?: string[]; // species that have been thriving at least once (rewarded once)
  unlock?: UnlockState;
  endSeen?: boolean; // the "encyclopedia complete" end screen was shown
}

/** Unlock waves: `wave` = highest wave unlocked; `seenMap`/`seenGuide` = highest wave whose reveal has played there. */
export interface UnlockState {
  wave: number;
  seenMap: number;
  seenGuide: number;
}

/** A DNA Lab minigame result (frontend-only). */
export interface DnaResult {
  quality: number; // 0..1
  individuals: number; // 4..20
}

/** A built dome on Glorp's planet (frontend state). */
export interface DomeState extends DomeConditions {
  id: string;
  site: number; // 0..5, which building site on the planet
  name: string;
  residents: Record<string, number>; // species id -> live animals in this dome
  capacity?: number; // animals in all; absent = DEFAULT_DOME_CAPACITY (game/sanctuary.ts)
  outbreak?: Outbreak | null; // from the last advance
  /** species id -> animals that came from an infected dome since the last advance */
  exposed?: Record<string, number>;
}

/** A forecast, kept for display and compare mode. */
export interface StoredRun {
  key: string; // fingerprint of the domes it was run with (to spot stale results)
  label: string; // e.g. "2 domes · 20 animals"
  at: number; // Date.now()
  result: SanctuarySimResponse;
}

/** The last "Advance 10 years", for the report and the dome summaries. */
export interface StoredAdvance {
  at: number;
  fromYear: number; // sanctuary clock before (0, 10, …)
  toYear: number;
  zorps: number; // Zorps paid out
  domeNames: Record<string, string>; // dome id -> name at the time
  result: SanctuaryAdvanceResponse;
}

export interface SanctuaryState {
  domes: DomeState[];
  year?: number; // sanctuary clock: years advanced so far (0, 10, 20, …)
  lastRun?: StoredRun;
  prevRun?: StoredRun; // the forecast before lastRun, for compare mode
  lastAdvance?: StoredAdvance;
}
