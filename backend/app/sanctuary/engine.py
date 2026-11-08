"""Monte Carlo sanctuary sim: every run, dome and species stepped together with numpy.

State: N[run, dome, species] = whole animals. Each year, in every dome:

  births ~ Poisson( b * N * N/(N + A) * max(0, 1 - T/K) )     b = birth_rate * fit
  deaths ~ Binomial( N, m )                                    m = death_min + death_poor_fit * (1 - fit)
  N <- N + births - deaths, then trimmed back to K if over

  N/(N + A)          Allee effect: in a tiny group it's hard to find a mate
  max(0, 1 - T/K)    crowding: T = all animals in the dome, K = the dome's capacity, which
                     every species inside shares (the total never exceeds it)

Then the sudden disasters (breach, power failure, meteor) strike each dome with their
yearly chance and hit EVERY resident at once (each dies with probability `kill`):
correlated within a dome, independent between domes.

Disease is an OUTBREAK: in a dome without one, it starts with a base yearly chance that
rises once the dome is over `crowded_at` full (up to (1 + crowd_boost) x base when full),
lasts min_years..max_years, and kills `severity` of each species every year while it runs.
Animals moved in from an infected dome (`from_infected`) may bring it with them: each
starts it in year 1 with `carry_chance`. Finally a population of 0 or 1 is extinct.

A species is alive in a run if ANY dome still has it. See backend/MODEL.md.
"""
import hashlib
import math
from dataclasses import dataclass
from typing import Optional

import numpy as np

from ..economy import CONFIG as ECONOMY
from ..economy import era_multiplier, zorps_earned
from ..schemas import Species
from .config import CONFIG, SanctuaryConfig
from .fit import overall_fit
from .schemas import (
    AdvanceDome,
    AdvanceEvent,
    DomeResult,
    Outbreak,
    Percentiles,
    SanctuaryAdvanceRequest,
    SanctuaryAdvanceResponse,
    SanctuarySimRequest,
    SanctuarySimResponse,
    SpeciesForecast,
    SpeciesSurvival,
)

SAMPLE_PATHS = 25
ADVANCE_RUNS = 500
SUDDEN = ("breach", "power", "meteor")
KIND_CONTINUES, KIND_NEW, KIND_SPREAD = 0, 1, 2


def seed_for(req: SanctuarySimRequest) -> int:
    """Same sanctuary -> same seed -> same futures, so the difference between two forecasts
    is the player's change, not luck. Canonical: residents merged per species and sorted."""
    domes = []
    for d in req.domes:
        counts: dict[str, list[int]] = {}
        for r in d.residents:
            c = counts.setdefault(r.species_id, [0, 0])
            c[0] += r.count
            c[1] += r.from_infected
        residents = sorted((sid, n, k) for sid, (n, k) in counts.items() if n > 0)
        ob = (d.outbreak.years_left, d.outbreak.severity) if d.outbreak else None
        domes.append((d.id, d.terrain, d.temperature, d.humidity, d.oxygen, d.pressure, d.capacity, ob, residents))
    key = repr((domes, req.years, req.runs)).encode()
    return int(hashlib.sha256(key).hexdigest()[:16], 16)


# ---- setup -------------------------------------------------------------------------------

def trim_to_capacity(N: np.ndarray, K: np.ndarray) -> np.ndarray:
    """Remove animals until each dome is at capacity, proportionally to each species' share
    (largest remainder). N is [..., species]; K broadcasts against N's leading axes."""
    T = N.sum(axis=-1)
    Kb = np.broadcast_to(K, T.shape)
    over = T > Kb
    if not over.any():
        return N
    scaled = N * (Kb / np.maximum(T, 1))[..., None]
    base = np.floor(scaled).astype(np.int64)
    left = np.where(over, Kb - base.sum(axis=-1), 0)
    rank = np.argsort(np.argsort(-(scaled - base), axis=-1, kind="stable"), axis=-1, kind="stable")
    base = base + (rank < left[..., None])
    return np.where(over[..., None], base, N)


@dataclass
class Setup:
    ids: list[str]  # species columns (sorted, so listing order can't change the draws)
    start: np.ndarray  # [dome, species] animals at the start (clamped and trimmed)
    birth: np.ndarray  # [dome, species]
    death: np.ndarray  # [dome, species]
    capacity: np.ndarray  # [dome]
    exposed: np.ndarray  # [dome] animals moved in from an infected dome
    ob_years: np.ndarray  # [dome] years left of an outbreak already running (0 = none)
    ob_severity: np.ndarray  # [dome]


