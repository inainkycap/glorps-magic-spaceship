import type {
  SanctuarySimRequest,
  SanctuarySimResponse,
  Species,
  SpeciesSummary,
  SimulateRequest,
  SimulateResponse,
} from "./types";
import dodo from "./mocks/dodo.json";
import { mockSanctuarySimulate } from "./mocks/mockSanctuarySim";
import passengerPigeon from "./mocks/passenger_pigeon.json";
import simNone from "./mocks/simulate_none.json";
import simGood from "./mocks/simulate_good.json";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// JSON imports infer narrow literal types, so go through unknown.
const mockSpecies = [dodo, passengerPigeon] as unknown as Species[];

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export async function listSpecies(): Promise<SpeciesSummary[]> {
  if (USE_MOCKS) {
    return mockSpecies.map(
      ({ id, name, scientific_name, status, era, location, kind, lat, lon, era_year }) => ({
        id, name, scientific_name, status, era, location, kind, lat, lon, era_year,
      }),
    );
  }
  return get("/api/species");
}

export async function getSpecies(id: string): Promise<Species> {
  if (USE_MOCKS) {
    const s = mockSpecies.find((x) => x.id === id);
    if (!s) throw new Error(`no mock species ${id}`);
    return s;
  }
  return get(`/api/species/${id}`);
}

/** Full species files for several ids (unknown ids are skipped). */
export async function getSpeciesMany(ids: string[]): Promise<Species[]> {
  const results = await Promise.allSettled(ids.map((id) => getSpecies(id)));
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

/**
 * PROPOSED: POST /api/sanctuary/simulate (see CLAUDE.md). In mock mode this runs
 * the client-side MOCK model in src/mocks/mockSanctuarySim.ts.
 */
export async function simulateSanctuary(req: SanctuarySimRequest): Promise<SanctuarySimResponse> {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 400)); // feel like a real request
    return mockSanctuarySimulate(req, mockSpecies);
  }
  const res = await fetch("/api/sanctuary/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`/api/sanctuary/simulate -> ${res.status}`);
  return res.json();
}

/** Legacy: the old Lab's single-species sim (no longer used by the UI). */
export async function simulate(req: SimulateRequest): Promise<SimulateResponse> {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 400)); // feel like a real request
    const base = (req.interventions.length > 0 ? simGood : simNone) as SimulateResponse;
    // The mock runs are the dodo's (from 1600); shift the years to the requested species.
    const start = mockSpecies.find((x) => x.id === req.species_id)?.sim.start_year;
    if (start === undefined) return base;
    return { ...base, years: base.years.map((y) => y - base.years[0] + start) };
  }
  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`/api/simulate -> ${res.status}`);
  return res.json();
}
