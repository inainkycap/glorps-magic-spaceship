"""Glorp's Magic Spaceship API. Person A owns this file."""
import hashlib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .sanctuary.engine import simulate as simulate_sanctuary
from .sanctuary.schemas import SanctuarySimRequest, SanctuarySimResponse
from .schemas import Species, SpeciesSummary
from .economy import Economy, TravelCost, economy, travel_cost
from .species import SPECIES
from .timeline import Timeline, build_timeline
from .wiki import WikiError, WikiSummary, get_summary

app = FastAPI(title="Glorp's Magic Spaceship API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/species", response_model=list[SpeciesSummary])
def list_species():
    return list(SPECIES.values())  # response_model trims it to summary fields


# exclude_unset: optional fields missing from the JSON file are left out of the response
# (not sent as null), but an explicit `"unlocks": null` in the file is kept.
@app.get("/api/economy", response_model=Economy)
def get_economy():
    """PROPOSED: zorps rules and numbers (prices, era multipliers), so the UI matches the backend."""
    return economy(list(SPECIES.values()))


@app.get("/api/travel-cost", response_model=TravelCost)
def get_travel_cost(from_year: int, to_year: int):
    """PROPOSED: zorps to jump from one era to another."""
    for y in (from_year, to_year):
        if not -50_000 <= y <= 2026:
            raise HTTPException(status_code=422, detail="Years must be between -50000 and 2026")
    return TravelCost(from_year=from_year, to_year=to_year, zorps=travel_cost(from_year, to_year))


@app.get("/api/timeline", response_model=Timeline)
def timeline():
    """Every species' era, sorted, with BCE-aware labels and log-scale positions (0..1)."""
    return build_timeline(list(SPECIES.values()))


@app.get("/api/species/{species_id}", response_model=Species, response_model_exclude_unset=True)
def get_species(species_id: str):
    if species_id not in SPECIES:
        raise HTTPException(status_code=404, detail="Unknown species")
    return SPECIES[species_id]


@app.post("/api/sanctuary/simulate", response_model=SanctuarySimResponse)
def sanctuary_simulate(req: SanctuarySimRequest):
    # Untrusted input: drop residents of species we don't know (CLAUDE.md asks for this).
    for d in req.domes:
        d.residents = [r for r in d.residents if r.species_id in SPECIES]
    # Seed from the request itself: the same sanctuary layout always gives the same futures,
    # so when the player changes something, the difference is their change, not luck.
    seed = int(hashlib.sha256(req.model_dump_json().encode()).hexdigest()[:16], 16)
    return simulate_sanctuary(req, SPECIES, seed=seed)


@app.get("/api/wiki/{title}", response_model=WikiSummary)
def wiki(title: str):
    """Wikipedia summary for the field guide (cached on disk, so it works offline)."""
    if not title.strip() or len(title) > 200:
        raise HTTPException(status_code=422, detail="Bad title")
    try:
        return get_summary(title)
    except WikiError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