def prepare(req: SanctuarySimRequest, species_by_id: dict[str, Species], cfg: SanctuaryConfig) -> Setup:
    K = np.array([d.capacity for d in req.domes], dtype=np.int64)
    ids = sorted({r.species_id for d in req.domes for r in d.residents if min(r.count, d.capacity) > 0})
    col = {sid: i for i, sid in enumerate(ids)}
    D, S = len(req.domes), len(ids)
    start = np.zeros((D, S), dtype=np.int64)
    fit = np.zeros((D, S))
    exposed = np.zeros(D, dtype=np.int64)
    for d, dome in enumerate(req.domes):
        for r in dome.residents:
            n = min(r.count, dome.capacity)
            if n == 0:
                continue
            start[d, col[r.species_id]] += n
            exposed[d] += min(r.from_infected, n)
        for sid in ids:
            fit[d, col[sid]] = overall_fit(species_by_id[sid], dome, cfg)
    start = trim_to_capacity(start, K)
    return Setup(
        ids=ids,
        start=start,
        birth=cfg.birth_rate * fit,
        death=np.clip(cfg.death_rate_min + cfg.death_rate_poor_fit * (1 - fit), 0, 1),
        capacity=K,
        exposed=exposed,
        ob_years=np.array([d.outbreak.years_left if d.outbreak else 0 for d in req.domes], dtype=np.int64),
        ob_severity=np.array([d.outbreak.severity if d.outbreak else 0.0 for d in req.domes]),
    )


def outbreak_chance(total: np.ndarray, capacity: np.ndarray, cfg: SanctuaryConfig = CONFIG) -> np.ndarray:
    """Yearly chance an outbreak starts: the base chance, rising linearly above `crowded_at`."""
    o = cfg.outbreak
    fill = total / np.maximum(capacity, 1)
    over = np.clip((fill - o.crowded_at) / (1 - o.crowded_at), 0, 1)
    return cfg.disasters["disease"].chance * (1 + o.crowd_boost * over)


# ---- the yearly loop ---------------------------------------------------------------------

@dataclass
class RunLog:
    alive: np.ndarray  # [year, run] species alive anywhere
    species_alive: np.ndarray  # [year, species] runs in which each species is alive anywhere
    final: np.ndarray  # [run, dome, species]
    had_disaster: np.ndarray  # [run, dome]: any sudden disaster or outbreak year
    ob_years: np.ndarray  # [run, dome] outbreak years left at the end
    ob_severity: np.ndarray  # [run, dome]
    # Only when record=True (advance): per year, what happened in every run
    sudden_hit: Optional[np.ndarray] = None  # [year, run, dome, 3]
    lost: Optional[np.ndarray] = None  # [year, run, dome, 4, species]
    disease_on: Optional[np.ndarray] = None  # [year, run, dome] outbreak ran this year
    disease_kind: Optional[np.ndarray] = None  # [year, run, dome] continues / new / spread
    ob_after: Optional[np.ndarray] = None  # [year, run, dome] outbreak still running after the year


