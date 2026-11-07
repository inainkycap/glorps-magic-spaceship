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
  era_year: number; // numeric year for the era timeline, e.g. 1600
}

export interface Hotspot {
  id: string;
  label: string;
  sprite: string;
  x: number; // % from left (0–100)
  y: number; // % from top (0–100)
  fact: string;
  dna: boolean;
  unlocks: string | null; // intervention id
  reveals?: NeedKey | NeedKey[]; // PROPOSED: scanning it discovers this need / these needs
}

// ---- PROPOSED species content (see "Proposed: species content + needs" in CLAUDE.md) ----
// Everything here is optional: the UI shows whatever is present and skips the rest.
// Uncertain values are marked in the text with "~" (approximate) or "?" (unknown).

export type NeedKey = "terrain" | "temperature" | "humidity" | "oxygen" | "pressure";

/** A bound is a number, or a string when approximate/unknown, e.g. "~18" or "?". */
export type NeedBound = number | string;

export interface Need {
  value?: string; // terrain: a description, e.g. "Forest floor with fallen fruit"
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

export interface ThreatEffect {
  mortality?: number;
  habitat_decline?: number;
  shock_prob?: number;
  shock_severity?: number;
}

export interface Threat {
  id: string;
  name: string;
  description: string;
  effect: ThreatEffect;
}

export interface Intervention {
  id: string;
  name: string;
  description: string;
  mitigates: Record<string, number>; // threat id -> fraction removed
}

export interface SimConfig {
  model: "logistic" | "predator_prey";
  start_year: number;
  years: number;
  start_population: number;
  carrying_capacity: number;
  growth_rate: number;
}

export interface Species extends SpeciesSummary {
  hotspots: Hotspot[];
  threats: Threat[];
  interventions: Intervention[];
  goal_survival: number;
  max_interventions: number;
  dna_required: number;
  sim: SimConfig;
  // PROPOSED content fields, all optional:
  intro?: string; // ≤ 2 sentences in Glorp's voice (arrival bubble)
  description?: string; // a paragraph (field guide)
  facts?: SpeciesFacts;
  habitat?: Habitat;
  needs?: Partial<Record<NeedKey, Need>>;
  sources?: Source[];
}

export interface SimulateRequest {
  species_id: string;
  interventions: string[];
  runs: number;
}

export interface Percentiles {
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
}

export interface Advice {
  threat_id: string;
  threat_name: string;
  intervention_id: string;
  survival_probability: number;
}

export interface SimulateResponse {
  years: number[];
  percentiles: Percentiles;
  sample_paths: number[][];
  survival_probability: number;
  success: boolean;
  advice: Advice[];
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
  saved: string[]; // species ids saved to the sanctuary
  glorp?: Place; // Glorp's current location; absent = home (see geo.ts)
  fuel?: number; // absent = FUEL_START (see game/fuel.ts)
  discovered?: Record<string, NeedKey[]>; // species id -> needs revealed by scanning
}
