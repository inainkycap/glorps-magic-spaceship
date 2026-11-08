import pytest
from fastapi.testclient import TestClient

from app.economy import era_multiplier, travel_cost, travel_cost_exact
from app.main import app
from app.sanctuary.engine import simulate
from app.sanctuary.schemas import DomeInput, SanctuarySimRequest
from app.species import SPECIES
from tests.test_sanctuary import GOOD, HARSH

client = TestClient(app)


def run(conditions, **residents):
    dome = DomeInput(id="a", **conditions, residents=[{"species_id": k, "count": v} for k, v in residents.items()])
    return simulate(SanctuarySimRequest(domes=[dome]), SPECIES, seed=11)


# ---- era multiplier ----

def test_multiplier_present_is_one_and_older_is_worth_more():
    assert era_multiplier(2026) == 1.0
    years = [1987, 1870, 1600, 1350, -50, -2000]
    mults = [era_multiplier(y) for y in years]
    assert mults == sorted(mults)
    assert era_multiplier(-2000) == pytest.approx(5.0, abs=0.05)


# ---- travel cost ----

@pytest.mark.parametrize("year, cost", [
    (1987, 29), (1915, 29), (1870, 29), (1600, 35), (900, 47), (-50, 54), (-2000, 62), (-66_000_000, 179),
])
def test_travel_cost_matches_the_frontend_examples(year, cost):
    """CLAUDE.md "Game rules -> Travel cost" (frontend game/zorps.ts) worked examples."""
    assert travel_cost(2026, year) == cost


def test_travel_cost_rules():
    assert travel_cost(1600, 1600) == 0  # staying put is free
    assert travel_cost(2026, 1600) == travel_cost(1600, 2026)  # direction doesn't matter
    assert travel_cost(1600, 1870) == 34
    # For the last ~400 years the same jump costs more the older it is...
    assert travel_cost_exact(1610, 1600) > travel_cost_exact(2020, 2010)
    assert travel_cost(1700, 1600) > travel_cost(2000, 1900)
    # ...and going further back from now never costs less
    costs = [travel_cost(2026, y) for y in (1987, 1870, 1600, 1350, -50, -2000, -66_000_000)]
    assert costs == sorted(costs)


def test_deep_time_stays_affordable():
    assert travel_cost(2026, -66_000_000) <= 6 * travel_cost(2026, 1600)


# ---- zorps from a run ----

def test_survivors_earn_zorps():
    r = run(GOOD, dodo=10)
    z = r.zorps.per_species[0]
    assert z.species_id == "dodo" and z.mean_survivors > 10 and r.zorps.total == z.zorps > 0


def test_dead_species_earn_nothing():
    assert run(HARSH, dodo=10).zorps.total == 0


def test_better_dome_earns_more():
    good = run(GOOD, dodo=10).zorps.total
    poor = run({**GOOD, "terrain": "grassland"}, dodo=10).zorps.total
    assert good > 2 * poor


def test_older_species_earn_more_for_the_same_survivors():
    # dodo (1600) and passenger pigeon (1870) both fit GOOD perfectly
    dodo = run(GOOD, dodo=10).zorps.per_species[0]
    pigeon = run(GOOD, passenger_pigeon=10).zorps.per_species[0]
    assert dodo.mean_survivors == pigeon.mean_survivors  # same fit, same seed
    assert dodo.zorps > pigeon.zorps


def test_zorps_are_deterministic_for_a_layout():
    body = {"domes": [{"id": "a", **GOOD, "residents": [{"species_id": "dodo", "count": 8}]}]}
    a = client.post("/api/sanctuary/simulate", json=body).json()["zorps"]
    b = client.post("/api/sanctuary/simulate", json=body).json()["zorps"]
    assert a == b and a["total"] > 0


# ---- endpoints ----

def test_economy_endpoint():
    e = client.get("/api/economy").json()
    assert e["start_zorps"] > 0 and e["habitat_cost"] > 0
    assert {s["species_id"] for s in e["species"]} == set(SPECIES)
    mults = [s["era_multiplier"] for s in e["species"]]
    assert mults == sorted(mults, reverse=True)  # oldest first = biggest multiplier first


def test_travel_cost_endpoint():
    r = client.get("/api/travel-cost", params={"from_year": 2026, "to_year": -2000})
    assert r.status_code == 200 and r.json()["zorps"] == travel_cost(2026, -2000)
    assert client.get("/api/travel-cost", params={"from_year": 2026, "to_year": 9999}).status_code == 422
