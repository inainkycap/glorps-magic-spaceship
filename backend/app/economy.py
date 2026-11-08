"""Zorps: Glorp's alien currency (PROPOSED; replaces fuel).

Players spend zorps to travel and to build habitats, and earn them from animals that are
still alive at the end of a sanctuary run. There's no cap.

Everything is measured in "years before now" on a log scale, like the era timeline
(app/timeline.py), so 10 -> 100 -> 1,000 years ago are equal steps:

  age(year)        = log10(years_ago(year) + 10)            # 1.0 for the present (no year 0)
  era_multiplier   = 1 + k_mult * (age(year) - 1)           # 1x now, ~2x for 1987, ~5x for 2000 BCE
  zorps earned     = zorps_per_survivor * sum over species of
                       (mean survivors after the run) * era_multiplier(species era)
  travel cost      = the frontend's formula (CLAUDE.md "Game rules -> Travel cost"), t = years ago:
                       depth(t) = t^2 / (2*KNEE)            for t <= KNEE
                                = KNEE * (ln(t/KNEE) + 1/2)  beyond (smooth at the knee)
                       cost = ceil(BASE + K * |depth(t_from) - depth(t_to)|), 0 if the same era
     so for the last ~400 years the same jump costs more the older it is, and beyond that
     every factor of 10 further back costs the same (deep time stays affordable):
     from today, 1600 = 35, 2,000 BC = 62, 66 million years ago = 179.

Older species are worth more. All numbers live in data/economy.json.
"""
import json
import math
from pathlib import Path

from pydantic import BaseModel

from .years import PRESENT_YEAR, format_era, years_ago

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "economy.json"


class EconomyConfig(BaseModel):
    start_zorps: int
    zorps_per_survivor: float
    era_multiplier_per_decade_of_age: float  # k_mult
    travel_base_cost: float  # BASE
    travel_k: float  # K
    travel_knee_years: float  # KNEE
    habitat_cost: int


CONFIG = EconomyConfig.model_validate(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))


def age(year: int) -> float:
    """log10 of years before now (+10 so the present is 1.0, not log 0)."""
    return math.log10(years_ago(year) + 10)


def era_multiplier(year: int, cfg: EconomyConfig = CONFIG) -> float:
    return round(1 + cfg.era_multiplier_per_decade_of_age * (age(year) - age(PRESENT_YEAR)), 2)


def travel_cost(from_year: int, to_year: int, cfg: EconomyConfig = CONFIG) -> int:
    """Zorps to jump between two eras (rounded up). Same era: 0 here; the frontend may still
    charge the base cost for a trip to another place in the same era."""
    if from_year == to_year:
        return 0
    return max(0, math.ceil(travel_cost_exact(from_year, to_year, cfg) - 1e-9))


def travel_cost_exact(from_year: int, to_year: int, cfg: EconomyConfig = CONFIG) -> float:
    """Unrounded zorps for a jump (0 for the same era)."""
    if from_year == to_year:
        return 0.0
    return cfg.travel_base_cost + cfg.travel_k * abs(time_depth(years_ago(from_year), cfg) - time_depth(years_ago(to_year), cfg))


def time_depth(t: float, cfg: EconomyConfig = CONFIG) -> float:
    """'Time-depth' of t years ago: quadratic up to the knee, logarithmic beyond."""
    t, knee = max(0.0, t), cfg.travel_knee_years
    return t * t / (2 * knee) if t <= knee else knee * (math.log(t / knee) + 0.5)


# ---- API models ----

class SpeciesZorps(BaseModel):
    species_id: str
    mean_survivors: float  # average animals alive at the end, across all runs and domes
    era_multiplier: float
    zorps: int


class ZorpsEarned(BaseModel):
    total: int
    per_species: list[SpeciesZorps]


class SpeciesEconomy(BaseModel):
    species_id: str
    era_year: int
    era_label: str
    era_multiplier: float
    travel_cost_from_present: int


class Economy(BaseModel):
    present_year: int
    start_zorps: int
    zorps_per_survivor: float
    habitat_cost: int
    travel_base_cost: float
    era_multiplier_per_decade_of_age: float
    travel_k: float
    travel_knee_years: float
    travel_cost_per_decade_of_age: float = 0  # DEPRECATED (old log formula); always 0
    species: list[SpeciesEconomy]  # sorted oldest first


class TravelCost(BaseModel):
    from_year: int
    to_year: int
    zorps: int


def zorps_earned(mean_survivors: dict[str, float], era_years: dict[str, int],
                 cfg: EconomyConfig = CONFIG) -> ZorpsEarned:
    per = []
    for sid, n in mean_survivors.items():
        mult = era_multiplier(era_years[sid], cfg)
        per.append(SpeciesZorps(species_id=sid, mean_survivors=round(n, 2), era_multiplier=mult,
                                zorps=round(cfg.zorps_per_survivor * n * mult)))
    return ZorpsEarned(total=sum(p.zorps for p in per), per_species=per)


def economy(species: list, cfg: EconomyConfig = CONFIG) -> Economy:
    return Economy(
        present_year=PRESENT_YEAR,
        start_zorps=cfg.start_zorps,
        zorps_per_survivor=cfg.zorps_per_survivor,
        habitat_cost=cfg.habitat_cost,
        travel_base_cost=cfg.travel_base_cost,
        era_multiplier_per_decade_of_age=cfg.era_multiplier_per_decade_of_age,
        travel_k=cfg.travel_k,
        travel_knee_years=cfg.travel_knee_years,
        species=[
            SpeciesEconomy(species_id=s.id, era_year=s.era_year, era_label=format_era(s.era_year),
                           era_multiplier=era_multiplier(s.era_year, cfg),
                           travel_cost_from_present=travel_cost(PRESENT_YEAR, s.era_year, cfg))
            for s in sorted(species, key=lambda s: (s.era_year, s.id))
        ],
    )
