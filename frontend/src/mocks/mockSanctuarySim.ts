// ⚠ MOCK ONLY. A client-side stand-in for POST /api/sanctuary/simulate, used when
// VITE_USE_MOCKS=true. The real model belongs to the backend (see "Proposed:
// sanctuary sim" in CLAUDE.md); this exists so the frontend can be built and
// played before it lands, and to sanity-check the proposed response shape.
//
// Per dome, per species, per year:
//   - logistic growth with rate and carrying capacity scaled by fit (game/fit.ts);
//     a poor fit makes the population shrink
//   - demographic noise, and small populations (< ALLEE) can collapse
// Per dome, per year: disasters (breach, power failure, meteor, disease) hit
// EVERY resident of that dome at once (correlated within a dome, independent
// between domes). A species survives a run if any dome still has it.

import { overallFit } from "../game/fit";
import type { DisasterId } from "../game/sanctuary";
import type { DomeResult, SanctuarySimRequest, SanctuarySimResponse, Species, SpeciesSurvival } from "../types";

/** Yearly chance and fraction killed, per dome. Tuning values, mock only. */
export const MOCK_DISASTERS: Record<DisasterId, { chance: number; kill: number }> = {
  breach: { chance: 0.006, kill: 0.8 },
  power: { chance: 0.015, kill: 0.35 },
  meteor: { chance: 0.003, kill: 0.97 },
  disease: { chance: 0.01, kill: 0.55 },
};

const MAX_GROWTH = 0.3; // yearly growth rate at perfect fit
const DECLINE = 0.08; // growth rate at zero fit is −DECLINE
const CAPACITY = 60; // per species per dome, at perfect fit
const ALLEE = 5; // below this, groups struggle to breed
const SAMPLE_PATHS = 25;

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

/** How many of n individuals survive when each dies with probability p. */
function survivors(n: number, p: number, rand: () => number) {
  if (n > 40) return Math.max(0, Math.round(n * (1 - p) + gaussian(rand) * Math.sqrt(n * p * (1 - p))));
  let k = 0;
  for (let i = 0; i < n; i++) if (rand() >= p) k++;
  return k;
}

function percentile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function mockSanctuarySimulate(
  req: SanctuarySimRequest,
  species: Pick<Species, "id" | "needs">[],
  seed = Date.now(),
): SanctuarySimResponse {
  const rand = rng(seed);
  const byId = new Map(species.map((s) => [s.id, s]));
  const speciesIds = [...new Set(req.domes.flatMap((d) => d.residents.filter((r) => r.count > 0).map((r) => r.species_id)))];
  const years = Array.from({ length: req.years + 1 }, (_, i) => i);

  // Per dome × species: growth parameters from fit.
  const params = req.domes.map((d) =>
    d.residents
      .filter((r) => r.count > 0)
      .map((r) => {
        const s = byId.get(r.species_id);
        const fit = s ? overallFit(s, d) : 0.5;
        return { id: r.species_id, start: r.count, r: MAX_GROWTH * fit - DECLINE * (1 - fit), K: CAPACITY * fit };
      }),
  );

  const aliveByYear: number[][] = years.map(() => []); // [year][run] = species alive
  const speciesAliveRuns = new Map(speciesIds.map((id) => [id, 0]));
  const domeAliveRuns = req.domes.map((_, di) => new Map(params[di].map((p) => [p.id, 0])));
  const domeDisasterRuns = req.domes.map(() => 0);
  const samplePaths: number[][] = [];

  for (let run = 0; run < req.runs; run++) {
    const pop = params.map((ps) => ps.map((p) => p.start));
    const hadDisaster = req.domes.map(() => false);
    const path: number[] = [];

    for (let y = 0; y <= req.years; y++) {
      if (y > 0) {
        for (let di = 0; di < pop.length; di++) {
          // growth + noise + Allee collapse, per species
          for (let si = 0; si < pop[di].length; si++) {
            const { r, K } = params[di][si];
            let n = pop[di][si];
            if (n <= 0) continue;
            const expected = K > 0.5 ? n + r * n * (1 - n / K) : n * (1 - DECLINE);
            n = Math.max(0, Math.round(expected + gaussian(rand) * Math.sqrt(Math.max(expected, 0)) * 0.6));
            if (n > 0 && n < ALLEE && rand() < (ALLEE - n) / (ALLEE * 2)) n -= 1;
            if (n < 2) n = 0; // a lone individual can't breed
            pop[di][si] = n;
          }
          // disasters hit everyone in the dome at once
          for (const { chance, kill } of Object.values(MOCK_DISASTERS)) {
            if (rand() >= chance) continue;
            hadDisaster[di] = true;
            for (let si = 0; si < pop[di].length; si++) pop[di][si] = survivors(pop[di][si], kill, rand);
          }
        }
      }
      // a species is alive if ANY dome still has it
      const alive = speciesIds.filter((id) => pop.some((ps, di) => ps.some((n, si) => n > 0 && params[di][si].id === id))).length;
      aliveByYear[y].push(alive);
      path.push(alive);
    }

    for (const id of speciesIds) {
      if (pop.some((ps, di) => ps.some((n, si) => n > 0 && params[di][si].id === id)))
        speciesAliveRuns.set(id, speciesAliveRuns.get(id)! + 1);
    }
    pop.forEach((ps, di) => {
      ps.forEach((n, si) => {
        if (n > 0) domeAliveRuns[di].set(params[di][si].id, domeAliveRuns[di].get(params[di][si].id)! + 1);
      });
      if (hadDisaster[di]) domeDisasterRuns[di]++;
    });
    if (run < SAMPLE_PATHS) samplePaths.push(path);
  }

  const pct = (q: number) => aliveByYear.map((runs) => percentile([...runs].sort((a, b) => a - b), q));
  const final = [...aliveByYear[req.years]].sort((a, b) => a - b);
  const survival = (id: string, runsAlive: number): SpeciesSurvival => ({
    species_id: id,
    survival_probability: runsAlive / req.runs,
  });

  return {
    years,
    species_alive: { p5: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95) },
    sample_paths: samplePaths,
    per_species: speciesIds.map((id) => survival(id, speciesAliveRuns.get(id)!)),
    per_dome: req.domes.map(
      (d, di): DomeResult => ({
        id: d.id,
        survival_by_species: [...domeAliveRuns[di]].map(([id, n]) => survival(id, n)),
        disaster_rate: domeDisasterRuns[di] / req.runs,
      }),
    ),
    expected_species_saved: final.reduce((a, b) => a + b, 0) / final.length,
    // A whole number of species: the lower nearest-rank 5th percentile (no interpolation).
    worst_case_species_saved: final[Math.floor((final.length - 1) * 0.05)],
  };
}
