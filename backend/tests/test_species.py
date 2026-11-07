import copy

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import Species
from app.species import SPECIES

client = TestClient(app)


def test_list_has_dodo():
    r = client.get("/api/species")
    assert r.status_code == 200
    assert any(s["id"] == "dodo" for s in r.json())
    assert "hotspots" not in r.json()[0]  # summaries only


def test_get_dodo():
    r = client.get("/api/species/dodo")
    assert r.status_code == 200
    assert r.json()["name"] == "Dodo"
    assert len(r.json()["hotspots"]) > 0


def test_summaries_have_map_fields():
    for s in client.get("/api/species").json():
        assert {"lat", "lon", "era_year"} <= s.keys()


def test_proposed_content_passes_through():
    d = client.get("/api/species/dodo").json()
    assert d["needs"]["temperature"]["min"] == "~18"  # uncertain bound stays a string
    assert d["hotspots"][0]["unlocks"] is None or isinstance(d["hotspots"][0]["unlocks"], str)
    assert any(isinstance(h.get("reveals"), list) for h in d["hotspots"])


def test_api_matches_files_exactly():
    """The API must serve each species file unchanged, so the frontend sees the same as its mocks."""
    import json
    from app.species import DATA_DIR

    for path in DATA_DIR.glob("*.json"):
        on_disk = json.loads(path.read_text())
        served = client.get(f"/api/species/{on_disk['id']}").json()
        assert served == on_disk, path.name


def test_unknown_404():
    assert client.get("/api/species/unicorn").status_code == 404


def test_bad_unlock_id_rejected():
    data = copy.deepcopy(SPECIES["dodo"].model_dump())
    data["hotspots"][0]["unlocks"] = "laser_fence"  # not a real intervention
    with pytest.raises(ValidationError, match="unknown intervention"):
        Species.model_validate(data)


def test_bad_threat_id_rejected():
    data = copy.deepcopy(SPECIES["dodo"].model_dump())
    data["interventions"][0]["mitigates"] = {"aliens": 0.5}
    with pytest.raises(ValidationError, match="unknown threat"):
        Species.model_validate(data)
