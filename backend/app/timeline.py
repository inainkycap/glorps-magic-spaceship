"""The era timeline, ready to draw: every species' era with a label and a position.

Eras now run from ~2000 BCE to the 1980s. On a linear axis everything after 1500 would be
squashed into the last fifth, so positions use a LOG scale of "years before now": each
step left is a multiple further back (10 -> 100 -> 1,000 years ago are evenly spaced).

  years_ago(y) = PRESENT_YEAR - y + OFFSET        (OFFSET keeps recent eras off log(0))
  position(y)  = 1 - (log(years_ago(y)) - log(years_ago(PRESENT_YEAR)))
                     / (log(years_ago(oldest)) - log(years_ago(PRESENT_YEAR)))

so the present is at 1.0 and the oldest species at 0.0. Years are astronomical-style
integers in the species files: -2000 means 2000 BCE, and there is no year 0.
"""
import math

from pydantic import BaseModel

from .schemas import Species

PRESENT_YEAR = 2026
OFFSET = 10
TICK_YEARS = [-10000, -5000, -3000, -2000, -1000, -500, 1, 500, 1000, 1500, 1700, 1800, 1900, 1950, 2000]


class TimelineEra(BaseModel):
    species_id: str
    name: str
    era_year: int
    label: str  # "2000 BCE", "50 BCE", "900 CE", "1987"
    position: float  # 0 = oldest species, 1 = present


class TimelineTick(BaseModel):
    year: int
    label: str
    position: float


class Timeline(BaseModel):
    present_year: int
    scale: str  # "log": positions are log-spaced in years before the present
    oldest_year: int
    eras: list[TimelineEra]  # sorted oldest first
    ticks: list[TimelineTick]  # suggested axis labels between the oldest era and now


def year_label(year: int) -> str:
    """-2000 -> '2000 BCE', -50 -> '50 BCE', 900 -> '900 CE', 1987 -> '1987'."""
    if year < 0:
        return f"{-year} BCE"
    return f"{year} CE" if year < 1000 else str(year)


def years_ago(year: int) -> float:
    return PRESENT_YEAR - year + OFFSET


def position(year: int, oldest: int) -> float:
    lo, hi = math.log(years_ago(PRESENT_YEAR)), math.log(years_ago(oldest))
    if hi == lo:
        return 1.0
    return round(1 - (math.log(years_ago(year)) - lo) / (hi - lo), 4)


def build_timeline(species: list[Species]) -> Timeline:
    oldest = min((s.era_year for s in species), default=PRESENT_YEAR)
    eras = sorted(species, key=lambda s: (s.era_year, s.id))
    return Timeline(
        present_year=PRESENT_YEAR,
        scale="log",
        oldest_year=oldest,
        eras=[
            TimelineEra(species_id=s.id, name=s.name, era_year=s.era_year,
                        label=year_label(s.era_year), position=position(s.era_year, oldest))
            for s in eras
        ],
        ticks=[
            TimelineTick(year=y, label=year_label(y), position=position(y, oldest))
            for y in TICK_YEARS
            if oldest <= y <= PRESENT_YEAR
        ],
    )
