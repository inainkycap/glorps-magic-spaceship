import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import Species
from app.species import SPECIES
from app.timeline import build_timeline, position, year_label

client = TestClient(app)


@pytest.mark.parametrize("year, label", [(-2000, "2000 BCE"), (-50, "50 BCE"), (1, "1 CE"), (900, "900 CE"), (1987, "1987")])
def test_year_label(year, label):
    assert year_label(year) == label


def test_positions_run_from_oldest_to_present():
    assert position(-2000, -2000) == 0.0
    assert position(2026, -2000) == 1.0
    assert 0 < position(1600, -2000) < position(1900, -2000) < 1


def test_log_scale_spreads_recent_eras():
    """On a linear axis 1500-1987 would be the last ~12%; on the log axis it gets far more room."""
    span = position(1987, -2000) - position(1500, -2000)
    assert span > 0.3


def test_endpoint_sorted_and_complete():
    r = client.get("/api/timeline").json()
    years = [e["era_year"] for e in r["eras"]]
    assert years == sorted(years)
    assert {e["species_id"] for e in r["eras"]} == set(SPECIES)
    assert r["eras"][0]["position"] == 0.0 and r["scale"] == "log"
    assert all(r["oldest_year"] <= t["year"] <= r["present_year"] for t in r["ticks"])
    positions = [e["position"] for e in r["eras"]]
    assert positions == sorted(positions)


def test_bce_species_gets_bce_label():
    oldest = build_timeline(list(SPECIES.values())).eras[0]
    if oldest.era_year < 0:
        assert oldest.label.endswith("BCE")


def test_year_zero_rejected():
    data = SPECIES["dodo"].model_dump(exclude_unset=True)
    with pytest.raises(ValidationError, match="no year 0"):
        Species.model_validate({**data, "era_year": 0})


def test_future_year_rejected():
    data = SPECIES["dodo"].model_dump(exclude_unset=True)
    with pytest.raises(ValidationError):
        Species.model_validate({**data, "era_year": 3000})
