"""Request/response for POST /api/sanctuary/simulate. Mirrors SanctuarySimRequest /
SanctuarySimResponse in frontend/src/types.ts (CLAUDE.md "Proposed: sanctuary sim")."""
from pydantic import BaseModel, Field

from ..schemas import DomeTerrain


class SpeciesCount(BaseModel):
    species_id: str
    count: int = Field(ge=0, le=10_000)


class DomeInput(BaseModel):
    id: str
    terrain: DomeTerrain
    temperature: float  # °C
    humidity: float  # %
    oxygen: float  # %
    pressure: float  # kPa
    residents: list[SpeciesCount] = []


class SanctuarySimRequest(BaseModel):
    domes: list[DomeInput] = Field(min_length=1, max_length=12)
    years: int = Field(default=50, ge=1, le=200)
    runs: int = Field(default=1000, ge=10, le=5000)


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
