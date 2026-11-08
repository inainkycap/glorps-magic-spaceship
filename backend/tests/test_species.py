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
        on_disk = json.loads(path.read_text(encoding="utf-8"))
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


def test_legacy_fields_are_optional():
    data = SPECIES["dodo"].model_dump(exclude_unset=True)
    for key in ("threats", "interventions", "goal_survival", "max_interventions", "sim"):
        data.pop(key, None)
    for h in data["hotspots"]:
        h.pop("unlocks", None)
    assert Species.model_validate(data).dna_required == data["dna_required"]


@pytest.mark.parametrize("species_id", sorted(SPECIES))
def test_every_need_is_revealed_by_a_hotspot(species_id):
    """CLAUDE.md: every need a species has should be discoverable in Explore."""
    s = SPECIES[species_id]
    revealed = set()
    for h in s.hotspots:
        if h.reveals:
            revealed |= set(h.reveals if isinstance(h.reveals, list) else [h.reveals])
    assert set(s.needs or {}) <= revealed, f"never revealed: {set(s.needs or {}) - revealed}"


@pytest.mark.parametrize("species_id", sorted(SPECIES))
def test_hotspot_ids_unique(species_id):
    ids = [h.id for h in SPECIES[species_id].hotspots]
    assert len(ids) == len(set(ids))


def test_summaries_have_scoring_and_wave_fields():
    """The map and HUD read these from the list, so they must survive the summary model."""
    for s in client.get("/api/species").json():
        assert s["diversity_value"] in (1, 2, 3, 4, 5)
        assert s["unlock_wave"] in (1, 2, 3)


def test_waves_have_three_species_each_at_least():
    from collections import Counter
    waves = Counter(s.unlock_wave for s in SPECIES.values())
    assert waves[1] == 3 and waves[2] == 3 and waves[3] >= 3


def test_wave_one_is_cheap_to_reach():
    """The frontend's Zorps budget assumes ~29 Zorps per trip for wave 1."""
    from app.economy import travel_cost
    for s in SPECIES.values():
        if s.unlock_wave == 1:
            assert travel_cost(2026, s.era_year) <= 30, s.id


def test_diversity_value_is_required():
    data = SPECIES["dodo"].model_dump(exclude_unset=True)
    data.pop("diversity_value")
    with pytest.raises(ValidationError):
        Species.model_validate(data)


def test_diversity_follows_evolutionary_distinctiveness():
    """Lineages with no close living relatives score high; ones that live on score low."""
    dv = {sid: s.diversity_value for sid, s in SPECIES.items()}
    for high in ("thylacine", "elephant_bird", "moa"):
        assert dv[high] == 5
    for low in ("quagga", "aurochs", "pyrenean_ibex"):
        assert dv[low] == 1