def run(setup: Setup, years: int, runs: int, rng: np.random.Generator,
        cfg: SanctuaryConfig = CONFIG, record: bool = False) -> RunLog:
    D, S = setup.start.shape
    R, Y, K = runs, years, setup.capacity
    o = cfg.outbreak
    chance = np.array([cfg.disasters[t].chance for t in SUDDEN])
    survive = np.array([1 - cfg.disasters[t].kill for t in SUDDEN])

    N = np.broadcast_to(setup.start, (R, D, S)).copy()
    ob_years = np.broadcast_to(setup.ob_years, (R, D)).copy()
    ob_sev = np.broadcast_to(setup.ob_severity, (R, D)).copy()
    # Animals from an infected dome: P(at least one brings the outbreak) = 1 - (1 - p)^k
    carry = 1 - (1 - o.carry_chance) ** setup.exposed
    caught = (ob_years == 0) & (setup.exposed > 0) & (rng.random((R, D)) < carry)

    had = np.zeros((R, D), dtype=bool)
    alive = np.zeros((Y + 1, R), dtype=np.int64)
    species_alive = np.zeros((Y + 1, S), dtype=np.int64)
    alive[0] = (N > 0).any(axis=1).sum(axis=1)
    species_alive[0] = (N > 0).any(axis=1).sum(axis=0)
    if record:
        sudden_hit = np.zeros((Y, R, D, 3), dtype=bool)
        lost = np.zeros((Y, R, D, 4, S), dtype=np.int64)
        disease_on = np.zeros((Y, R, D), dtype=bool)
        disease_kind = np.zeros((Y, R, D), dtype=np.int8)
        ob_after = np.zeros((Y, R, D), dtype=bool)

    for y in range(1, Y + 1):
        # growth, crowding, capacity
        room = np.clip(1 - N.sum(axis=2) / K, 0, 1)
        births = rng.poisson(setup.birth * N * (N / (N + cfg.allee)) * room[..., None])
        deaths = rng.binomial(N, setup.death)
        N = trim_to_capacity(N + births - deaths, K)

        # sudden disasters hit everyone in the dome at once
        for t in range(3):
            hit = rng.random((R, D)) < chance[t]
            loss = np.where(hit[..., None], N - rng.binomial(N, survive[t]), 0)
            N = N - loss
            had |= hit
            if record:
                sudden_hit[y - 1, :, :, t] = hit
                lost[y - 1, :, :, t] = loss

        # disease: an outbreak keeps killing; otherwise one may start
        T = N.sum(axis=2)
        free = ob_years == 0
        spread = free & caught & (y == 1)
        new = free & ~spread & (T > 0) & (rng.random((R, D)) < outbreak_chance(T, K, cfg))
        started = spread | new
        ob_years = np.where(started, rng.integers(o.min_years, o.max_years + 1, (R, D)), ob_years)
        ob_sev = np.where(started, o.severity, ob_sev)
        on = ob_years > 0
        loss = np.where(on[..., None], rng.binomial(N, ob_sev[..., None]), 0)
        N = N - loss
        had |= on
        if record:
            disease_on[y - 1] = on
            disease_kind[y - 1] = np.where(spread, KIND_SPREAD, np.where(new, KIND_NEW, KIND_CONTINUES))
            lost[y - 1, :, :, 3] = loss
        ob_years = np.where(on, ob_years - 1, 0)
        ob_sev = np.where(ob_years > 0, ob_sev, 0.0)
        if record:
            ob_after[y - 1] = ob_years > 0

        N[N < 2] = 0
        present = (N > 0).any(axis=1)  # [run, species]
        alive[y] = present.sum(axis=1)
        species_alive[y] = present.sum(axis=0)

    log = RunLog(alive, species_alive, N, had, ob_years, ob_sev)
    if record:
        log.sudden_hit, log.lost, log.disease_on, log.disease_kind, log.ob_after = (
            sudden_hit, lost, disease_on, disease_kind, ob_after)
    return log


def worst_case(final_alive: np.ndarray) -> int:
    """Lower nearest-rank 5th percentile, as a whole number of species."""
    s = np.sort(final_alive)
    return int(s[math.floor((len(s) - 1) * 0.05)])


def placed_in(setup: Setup, d: int, req: SanctuarySimRequest) -> list[str]:
    """Species living in dome d at the start, in the order the request listed them."""
    col = {sid: i for i, sid in enumerate(setup.ids)}
    out = []
    for r in req.domes[d].residents:
        if r.species_id in col and setup.start[d, col[r.species_id]] > 0 and r.species_id not in out:
            out.append(r.species_id)
    return out


# ---- POST /api/sanctuary/simulate --------------------------------------------------------

