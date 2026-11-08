// ⚠ MOCK ONLY. Client-side stand-ins for the sanctuary endpoints, used when the
// backend is unreachable (or VITE_USE_MOCKS=true), and for the PROPOSED parts the
// backend hasn't built yet (survival_by_year, POST /api/sanctuary/advance, dome
// capacity, lingering outbreaks).
//
// It follows the backend's model (backend/app/sanctuary/engine.py, backend/MODEL.md)
// so fallback numbers look like the real ones, plus the PROPOSED changes (CLAUDE.md
// "Notes for backend"). Per dome, per species, per year:
//   births ~ Poisson( b · N · N/(N + A) · max(0, 1 − T/K) ),  b = BIRTH · fit
//   deaths ~ Binomial( N, m ),  m = DEATH_MIN + DEATH_POOR_FIT · (1 − fit)
// where T = all animals in the dome and K = the dome's capacity (shared by every
// species inside; the total never exceeds it). Then the sudden disasters (breach,
// power, meteor) strike each dome with their yearly chance and hit EVERY resident
// at once (correlated within a dome, independent between domes). Disease is an
// OUTBREAK: it starts with a chance that rises once the dome is over 80% full,
// lasts several years, and kills a fraction (its severity) of each species every
// year. Animals moved in from an infected dome may bring it with them. A
// population of 0 or 1 is extinct. A species is alive if ANY dome has it.

import { overallFit } from "../game/fit";
import type {
  AdvanceDome,
  AdvanceEvent,
  DisasterType,
  DomeResult,
  Outbreak,
  SanctuaryAdvanceRequest,
  SanctuaryAdvanceResponse,
  SanctuarySimRequest,
  SanctuarySimResponse,
  Species,
  SpeciesForecast,
} from "../types";

/** Copy of backend/data/sanctuary.json + the PROPOSED capacity/outbreak tuning (mock only). */
export const MOCK_MODEL = {
  birthRate: 0.5,
  deathRateMin: 0.12,
  deathRatePoorFit: 0.5,
  allee: 2,
  disasters: {
    breach: { chance: 0.006, kill: 0.8 },
    power: { chance: 0.015, kill: 0.35 },
    meteor: { chance: 0.003, kill: 0.97 },
    disease: { chance: 0.01, kill: 0.55 }, // chance = base yearly outbreak chance; kill unused (see outbreak)
  } satisfies Record<DisasterType, { chance: number; kill: number }>,
  /** PROPOSED: a dome's capacity when the request doesn't say. */
  defaultCapacity: 60,
  /** PROPOSED: lingering outbreaks. */
  outbreak: {
    crowdedAt: 0.8, // above this fill, the outbreak chance rises…
    crowdBoost: 4, // …linearly, up to (1 + crowdBoost) × the base chance when full
    minYears: 3, // an outbreak lasts minYears..maxYears (counting the year it starts)
    maxYears: 5,
    severity: 0.2, // fraction of each species killed per outbreak year
    carryChance: 0.15, // per animal moved in from an infected dome: brings the outbreak along
  },
};

/** Capacity (and per-species counts) are clamped to 1..this. */
export const MOCK_MAX_CAPACITY = 200;
const SAMPLE_PATHS = 25;
const ADVANCE_RUNS = 500;

/** Small seeded PRNG (mulberry32), so tests are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function poisson(lambda: number, rand: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(rand)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

function binomial(n: number, p: number, rand: () => number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n > 40) return Math.min(n, Math.max(0, Math.round(n * p + gaussian(rand) * Math.sqrt(n * p * (1 - p)))));
  let k = 0;
  for (let i = 0; i < n; i++) if (rand() < p) k++;
  return k;
}

function percentile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const clampInt = (n: number | undefined, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n! : 0)));
const SUDDEN: DisasterType[] = ["breach", "power", "meteor"];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Yearly chance that an outbreak starts in a dome with `total` animals and this capacity. */
export function outbreakChance(total: number, capacity: number): number {
  const { crowdedAt, crowdBoost } = MOCK_MODEL.outbreak;
  const fill = capacity > 0 ? total / capacity : 1;
  const over = Math.min(1, Math.max(0, (fill - crowdedAt) / (1 - crowdedAt)));
  return MOCK_MODEL.disasters.disease.chance * (1 + crowdBoost * over);
}

