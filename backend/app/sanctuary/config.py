"""Loads the sim tuning from backend/data/sanctuary.json."""
import json
from pathlib import Path

from pydantic import BaseModel, Field

CONFIG_PATH = Path(__file__).resolve().parents[2] / "data" / "sanctuary.json"


class Disaster(BaseModel):
    name: str
    chance: float = Field(ge=0, le=1)  # per dome per year (disease: the BASE outbreak chance)
    kill: float = Field(ge=0, le=1)  # each resident dies with this probability (unused for disease)


class OutbreakConfig(BaseModel):
    crowded_at: float = Field(gt=0, lt=1)  # above this fill, the outbreak chance rises...
    crowd_boost: float = Field(ge=0)  # ...linearly up to (1 + crowd_boost) x base when full
    min_years: int = Field(ge=1)  # an outbreak lasts min_years..max_years (incl. the first)
    max_years: int = Field(ge=1)
    severity: float = Field(ge=0, le=1)  # fraction of each species killed per outbreak year
    carry_chance: float = Field(ge=0, le=1)  # per animal moved in from an infected dome


class SanctuaryConfig(BaseModel):
    birth_rate: float  # births per individual per year, at perfect fit, in an empty dome
    death_rate_min: float  # yearly death chance at perfect fit
    death_rate_poor_fit: float  # extra yearly death chance at zero fit
    allee: float  # mate-finding: births scale by N / (N + allee)
    default_capacity: int  # a dome's capacity when the request doesn't say
    max_capacity: int  # capacity (and per-species counts) are clamped to this
    fit_tolerance: dict[str, float]  # bell-curve width outside the ideal range
    wrong_terrain_fit: float
    no_needs_fit: float
    disasters: dict[str, Disaster]  # must contain breach, power, meteor, disease
    outbreak: OutbreakConfig


def load_config() -> SanctuaryConfig:
    return SanctuaryConfig.model_validate(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))


CONFIG = load_config()