def simulate(req: SanctuarySimRequest, species_by_id: dict[str, Species],
             cfg: SanctuaryConfig = CONFIG, seed: Optional[int] = None) -> SanctuarySimResponse:
    setup = prepare(req, species_by_id, cfg)
    R, Y = req.runs, req.years
    log = run(setup, Y, R, np.random.default_rng(seed), cfg)
    col = {sid: i for i, sid in enumerate(setup.ids)}
    alive_in_dome = (log.final > 0).mean(axis=0)  # [dome, species]
    mean_survivors = log.final.sum(axis=1).mean(axis=0)  # [species]

    return SanctuarySimResponse(
        years=list(range(Y + 1)),
        species_alive=Percentiles(**{f"p{q}": np.percentile(log.alive, q, axis=1).tolist() for q in (5, 25, 50, 75, 95)}),
        sample_paths=log.alive[:, :SAMPLE_PATHS].T.tolist(),
        per_species=[
            SpeciesForecast(species_id=sid, survival_probability=float(log.species_alive[Y, s] / R),
                            survival_by_year=(log.species_alive[:, s] / R).tolist())
            for s, sid in enumerate(setup.ids)
        ],
        per_dome=[
            DomeResult(
                id=dome.id,
                survival_by_species=[SpeciesSurvival(species_id=sid, survival_probability=float(alive_in_dome[d, col[sid]]))
                                     for sid in placed_in(setup, d, req)],
                disaster_rate=float(log.had_disaster[:, d].mean()),
            )
            for d, dome in enumerate(req.domes)
        ],
        expected_species_saved=float(log.alive[Y].mean()),
        worst_case_species_saved=worst_case(log.alive[Y]),
        zorps=zorps_earned({sid: float(mean_survivors[s]) for s, sid in enumerate(setup.ids)},
                           {sid: species_by_id[sid].era_year for sid in setup.ids}),
    )


# ---- POST /api/sanctuary/advance ---------------------------------------------------------

def advance(req: SanctuaryAdvanceRequest, species_by_id: dict[str, Species],
            cfg: SanctuaryConfig = CONFIG, seed: Optional[int] = None) -> SanctuaryAdvanceResponse:
    """Play ONE future: simulate many, pick one at random as what really happened, report
    its events, and rank it against the others (luck)."""
    setup = prepare(req, species_by_id, cfg)
    R, Y, ids = req.runs or ADVANCE_RUNS, req.years, setup.ids
    col = {sid: i for i, sid in enumerate(ids)}
    rng = np.random.default_rng(seed)
    log = run(setup, Y, R, rng, cfg, record=True)
    c = int(rng.integers(R))  # the future that happens

    # Luck: fraction of futures that ended no better (species alive, then total animals)
    a, t = log.alive[Y], log.final.sum(axis=(1, 2))
    luck = float(((a < a[c]) | ((a == a[c]) & (t <= t[c]))).mean())

    def by_species(row) -> dict[str, int]:
        return {ids[s]: int(n) for s, n in enumerate(row) if n > 0}

    domes = []
    for d, dome in enumerate(req.domes):
        events: list[AdvanceEvent] = []
        current: Optional[AdvanceEvent] = None  # the outbreak being tallied
        for y in range(Y):
            for k, name in enumerate(SUDDEN):
                if log.sudden_hit[y, c, d, k]:
                    events.append(AdvanceEvent(year=y + 1, type=name, lost=by_species(log.lost[y, c, d, k])))
            if log.disease_on[y, c, d]:
                kind, lost = log.disease_kind[y, c, d], by_species(log.lost[y, c, d, 3])
                if kind == KIND_CONTINUES and current is not None:
                    for sid, n in lost.items():
                        current.lost[sid] = current.lost.get(sid, 0) + n
                else:
                    current = AdvanceEvent(year=y + 1, type="disease", lost=lost,
                                           ongoing=bool(kind == KIND_CONTINUES), spread=bool(kind == KIND_SPREAD))
                    events.append(current)
            if not log.ob_after[y, c, d]:
                current = None
        placed = placed_in(setup, d, req)
        domes.append(AdvanceDome(
            id=dome.id,
            start={sid: int(setup.start[d, col[sid]]) for sid in placed},
            end={sid: int(log.final[c, d, col[sid]]) for sid in placed},
            events=events,
            outbreak=Outbreak(years_left=int(log.ob_years[c, d]), severity=float(log.ob_severity[c, d]))
            if log.ob_years[c, d] > 0 else None,
        ))

    # Payout: every THRIVING species (>= 2 alive at the end, all domes) earns
    # zorps_per_survivor x animals x era multiplier (same rule as the frontend's advancePayout)
    totals = log.final[c].sum(axis=0)
    zorps = sum(round(ECONOMY.zorps_per_survivor * int(n) * era_multiplier(species_by_id[sid].era_year))
                for sid, n in zip(ids, totals) if n >= 2)

    return SanctuaryAdvanceResponse(
        years=Y,
        domes=domes,
        species_alive_end=int(a[c]),
        luck_percentile=round(luck, 4),
        zorps_earned=int(zorps),
    )
