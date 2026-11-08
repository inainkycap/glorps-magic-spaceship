// Which sanctuary model runs Forecast and Advance: the backend's or the built-in mock.
//
// Forecast and Advance must use the SAME model, or the forecast promises one thing
// and the decade that actually happens follows different rules (the backend has no
// capacity or lingering outbreaks yet; the mock does). So:
//   - Ask once whether the backend has POST /api/sanctuary/advance (a probe; 404 =
//     not built yet). If it does, use the backend for BOTH; if not, the mock for BOTH.
//   - If a backend call later fails (network error, 5xx, or 404 = endpoint gone),
//     switch both to the mock. Real request errors (422 …) are thrown, not hidden.
//   - While on the mock because of a failure, check the backend again after a while.
// Pure (no fetch, no globals), so it's unit-tested in simRouter.test.ts.

import type { SanctuaryAdvanceRequest, SanctuaryAdvanceResponse, SanctuarySimRequest, SanctuarySimResponse } from "./types";

export type SimSource = "backend" | "mock";

export interface SimRouterDeps {
  /** POST JSON to the backend. Must throw an error with a numeric `status` for HTTP errors. */
  post: <T>(path: string, body: unknown) => Promise<T>;
  mockSimulate: (req: SanctuarySimRequest) => SanctuarySimResponse | Promise<SanctuarySimResponse>;
  mockAdvance: (req: SanctuaryAdvanceRequest) => SanctuaryAdvanceResponse | Promise<SanctuaryAdvanceResponse>;
  /** VITE_USE_MOCKS=true: always the mock, never touch the network. */
  forceMock?: boolean;
  now?: () => number;
}

export const SIMULATE_PATH = "/api/sanctuary/simulate";
export const ADVANCE_PATH = "/api/sanctuary/advance";
/** A cheap, harmless request: any answer but 404 (even a 422) means the endpoint exists. */
export const ADVANCE_PROBE = { domes: [], years: 1, runs: 1 };
/** After falling back, look for the backend again this often. */
export const RECHECK_MS = 60_000;

const statusOf = (e: unknown): number | undefined => {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
};
/** Network error, 5xx, or 404 (endpoint not built / gone): use the mock instead. */
const isUnavailable = (e: unknown) => {
  const s = statusOf(e);
  return s === undefined || s >= 500 || s === 404;
};

export function createSimRouter(deps: SimRouterDeps) {
  const now = deps.now ?? Date.now;
  let source: SimSource | null = deps.forceMock ? "mock" : null;
  let checkedAt = 0;
  let probing: Promise<SimSource> | null = null;
  const listeners = new Set<(s: SimSource) => void>();

  const set = (s: SimSource) => {
    const changed = s !== source;
    source = s;
    checkedAt = now();
    if (changed) listeners.forEach((fn) => fn(s));
  };

  /** The model to use right now (probes the backend when unknown or due a re-check). */
  async function resolve(): Promise<SimSource> {
    if (deps.forceMock) return "mock";
    if (source === "backend") return source;
    if (source === "mock" && now() - checkedAt < RECHECK_MS) return source;
    probing ??= deps
      .post(ADVANCE_PATH, ADVANCE_PROBE)
      .then(
        () => set("backend"),
        (e) => set(isUnavailable(e) ? "mock" : "backend"),
      )
      .then(() => source!)
      .finally(() => (probing = null));
    return probing;
  }

  async function run<Req, Res>(path: string, req: Req, mock: (r: Req) => Res | Promise<Res>): Promise<Res> {
    if ((await resolve()) === "mock") return mock(req);
    try {
      return await deps.post<Res>(path, req);
    } catch (e) {
      if (!isUnavailable(e)) throw e;
      set("mock"); // from now on, Forecast AND Advance use the mock
      return mock(req);
    }
  }

  return {
    simulate: (req: SanctuarySimRequest) => run(SIMULATE_PATH, req, deps.mockSimulate),
    advance: (req: SanctuaryAdvanceRequest) => run(ADVANCE_PATH, req, deps.mockAdvance),
    /** Find out which model will run (probes the backend if needed), e.g. to show the badge early. */
    check: resolve,
    /** The model in use, or null before the first check. */
    source: (): SimSource | null => source,
    /** Subscribe to model changes (called immediately if already known). Returns an unsubscribe. */
    onSource(fn: (s: SimSource) => void) {
      listeners.add(fn);
      if (source) fn(source);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