const cleanOutbreak = (o: Outbreak | null | undefined): Outbreak | null =>
  o && Number.isFinite(o.years_left) && o.years_left >= 1
    ? { years_left: clampInt(o.years_left, 1, 20), severity: Math.min(1, Math.max(0, Number(o.severity) || 0)) }
    : null;

/** Remove animals until the dome is at capacity, proportionally to each species' share. */
function trimToCapacity(row: number[], capacity: number) {
  const total = sum(row);
  if (total <= capacity) return;
  const scaled = row.map((n) => (n * capacity) / total);
  const out = scaled.map(Math.floor);
  let left = capacity - sum(out);
  const order = scaled.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) if (left-- > 0) out[i]++;
  out.forEach((n, i) => (row[i] = n));
}

/** Set up one simulation: species columns, start counts, per-dome×species rates, capacity, outbreaks. */
function prepare(req: SanctuarySimRequest, species: Pick<Species, "id" | "needs">[]) {
  const byId = new Map(species.map((s) => [s.id, s]));
  const capacity = req.domes.map((d) => clampInt(d.capacity ?? MOCK_MODEL.defaultCapacity, 1, MOCK_MAX_CAPACITY));
  const ids: string[] = [];
  req.domes.forEach((d, di) => {
    for (const r of d.residents) if (clampInt(r.count, 0, capacity[di]) > 0 && !ids.includes(r.species_id)) ids.push(r.species_id);
  });
  const col = new Map(ids.map((id, i) => [id, i]));
  const start = req.domes.map(() => ids.map(() => 0));
  const birth = req.domes.map(() => ids.map(() => 0));
  const death = req.domes.map(() => ids.map(() => 0));
  const exposed = req.domes.map(() => 0);
  req.domes.forEach((d, di) => {
    for (const r of d.residents) {
      const n = clampInt(r.count, 0, capacity[di]);
      if (n === 0) continue;
      const si = col.get(r.species_id)!;
      start[di][si] += n;
      exposed[di] += clampInt(r.from_infected, 0, n);
      const s = byId.get(r.species_id);
      const fit = s ? overallFit(s, d) : 0.5;
      birth[di][si] = MOCK_MODEL.birthRate * fit;
      death[di][si] = Math.min(1, MOCK_MODEL.deathRatePoorFit * (1 - fit) + MOCK_MODEL.deathRateMin);
    }
    trimToCapacity(start[di], capacity[di]);
  });
  const outbreak = req.domes.map((d) => cleanOutbreak(d.outbreak));
  return { ids, start, birth, death, capacity, exposed, outbreak };
}
type Setup = ReturnType<typeof prepare>;

/** "new": a fresh outbreak or sudden disaster; "spread": an outbreak brought in by moved animals; "continues": an outbreak's later years. */
type EventKind = "new" | "spread" | "continues";
type OnEvent = (dome: number, type: DisasterType, lost: number[], kind: EventKind) => void;

/** One run's starting state: populations, outbreaks, and which domes catch an outbreak from moved-in animals. */
function startRun(setup: Setup, rand: () => number) {
  const N = setup.start.map((row) => [...row]);
  const ob = setup.outbreak.map((o) => (o ? { ...o } : null));
  const { carryChance } = MOCK_MODEL.outbreak;
  const caught = setup.exposed.map((k, d) => !ob[d] && k > 0 && rand() < 1 - (1 - carryChance) ** k);
  return { N, ob, caught };
}

