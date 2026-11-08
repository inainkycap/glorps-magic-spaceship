import json
from pathlib import Path
from .schemas import Species

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "species"


def load_all() -> dict[str, Species]:
    species = {}
    for path in sorted(DATA_DIR.glob("*.json")):
        s = Species.model_validate(json.loads(path.read_text(encoding="utf-8")))  # raises if the file is wrong
        species[s.id] = s
    return species


SPECIES = load_all()
