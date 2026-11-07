"""How well a dome's conditions suit a species (0..1), from the species' `needs`.

Same formula as frontend/src/game/fit.ts, so the dome screen's fit bars agree with the sim:
- terrain: 1 if the dome's terrain is in needs.terrain.types, else `wrong_terrain_fit`
- numeric needs: 1 inside [min, max], bell-curve falloff outside: exp(-(d / tolerance)^2)
- overall: geometric mean of the per-need fits (one bad need drags it down hard)
"""
import math
from typing import Optional, Union

from ..schemas import Species
from .config import CONFIG, SanctuaryConfig

NUMERIC_NEEDS = ("temperature", "humidity", "oxygen", "pressure")


def parse_bound(b: Union[float, str, None]) -> Optional[float]:
    """18 -> 18, "~18" -> 18, "~-5" -> -5, "?" / "" / None -> None."""
    if b is None:
        return None
    if isinstance(b, (int, float)):
        return float(b) if math.isfinite(b) else None
    try:
        n = float(b.strip().lstrip("~").strip())
    except ValueError:
        return None
    return n if math.isfinite(n) else None


def need_fits(species: Species, dome, cfg: SanctuaryConfig = CONFIG) -> dict[str, float]:
    """Per-need fit for whatever needs the species has data for. `dome` has terrain/temperature/..."""
    needs = species.needs or {}
    out: dict[str, float] = {}

    terrain = needs.get("terrain")
    if terrain is not None and terrain.types:
        out["terrain"] = 1.0 if dome.terrain in terrain.types else cfg.wrong_terrain_fit

    for key in NUMERIC_NEEDS:
        need = needs.get(key)
        if need is None:
            continue
        lo, hi = parse_bound(need.min), parse_bound(need.max)
        if lo is None and hi is None:
            continue
        value = getattr(dome, key)
        if lo is not None and value < lo:
            d = lo - value
        elif hi is not None and value > hi:
            d = value - hi
        else:
            d = 0.0
        out[key] = math.exp(-((d / cfg.fit_tolerance[key]) ** 2))
    return out


def overall_fit(species: Species, dome, cfg: SanctuaryConfig = CONFIG) -> float:
    fits = need_fits(species, dome, cfg)
    if not fits:
        return cfg.no_needs_fit
    log_sum = sum(math.log(max(f, 1e-6)) for f in fits.values())
    return math.exp(log_sum / len(fits))