/** Step one run forward one year (year = 1, 2, …), in place. */
function stepYear(
  setup: Setup,
  run: ReturnType<typeof startRun>,
  year: number,
  rand: () => number,
  onEvent?: OnEvent,
) {
  const { birth, death, capacity } = setup;
  const { N, ob, caught } = run;
  const { allee, disasters, outbreak } = MOCK_MODEL;
  for (let d = 0; d < N.length; d++) {
    const room = Math.max(0, 1 - sum(N[d]) / capacity[d]);
    for (let s = 0; s < N[d].length; s++) {
      const n = N[d][s];
      if (n <= 0) continue;
      const births = poisson(birth[d][s] * n * (n / (n + allee)) * room, rand);
      const deaths = binomial(n, death[d][s], rand);
      N[d][s] = n + births - deaths;
    }
    trimToCapacity(N[d], capacity[d]);

    for (const type of SUDDEN) {
      const { chance, kill } = disasters[type];
      if (rand() >= chance) continue;
      const lost = N[d].map((n) => n - binomial(n, 1 - kill, rand));
      N[d] = N[d].map((n, s) => n - lost[s]);
      onEvent?.(d, type, lost, "new");
    }

    // Disease: an ongoing outbreak keeps killing; otherwise one may start.
    let kind: EventKind = "continues";
    if (!ob[d]) {
      const spread = year === 1 && caught[d];
      if (spread || (sum(N[d]) > 0 && rand() < outbreakChance(sum(N[d]), capacity[d]))) {
        const years = outbreak.minYears + Math.floor(rand() * (outbreak.maxYears - outbreak.minYears + 1));
        ob[d] = { years_left: years, severity: outbreak.severity };
        kind = spread ? "spread" : "new";
      }
    }
    const o = ob[d];
    if (o) {
      const lost = N[d].map((n) => binomial(n, o.severity, rand));
      N[d] = N[d].map((n, s) => n - lost[s]);
      onEvent?.(d, "disease", lost, kind);
      o.years_left -= 1;
      if (o.years_left <= 0) ob[d] = null;
    }
    N[d] = N[d].map((n) => (n < 2 ? 0 : n));
  }
}

const aliveSpecies = (N: number[][], S: number) => {
  let k = 0;
  for (let s = 0; s < S; s++) if (N.some((row) => row[s] > 0)) k++;
  return k;
};

/** Mock of POST /api/sanctuary/simulate (incl. the PROPOSED per_species[].survival_by_year). */
export function mockSanctuarySimulate(
  req: SanctuarySimRequest,
  species: Pick<Species, "id" | "needs">[],
  seed = Date.now(),
): SanctuarySimResponse {
  const rand = rng(seed);
  const setup = prepare(req, species);
  const { ids, start } = setup;
  const S = ids.length;
  const Y = req.years;
  const years = Array.from({ length: Y + 1 }, (_, i) => i);
  const aliveByYear: number[][] = years.map(() => []);
  const speciesAliveByYear = ids.map(() => years.map(() => 0));
  const domeAlive = req.domes.map(() => ids.map(() => 0));
  const domeDisaster = req.domes.map(() => 0);
  const samplePaths: number[][] = [];

  for (let r = 0; r < req.runs; r++) {
    const run = startRun(setup, rand);
    const hit = req.domes.map(() => false);
    const path: number[] = [];
    for (let y = 0; y <= Y; y++) {
      if (y > 0) stepYear(setup, run, y, rand, (d) => (hit[d] = true));
      const alive = aliveSpecies(run.N, S);
      aliveByYear[y].push(alive);
      path.push(alive);
      for (let s = 0; s < S; s++) if (run.N.some((row) => row[s] > 0)) speciesAliveByYear[s][y]++;
    }
    run.N.forEach((row, d) => {
      row.forEach((n, s) => n > 0 && domeAlive[d][s]++);
      if (hit[d]) domeDisaster[d]++;
    });
    if (r < SAMPLE_PATHS) samplePaths.push(path);
  }

  const pct = (q: number) => aliveByYear.map((runs) => percentile([...runs].sort((a, b) => a - b), q));
  const final = [...aliveByYear[Y]].sort((a, b) => a - b);
  const per_species: SpeciesForecast[] = ids.map((id, s) => ({
    species_id: id,
    survival_probability: speciesAliveByYear[s][Y] / req.runs,
    survival_by_year: speciesAliveByYear[s].map((k) => k / req.runs),
  }));
  return {
    years,
    species_alive: { p5: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95) },
    sample_paths: samplePaths,
    per_species,
    per_dome: req.domes.map(
      (d, di): DomeResult => ({
        id: d.id,
        survival_by_species: ids
          .map((id, s) => ({ id, s }))
          .filter(({ s }) => start[di][s] > 0)
          .map(({ id, s }) => ({ species_id: id, survival_probability: domeAlive[di][s] / req.runs })),
        disaster_rate: domeDisaster[di] / req.runs,
      }),
    ),
    expected_species_saved: final.reduce((a, b) => a + b, 0) / Math.max(1, final.length),
    worst_case_species_saved: final[Math.floor((final.length - 1) * 0.05)] ?? 0,
  };
}

