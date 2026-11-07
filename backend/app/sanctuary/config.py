"""Loads the sim tuning from backend/data/sanctuary.json."""
import json
from pathlib import Path

from pydantic import BaseModel, Field

CONFIG_PATH = Path(__file__).resolve().parents[2] / "data" / "sanctuary.json"


class Disaster(BaseModel):
    name: str
    chance: float = Field(ge=0, le=1)  # per dome per year
    kill: float = Field(ge=0, le=1)  # each resident dies with this probability


class SanctuaryConfig(BaseModel):
    birth_rate: float  # births per individual per year, at perfect fit, no crowding
    death_rate_min: float  # yearly death chance at perfect fit
    death_rate_poor_fit: float  # extra yearly death chance at zero fit
    dome_capacity: float  # crowding scale: births halve when a dome holds this many
    allee: float  # mate-finding: births scale by N / (N + allee)
    fit_tolerance: dict[str, float]  # bell-curve width outside the ideal range
    wrong_terrain_fit: float
    no_needs_fit: float
    disasters: dict[str, Disaster]


def load_config() -> SanctuaryConfig:
    return SanctuaryConfig.model_validate(json.loads(CONFIG_PATH.read_text()))


CONFIG = load_config()
