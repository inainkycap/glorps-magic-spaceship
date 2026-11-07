"""Glorp's Magic Spaceship API. Person A owns this file."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import Species, SpeciesSummary
from .species import SPECIES

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
