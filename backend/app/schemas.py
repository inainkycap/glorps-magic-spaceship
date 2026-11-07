"""Pydantic models mirroring the contract in /CLAUDE.md and frontend/src/types.ts."""
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator

Status = Literal["extinct", "extinct_in_wild", "critically_endangered", "endangered", "vulnerable"]


class SpeciesSummary(BaseModel):
    id: str
    name: str
    scientific_name: str
    status: Status
    era: str
    location: str
    kind: str
    lat: float = Field(ge=-90, le=90)  # degrees, where the species lived (map pin)
    lon: float = Field(ge=-180, le=180)
    # The year Glorp travels to; `era` stays the display string. Negative = BCE (-2000 is
    # 2000 BCE); there is no year 0.
    era_year: int = Field(ge=-50_000, le=2026)

    @field_validator("era_year")
    @classmethod
    def no_year_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("there is no year 0: use 1 (1 CE) or -1 (1 BCE)")
        return v


# ---- PROPOSED species content (CLAUDE.md "Proposed: species content + needs") ----
# All optional. Bounds/facts may be strings like "~18" (approximate) or "?" (unknown).

NeedKey = Literal["terrain", "temperature", "humidity", "oxygen", "pressure"]
NeedBound = Union[float, str]
DomeTerrain = Literal["forest", "grassland", "wetland", "tundra"]


class Need(BaseModel):
    value: Optional[str] = None  # terrain: a description
    types: Optional[list[DomeTerrain]] = None  # terrain only: dome terrains that suit it
    min: Optional[NeedBound] = None  # the others: a range...
    max: Optional[NeedBound] = None
    unit: Optional[str] = None  # ...in °C, %, % or kPa
    why: Optional[str] = None


class SpeciesFacts(BaseModel):
    height: Optional[str] = None
    weight: Optional[str] = None
    diet: Optional[str] = None
    lifespan: Optional[str] = None
    extinct_year: Optional[Union[int, str]] = None
    cause: Optional[str] = None


class Habitat(BaseModel):
    biome: Optional[str] = None
    climate: Optional[str] = None
    elevation: Optional[str] = None


class Source(BaseModel):
    title: str
    url: str


class Hotspot(BaseModel):
    id: str
    label: str
    sprite: str
    x: float = Field(ge=0, le=100)  # % from left
    y: float = Field(ge=0, le=100)  # % from top
    fact: str
    dna: bool
    unlocks: Optional[str] = None  # intervention id or null
    reveals: Optional[Union[NeedKey, list[NeedKey]]] = None  # PROPOSED


class ThreatEffect(BaseModel):
    mortality: float = 0
    habitat_decline: float = 0
    shock_prob: float = 0
    shock_severity: float = 0


class Threat(BaseModel):
    id: str
    name: str
    description: str
    effect: ThreatEffect


class Intervention(BaseModel):
    id: str
    name: str
    description: str
    mitigates: dict[str, float]  # threat id -> fraction removed (0-1)


class SimConfig(BaseModel):
    model: Literal["logistic", "predator_prey"]
    start_year: int
    years: int
    start_population: float
    carrying_capacity: float
    growth_rate: float


class Species(SpeciesSummary):
    hotspots: list[Hotspot]
    dna_required: int
    # Legacy (the dropped "protect it in the past" Lab). Accepted, not required.
    threats: list[Threat] = []
    interventions: list[Intervention] = []
    goal_survival: Optional[float] = None
    max_interventions: Optional[int] = None
    sim: Optional[SimConfig] = None
    # PROPOSED content fields, all optional:
    intro: Optional[str] = None  # <= 2 sentences in Glorp's voice
    description: Optional[str] = None
    facts: Optional[SpeciesFacts] = None
    habitat: Optional[Habitat] = None
    needs: Optional[dict[NeedKey, Need]] = None
    sources: Optional[list[Source]] = None

    @model_validator(mode="after")
    def check_ids_match(self):
        """Catch typos in ids: every reference must point at something that exists."""
        threat_ids = {t.id for t in self.threats}
        tool_ids = {i.id for i in self.interventions}
        for h in self.hotspots:
            if h.unlocks is not None and h.unlocks not in tool_ids:
                raise ValueError(f"hotspot '{h.id}' unlocks unknown intervention '{h.unlocks}'")
        for i in self.interventions:
            for threat_id in i.mitigates:
                if threat_id not in threat_ids:
                    raise ValueError(f"intervention '{i.id}' mitigates unknown threat '{threat_id}'")
        if sum(h.dna for h in self.hotspots) < self.dna_required:
            raise ValueError("fewer DNA hotspots than dna_required, so the level can't be won")
        return self
