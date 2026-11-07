"""Request/response for POST /api/sanctuary/simulate. Mirrors SanctuarySimRequest /
SanctuarySimResponse in frontend/src/types.ts (CLAUDE.md "Sanctuary sim").

The request comes from the browser, so it's untrusted: counts and dome conditions are
clamped to sane ranges rather than rejected (CLAUDE.md asks for this).
"""
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field

from ..schemas import DomeTerrain

MAX_COUNT = 50  # per species per dome


def clamp(lo: float, hi: float, whole: bool = False):
    """A validator that clamps a number into [lo, hi] (and rounds it if `whole`)."""

    def f(v):
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return v  # let the normal type check reject it
        v = min(max(v, lo), hi)
        return round(v) if whole else v

    return BeforeValidator(f)


Count = Annotated[int, clamp(0, MAX_COUNT, whole=True)]


class SpeciesCount(BaseModel):
    species_id: str
    count: Count


class DomeInput(BaseModel):
    id: str
    terrain: DomeTerrain
    temperature: Annotated[float, clamp(-30, 50)]  # °C
    humidity: Annotated[float, clamp(0, 100)]  # %
    oxygen: Annotated[float, clamp(10, 35)]  # %
    pressure: Annotated[float, clamp(50, 200)]  # kPa
    residents: list[SpeciesCount] = []


class SanctuarySimRequest(BaseModel):
    domes: list[DomeInput] = Field(min_length=1, max_length=12)
    years: Annotated[int, clamp(1, 200, whole=True)] = 50
    runs: Annotated[int, clamp(10, 5000, whole=True)] = 1000


class Percentiles(BaseModel):
    p5: list[float]
    p25: list[float]
    p50: list[float]
    p75: list[float]
    p95: list[float]


class SpeciesSurvival(BaseModel):
    species_id: str
    survival_probability: float


class DomeResult(BaseModel):
    id: str
    survival_by_species: list[SpeciesSurvival]  # alive in THIS dome at the end
    disaster_rate: float  # fraction of runs with at least one disaster in this dome


class SanctuarySimResponse(BaseModel):
    years: list[int]
    species_alive: Percentiles  # number of species alive (in any dome), per year
    sample_paths: list[list[int]]  # 25 runs of species_alive
    per_species: list[SpeciesSurvival]  # alive in ANY dome at the end
    per_dome: list[DomeResult]
    expected_species_saved: float
    worst_case_species_saved: int  # lower nearest-rank 5th percentile
