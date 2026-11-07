import type {
  Species,
  SpeciesSummary,
  SimulateRequest,
  SimulateResponse,
} from "./types";
import dodo from "./mocks/dodo.json";
import simNone from "./mocks/simulate_none.json";
import simGood from "./mocks/simulate_good.json";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

const mockSpecies = [dodo as Species];

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export async function listSpecies(): Promise<SpeciesSummary[]> {
  if (USE_MOCKS) {
    return mockSpecies.map(
      ({ id, name, scientific_name, status, era, location, kind }) => ({
        id, name, scientific_name, status, era, location, kind,
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

export async function simulate(req: SimulateRequest): Promise<SimulateResponse> {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 400)); // feel like a real request
    return (req.interventions.length > 0 ? simGood : simNone) as SimulateResponse;
  }
  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`/api/simulate -> ${res.status}`);
  return res.json();
}
