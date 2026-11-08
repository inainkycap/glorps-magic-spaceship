// The backend API, with the mocks as a fallback.
//
// - Default: call the real API (Vite proxies /api to :8000). If it can't be
//   reached (network error, 5xx), or an endpoint the backend hasn't built yet
//   answers 404, fall back to the mocks in src/mocks/ and say so via onFallback().
// - The sanctuary sim is special: Forecast and Advance must use the same model, so
//   simRouter.ts picks the backend for both or the mock for both (onSimSource()).
// - VITE_USE_MOCKS=true: mocks only, never touch the network.
// Real errors (a 404 for an unknown species, a 422) are thrown, not hidden.

import type {
  Economy,
  SanctuaryAdvanceRequest,
  SanctuaryAdvanceResponse,
  SanctuarySimRequest,
  SanctuarySimResponse,
  Species,
  SpeciesSummary,
  WikiSummary,
} from "./types";
import { mockSanctuaryAdvance, mockSanctuarySimulate } from "./mocks/mockSanctuarySim";
import { eraMultiplier, FALLBACK_ECONOMY, travelCost } from "./game/zorps";
import { formatEra, PRESENT_YEAR } from "./game/time";
import { createSimRouter, type SimSource } from "./simRouter";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// Copies of backend/data/species/*.json (the backend files are the source of truth).
const mockModules = import.meta.glob("./mocks/species/*.json", { eager: true, import: "default" });
const mockSpecies = Object.values(mockModules) as Species[];

class HttpError extends Error {
  path: string;
  status: number;
  constructor(path: string, status: number) {
    super(`${path} -> ${status}`);
    this.path = path;
    this.status = status;
  }
}

// --- fallback reporting ---------------------------------------------------------------
const fallbackListeners = new Set<(what: string) => void>();
const fellBack = new Set<string>();
/** Subscribe to "this call is using built-in mock data". Returns an unsubscribe. */
export function onFallback(fn: (what: string) => void) {
  fallbackListeners.add(fn);
  fellBack.forEach((w) => fn(w));
  return () => {
    fallbackListeners.delete(fn);
  };
}
function reportFallback(what: string, why: unknown) {
  if (!fellBack.has(what)) console.warn(`[api] ${what}: using built-in mock data (${String(why)})`);
  fellBack.add(what);
  fallbackListeners.forEach((fn) => fn(what));
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new HttpError(path, res.status);
  return res.json();
}

/**
 * Real first, mock second. Falls back on network errors and 5xx; on 404 only
 * when `missingEndpoint` (the backend hasn't built it), never for "not found" data.
 */
async function withFallback<T>(
  what: string,
  real: () => Promise<T>,
  mock: () => T | Promise<T>,
  { missingEndpoint = false } = {},
): Promise<T> {
  if (USE_MOCKS) return mock();
  try {
    return await real();
  } catch (e) {
    const fallBack = !(e instanceof HttpError) || e.status >= 500 || (missingEndpoint && e.status === 404);
    if (!fallBack) throw e;
    reportFallback(what, e);
    return mock();
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// --- endpoints -----------------------------------------------------------------------

export async function listSpecies(): Promise<SpeciesSummary[]> {
  return withFallback("species list", () => call("/api/species"), () =>
    mockSpecies.map(({ id, name, scientific_name, status, era, location, kind, lat, lon, era_year }) => ({
      id, name, scientific_name, status, era, location, kind, lat, lon, era_year,
    })),
  );
}

export async function getSpecies(id: string): Promise<Species> {
  return withFallback(`species ${id}`, () => call(`/api/species/${encodeURIComponent(id)}`), () => {
    const s = mockSpecies.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown species ${id}`);
    return s;
  });
}

/** Full species files for several ids (unknown ids are skipped). */
export async function getSpeciesMany(ids: string[]): Promise<Species[]> {
  const results = await Promise.allSettled(ids.map((id) => getSpecies(id)));
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

// Forecast and Advance always use the same model (see simRouter.ts): the backend for
// both once it has /api/sanctuary/advance, else the built-in mock for both.
const sim = createSimRouter({
  post: (path, body) => call(path, post(body)),
  mockSimulate: async (req) => {
    await delay(300);
    return mockSanctuarySimulate(req, mockSpecies);
  },
  mockAdvance: async (req) => {
    await delay(300);
    return mockSanctuaryAdvance(req, mockSpecies);
  },
  forceMock: USE_MOCKS,
});

/** POST /api/sanctuary/simulate (a forecast of many futures), or the mock: same model as advance. */
export function simulateSanctuary(req: SanctuarySimRequest): Promise<SanctuarySimResponse> {
  return sim.simulate(req);
}

/** PROPOSED POST /api/sanctuary/advance (one realised future), or the mock: same model as forecast. */
export function advanceSanctuary(req: SanctuaryAdvanceRequest): Promise<SanctuaryAdvanceResponse> {
  return sim.advance(req);
}

/** Subscribe to which model runs the sanctuary ("backend" | "mock"). Returns an unsubscribe. */
export const onSimSource = (fn: (s: SimSource) => void) => sim.onSource(fn);
/** Work out which model will run Forecast/Advance (so the "offline sim" badge shows before the first run). */
export const checkSimSource = () => sim.check();

/** GET /api/economy (backend-proposed Zorps numbers); offline: the same numbers, built locally. */
export async function getEconomy(): Promise<Economy> {
  return withFallback("economy", () => call("/api/economy"), () => ({
    present_year: PRESENT_YEAR,
    start_zorps: FALLBACK_ECONOMY.start_zorps,
    zorps_per_survivor: FALLBACK_ECONOMY.zorps_per_survivor,
    habitat_cost: FALLBACK_ECONOMY.habitat_cost,
    travel_base_cost: 0,
    era_multiplier_per_decade_of_age: FALLBACK_ECONOMY.era_multiplier_per_decade_of_age,
    travel_cost_per_decade_of_age: 0,
    species: [...mockSpecies]
      .sort((a, b) => a.era_year - b.era_year)
      .map((s) => ({
        species_id: s.id,
        era_year: s.era_year,
        era_label: formatEra(s.era_year),
        era_multiplier: eraMultiplier(s.id, s.era_year),
        travel_cost_from_present: travelCost({ lat: 0, lon: 0, era_year: PRESENT_YEAR }, { lat: 1, lon: 1, era_year: s.era_year }),
      })),
  }), { missingEndpoint: true });
}

/**
 * GET /api/wiki/{title}: a Wikipedia summary (the backend caches it). Optional
 * extra: any failure (offline, 404, mock mode) gives null and the UI hides it.
 */
export async function getWiki(title: string): Promise<WikiSummary | null> {
  if (USE_MOCKS || !title.trim()) return null;
  try {
    const w = await call<WikiSummary>(`/api/wiki/${encodeURIComponent(title)}`);
    return typeof w?.summary === "string" && w.summary.trim() ? w : null;
  } catch {
    return null;
  }
}

/** The Wikipedia article title from a species' sources (the part after /wiki/), if any. */
export function wikiTitleOf(sources: { url: string }[] | undefined): string | null {
  for (const s of sources ?? []) {
    const m = /^https?:\/\/[a-z-]+\.wikipedia\.org\/wiki\/([^?#]+)/i.exec(s.url ?? "");
    if (m) {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    }
  }
  return null;
}
