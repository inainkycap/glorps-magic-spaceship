"""Glorp's Magic Spaceship API. Person A owns this file."""
import hashlib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .sanctuary.engine import simulate as simulate_sanctuary
from .sanctuary.schemas import SanctuarySimRequest, SanctuarySimResponse
from .schemas import Species, SpeciesSummary
from .species import SPECIES
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
