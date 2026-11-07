"""Monte Carlo sanctuary sim: every run, dome and species stepped together with numpy.

State: N[run, dome, species] = whole individuals. Each year, for every dome and species:

  births  ~ Poisson( b * N * N/(N + A) / (1 + N_dome/C) )
  deaths  ~ Binomial( N, m )
  N      <- N + births - deaths

  b = birth_rate * fit                       a poor fit means fewer births...
  m = death_rate_min + death_rate_poor_fit * (1 - fit)   ...and more deaths
  N/(N + A)      Allee effect: in a tiny group it's hard to find a mate
  1/(1 + N_dome/C)  crowding: every species in a dome shares its space (C = dome_capacity)

Then each disaster type strikes each dome with its yearly `chance`. A strike hits every
resident of that dome at once (each dies with probability `kill`): correlated within a dome,
independent between domes, which is why splitting a species across domes is safer.
Finally a population of 0 or 1 is extinct (a lone animal can't breed).

A species is alive in a run if ANY dome still has it.
"""
import math
from typing import Optional

import numpy as np

from ..economy import zorps_earned
from ..schemas import Species
from .config import CONFIG, SanctuaryConfig
from .fit import overall_fit
from .schemas import (
    DomeResult,
    Percentiles,
    SanctuarySimRequest,
    SanctuarySimResponse,
    SpeciesSurvival,
)

SAMPLE_PATHS = 25


def simulate(
    req: SanctuarySimRequest,
    species_by_id: dict[str, Species],
    cfg: SanctuaryConfig = CONFIG,
    seed: Optional[int] = None,
) -> SanctuarySimResponse:
    # Species that are actually placed somewhere, in first-seen order.
    species_ids: list[str] = []
    for dome in req.domes:
        for r in dome.residents:
            if r.count > 0 and r.species_id not in species_ids:
                species_ids.append(r.species_id)
    col = {sid: i for i, sid in enumerate(species_ids)}

    D, S, R, Y = len(req.domes), len(species_ids), req.runs, req.years

    # Per dome x species: starting counts and fit.
    start = np.zeros((D, S), dtype=np.int64)
    fit = np.zeros((D, S))
    for d, dome in enumerate(req.domes):
        for r in dome.residents:
            if r.count > 0:
                s = col[r.species_id]
                start[d, s] += r.count
                fit[d, s] = overall_fit(species_by_id[r.species_id], dome, cfg)

    birth = cfg.birth_rate * fit
    death = np.clip(cfg.death_rate_min + cfg.death_rate_poor_fit * (1 - fit), 0, 1)
    disasters = list(cfg.disasters.values())
    chance = np.array([x.chance for x in disasters])
    survive = np.array([1 - x.kill for x in disasters])

    rng = np.random.default_rng(seed)
    N = np.broadcast_to(start, (R, D, S)).copy()
    had_disaster = np.zeros((R, D), dtype=bool)
    alive = np.zeros((Y + 1, R), dtype=np.int64)  # species alive (in any dome), per year, per run
    alive[0] = (N > 0).any(axis=1).sum(axis=1)

    for y in range(1, Y + 1):
        crowd = 1 / (1 + N.sum(axis=2, keepdims=True) / cfg.dome_capacity)
        mate = N / (N + cfg.allee)
        births = rng.poisson(birth * N * mate * crowd)
        deaths = rng.binomial(N, death)
        N = N + births - deaths

        hits = rng.random((R, D, len(disasters))) < chance  # [run, dome, disaster type]
        had_disaster |= hits.any(axis=2)
        for t in range(len(disasters)):
            hit = hits[:, :, t, None]  # broadcasts over species: the whole dome is hit
            if hit.any():
                N = np.where(hit, rng.binomial(N, survive[t]), N)

        N[N < 2] = 0
        alive[y] = (N > 0).any(axis=1).sum(axis=1)

    # ---- summarise ----
    final_sorted = np.sort(alive[Y])
    pct = {f"p{q}": np.percentile(alive, q, axis=1).tolist() for q in (5, 25, 50, 75, 95)}
    alive_anywhere = (N > 0).any(axis=1).mean(axis=0)  # [species]
    alive_in_dome = (N > 0).mean(axis=0)  # [dome, species]
    mean_survivors = N.sum(axis=1).mean(axis=0)  # [species]: animals alive at the end, all domes

    per_dome = []
    for d, dome in enumerate(req.domes):
        placed = list(dict.fromkeys(r.species_id for r in dome.residents if r.count > 0))
        per_dome.append(
            DomeResult(
                id=dome.id,
                survival_by_species=[
                    SpeciesSurvival(species_id=sid, survival_probability=float(alive_in_dome[d, col[sid]]))
                    for sid in placed
                ],
                disaster_rate=float(had_disaster[:, d].mean()),
            )
        )

    return SanctuarySimResponse(
        years=list(range(Y + 1)),
        species_alive=Percentiles(**pct),
        sample_paths=alive[:, :SAMPLE_PATHS].T.tolist(),
        per_species=[
            SpeciesSurvival(species_id=sid, survival_probability=float(alive_anywhere[s]))
            for s, sid in enumerate(species_ids)
        ],
        per_dome=per_dome,
        expected_species_saved=float(alive[Y].mean()),
        worst_case_species_saved=int(final_sorted[math.floor((R - 1) * 0.05)]),
        zorps=zorps_earned(
            {sid: float(mean_survivors[i]) for i, sid in enumerate(species_ids)},
            {sid: species_by_id[sid].era_year for sid in species_ids},
        ),
    )
