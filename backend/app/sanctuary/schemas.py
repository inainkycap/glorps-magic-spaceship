"""Requests/responses for POST /api/sanctuary/simulate and /advance. Mirror the sanctuary
types in frontend/src/types.ts (CLAUDE.md "Sanctuary sim" and "Forecast -> Advance").

The request comes from the browser, so it's untrusted: numbers are clamped to sane ranges
rather than rejected. Counts are clamped to 0..max_capacity here, and to each dome's own
capacity in the engine.
"""
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, BeforeValidator, Field

from ..economy import ZorpsEarned
from ..schemas import DomeTerrain
from .config import CONFIG

MAX_CAPACITY = CONFIG.max_capacity

DisasterType = Literal["breach", "power", "meteor", "disease"]


def clamp(lo: float, hi: float, whole: bool = False):
    """A validator that clamps a number into [lo, hi] (and rounds it if `whole`)."""

    def f(v):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return v  # let the normal type check reject it
        v = min(max(v, lo), hi)
        return round(v) if whole else v

    return BeforeValidator(f)


Count = Annotated[int, clamp(0, MAX_CAPACITY, whole=True)]


class SpeciesCount(BaseModel):
    species_id: str
    count: Count
    from_infected: Count = 0  # how many of `count` were moved here from an infected dome


class Outbreak(BaseModel):
    years_left: Annotated[int, clamp(1, 20, whole=True)]  # whole years still to run
    severity: Annotated[float, clamp(0, 1)]  # fraction of each species killed per year


def _no_finished_outbreak(v):
    """An outbreak with fewer than 1 year left is over: treat it as none."""
    if isinstance(v, dict):
        try:
            if float(v.get("years_left", 0)) < 1:
                return None
        except (TypeError, ValueError):
            return None
    return v


class DomeInput(BaseModel):
    id: str
    terrain: DomeTerrain
    temperature: Annotated[float, clamp(-30, 50)]  # °C
    humidity: Annotated[float, clamp(0, 100)]  # %
    oxygen: Annotated[float, clamp(10, 35)]  # %
    pressure: Annotated[float, clamp(50, 200)]  # kPa
    capacity: Annotated[int, clamp(1, MAX_CAPACITY, whole=True)] = CONFIG.default_capacity
    outbreak: Annotated[Optional[Outbreak], BeforeValidator(_no_finished_outbreak)] = None
    residents: list[SpeciesCount] = []


class SanctuarySimRequest(BaseModel):
    domes: list[DomeInput] = Field(min_length=1, max_length=12)
    years: Annotated[int, clamp(1, 200, whole=True)] = 50
    runs: Annotated[int, clamp(10, 5000, whole=True)] = 1000


class SanctuaryAdvanceRequest(SanctuarySimRequest):
    years: Annotated[int, clamp(1, 50, whole=True)] = 10
    runs: Annotated[Optional[int], clamp(10, 500, whole=True)] = None  # futures to rank luck against


# ---- /simulate response ----

class Percentiles(BaseModel):
    p5: list[float]
    p25: list[float]
    p50: list[float]
    p75: list[float]
    p95: list[float]


class SpeciesSurvival(BaseModel):
    species_id: str
    survival_probability: float


class SpeciesForecast(SpeciesSurvival):
    survival_by_year: list[float]  # fraction of runs alive (any dome), per entry of `years`


class DomeResult(BaseModel):
    id: str
    survival_by_species: list[SpeciesSurvival]  # alive in THIS dome at the end
    disaster_rate: float  # fraction of runs with at least one disaster (or outbreak) here


class SanctuarySimResponse(BaseModel):
    years: list[int]
    species_alive: Percentiles  # number of species alive (in any dome), per year
    sample_paths: list[list[int]]  # 25 runs of species_alive
    per_species: list[SpeciesForecast]  # alive in ANY dome
    per_dome: list[DomeResult]
    expected_species_saved: float
    worst_case_species_saved: int  # lower nearest-rank 5th percentile
    zorps: ZorpsEarned  # what the surviving animals would earn (forecasts don't pay)


# ---- /advance response ----

class AdvanceEvent(BaseModel):
    year: int  # 1..years, within this advance
    type: DisasterType
    lost: dict[str, int]  # species id -> animals killed (an outbreak: its whole toll this advance)
    ongoing: bool = False  # disease: the outbreak was already running before this advance
    spread: bool = False  # disease: brought in by animals moved from an infected dome


class AdvanceDome(BaseModel):
    id: str
    start: dict[str, int]  # species id -> animals at the start (after clamping to capacity)
    end: dict[str, int]  # ... and at the end: the new populations
    events: list[AdvanceEvent]
    outbreak: Optional[Outbreak]  # still running at the end (send it back next time), or null


class SanctuaryAdvanceResponse(BaseModel):
    years: int
    domes: list[AdvanceDome]
    species_alive_end: int
    luck_percentile: float  # fraction of futures that ended no better than this one
    zorps_earned: int  # payout for this decade: thriving species (>= 2 alive) x era multiplier
