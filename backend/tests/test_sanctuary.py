import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sanctuary.engine import simulate
from app.sanctuary.fit import overall_fit, parse_bound
from app.sanctuary.schemas import DomeInput, SanctuarySimRequest
from app.species import SPECIES

client = TestClient(app)

# Suits both dodo and passenger pigeon (same as the frontend mock test).
GOOD = dict(terrain="forest", temperature=24, humidity=75, oxygen=21, pressure=101)
HARSH = dict(terrain="tundra", temperature=-25, humidity=10, oxygen=21, pressure=101)


def dome(id, conditions, **residents):
    return DomeInput(id=id, **conditions,
                     residents=[{"species_id": k, "count": v} for k, v in residents.items()])


CONCENTRATED = SanctuarySimRequest(domes=[dome("a", GOOD, dodo=10, passenger_pigeon=10)])
SPLIT = SanctuarySimRequest(domes=[dome("a", GOOD, dodo=5, passenger_pigeon=5),
                                   dome("b", GOOD, dodo=5, passenger_pigeon=5)])


# ---- fit ----

@pytest.mark.parametrize("raw, expected", [(18, 18), ("~18", 18), ("~-5", -5), ("?", None), ("", None), (None, None)])
def test_parse_bound(raw, expected):
    assert parse_bound(raw) == expected


def test_fit_perfect_and_poor():
    d = DomeInput(id="x", **GOOD)
    assert overall_fit(SPECIES["dodo"], d) == pytest.approx(1.0)
    assert overall_fit(SPECIES["dodo"], DomeInput(id="x", **HARSH)) < 0.05


def test_wrong_terrain_only():
    # dodo lists forest + wetland; grassland is wrong. 5 needs, one at 0.4 -> 0.4 ** (1/5)
    d = DomeInput(id="x", **{**GOOD, "terrain": "grassland"})
    assert overall_fit(SPECIES["dodo"], d) == pytest.approx(0.4 ** (1 / 5))


def test_temperature_falloff_matches_frontend_formula():
    # dodo max ~30 °C, tolerance 6: 36 °C is one tolerance out -> exp(-1) on that need
    d = DomeInput(id="x", **{**GOOD, "temperature": 36})
    assert overall_fit(SPECIES["dodo"], d) == pytest.approx(math.exp(-1) ** (1 / 5))


# ---- engine ----

def test_response_shape():
    r = simulate(SPLIT, SPECIES, seed=7)
    assert r.years == list(range(51))
    for band in r.species_alive.model_dump().values():
        assert len(band) == 51
    assert len(r.sample_paths) == 25 and all(len(p) == 51 for p in r.sample_paths)
    assert sorted(s.species_id for s in r.per_species) == ["dodo", "passenger_pigeon"]
    assert [d.id for d in r.per_dome] == ["a", "b"]
    assert r.species_alive.p5[0] == 2  # both alive at the start
    assert r.worst_case_species_saved <= r.expected_species_saved


def test_reproducible_with_seed():
    assert simulate(SPLIT, SPECIES, seed=5) == simulate(SPLIT, SPECIES, seed=5)


@pytest.mark.parametrize("seed", [1, 2, 3, 42, 2026])
def test_splitting_beats_concentrating_on_worst_case(seed):
    one = simulate(CONCENTRATED, SPECIES, seed=seed)
    two = simulate(SPLIT, SPECIES, seed=seed)
    assert two.worst_case_species_saved > one.worst_case_species_saved


def test_good_dome_keeps_species():
    # Two species now share one 60-animal dome, so this is harder than it used to be
    r = simulate(CONCENTRATED, SPECIES, seed=3)
    assert r.expected_species_saved > 1.2


def test_harsh_dome_loses_species():
    harsh = SanctuarySimRequest(domes=[dome("a", HARSH, dodo=10, passenger_pigeon=10)])
    assert simulate(harsh, SPECIES, seed=9).expected_species_saved < 0.1


def test_wrong_conditions_matter():
    """Getting one need wrong should cost noticeably, so discovering needs pays off."""
    def survival(cond):
        req = SanctuarySimRequest(domes=[dome("a", cond, dodo=10)])
        return simulate(req, SPECIES, seed=11).per_species[0].survival_probability
    good = survival(GOOD)
    assert good > 0.8
    assert survival({**GOOD, "terrain": "grassland"}) < good - 0.2
    assert survival({**GOOD, "temperature": 12}) < good - 0.2


def test_disasters_happen_but_not_always():
    r = simulate(CONCENTRATED, SPECIES, seed=4)
    assert 0.2 < r.per_dome[0].disaster_rate < 0.95


def test_empty_sanctuary():
    r = simulate(SanctuarySimRequest(domes=[dome("a", GOOD)]), SPECIES, seed=1)
    assert r.expected_species_saved == 0 and r.per_species == [] and r.per_dome[0].survival_by_species == []


# ---- endpoint ----

def test_endpoint_ok_and_deterministic():
    body = SPLIT.model_dump()
    a = client.post("/api/sanctuary/simulate", json=body)
    b = client.post("/api/sanctuary/simulate", json=body)
    assert a.status_code == 200
    assert a.json() == b.json()  # same layout -> same futures


def test_endpoint_drops_unknown_species():
    body = {"domes": [{"id": "a", **GOOD, "residents": [{"species_id": "unicorn", "count": 3},
                                                        {"species_id": "dodo", "count": 5}]}]}
    r = client.post("/api/sanctuary/simulate", json=body)
    assert r.status_code == 200
    assert [s["species_id"] for s in r.json()["per_species"]] == ["dodo"]


def test_counts_and_conditions_are_clamped():
    d = DomeInput(id="a", terrain="forest", temperature=999, humidity=-5, oxygen=0, pressure=1e6,
                  residents=[{"species_id": "dodo", "count": 10_000}, {"species_id": "dodo", "count": -3},
                             {"species_id": "dodo", "count": 4.6}])
    assert (d.temperature, d.humidity, d.oxygen, d.pressure) == (50, 0, 10, 200)
    assert [r.count for r in d.residents] == [200, 0, 5]  # max capacity; the engine clamps to the dome's own


def test_endpoint_rejects_garbage_types():
    body = {"domes": [{"id": "a", **{**GOOD, "temperature": "hot"}, "residents": []}]}
    assert client.post("/api/sanctuary/simulate", json=body).status_code == 422


def test_endpoint_bad_terrain():
    body = {"domes": [{"id": "a", **{**GOOD, "terrain": "lava"}, "residents": []}]}
    assert client.post("/api/sanctuary/simulate", json=body).status_code == 422