/**
 * Mock of the PROPOSED POST /api/sanctuary/advance: run the Monte Carlo, pick ONE
 * run at random as what really happened, and report how lucky it was:
 * luck_percentile = fraction of runs whose outcome (species alive at the end, then
 * total animals) was worse than or equal to the chosen one. Each dome's outbreak
 * state at the end comes back so the frontend can send it next time.
 */
export function mockSanctuaryAdvance(
  req: SanctuaryAdvanceRequest,
  species: Pick<Species, "id" | "needs">[],
  seed = Date.now(),
): SanctuaryAdvanceResponse {
  const rand = rng(seed);
  const setup = prepare(req, species);
  const { ids, start } = setup;
  const S = ids.length;
  const runs = Math.max(10, Math.min(ADVANCE_RUNS, req.runs || ADVANCE_RUNS));
  const chosen = Math.floor(rand() * runs);
  const outcomes: [number, number][] = [];
  let chosenRun: ReturnType<typeof startRun> | null = null;
  const events: AdvanceEvent[][] = req.domes.map(() => []);
  const currentOutbreak: (AdvanceEvent | null)[] = req.domes.map(() => null);
  let y = 0; // the year being stepped (for event records)

  const record: OnEvent = (d, type, lost, kind) => {
    const lostBy: Record<string, number> = {};
    lost.forEach((n, s) => n > 0 && (lostBy[ids[s]] = n));
    if (type !== "disease") return void events[d].push({ year: y, type, lost: lostBy });
    const cur = currentOutbreak[d];
    if (kind === "continues" && cur) {
      for (const [id, n] of Object.entries(lostBy)) cur.lost[id] = (cur.lost[id] ?? 0) + n;
    } else {
      const e: AdvanceEvent = { year: y, type, lost: lostBy };
      if (kind === "continues") e.ongoing = true; // carried over from before this advance
      if (kind === "spread") e.spread = true; // brought in by animals from an infected dome
      events[d].push(e);
      currentOutbreak[d] = e;
    }
  };

  for (let r = 0; r < runs; r++) {
    const run = startRun(setup, rand);
    for (y = 1; y <= req.years; y++) {
      stepYear(setup, run, y, rand, r === chosen ? record : undefined);
      if (r === chosen) run.ob.forEach((o, d) => !o && (currentOutbreak[d] = null));
    }
    outcomes.push([aliveSpecies(run.N, S), sum(run.N.flat())]);
    if (r === chosen) chosenRun = run;
  }

  const [ca, ct] = outcomes[chosen];
  const worseOrEqual = outcomes.filter(([a, t]) => a < ca || (a === ca && t <= ct)).length;
  const toRecord = (row: number[], keep: (s: number) => boolean) => {
    const out: Record<string, number> = {};
    row.forEach((n, s) => keep(s) && (out[ids[s]] = n));
    return out;
  };
  const domes: AdvanceDome[] = req.domes.map((d, di) => ({
    id: d.id,
    start: toRecord(start[di], (s) => start[di][s] > 0),
    end: toRecord(chosenRun!.N[di], (s) => start[di][s] > 0),
    events: events[di],
    outbreak: chosenRun!.ob[di] ? { ...chosenRun!.ob[di]! } : null,
  }));
  return {
    years: req.years,
    domes,
    species_alive_end: ca,
    luck_percentile: worseOrEqual / runs,
  };
}
