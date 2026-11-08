"""Forecast -> Advance (CLAUDE.md "Proposed: Forecast -> Advance"), dome capacity and
lingering outbreaks."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.economy import CONFIG as ECONOMY
from app.economy import era_multiplier
from app.main import app
from app.sanctuary.config import CONFIG
from app.sanctuary.engine import advance, outbreak_chance, prepare, run, simulate, trim_to_capacity
from app.sanctuary.schemas import DomeInput, SanctuaryAdvanceRequest, SanctuarySimRequest
from app.species import SPECIES
from tests.test_sanctuary import GOOD

client = TestClient(app)


def dome(id, cap=60, outbreak=None, **residents):
    res = []
    for sid, v in residents.items():
        n, k = v if isinstance(v, tuple) else (v, 0)
        res.append({"species_id": sid, "count": n, "from_infected": k})
    return DomeInput(id=id, **GOOD, capacity=cap, outbreak=outbreak, residents=res)


def adv(*domes, seed=1, years=10):
    return advance(SanctuaryAdvanceRequest(domes=list(domes), years=years), SPECIES, seed=seed)


# ---- /simulate: survival_by_year ----

def test_survival_by_year_per_species():
    r = simulate(SanctuarySimRequest(domes=[dome("a", dodo=10, passenger_pigeon=10)]), SPECIES, seed=2)
    for s in r.per_species:
        assert len(s.survival_by_year) == len(r.years)
        assert s.survival_by_year[0] == 1.0
        assert s.survival_by_year[-1] == pytest.approx(s.survival_probability)
        assert all(0 <= v <= 1 for v in s.survival_by_year)


# ---- capacity ----

def test_trim_to_capacity_is_proportional_and_exact():
    out = trim_to_capacity(np.array([[50, 30, 20]]), np.array([60]))
    assert out.sum() == 60 and out.tolist() == [[30, 18, 12]]
    assert trim_to_capacity(np.array([[5, 5]]), np.array([60])).tolist() == [[5, 5]]  # under: untouched


def test_counts_clamp_to_the_dome_capacity():
    setup = prepare(SanctuarySimRequest(domes=[dome("a", cap=60, dodo=50, passenger_pigeon=50)]), SPECIES, CONFIG)
    assert setup.start.sum() == 60


def test_populations_never_exceed_capacity():
    req = SanctuarySimRequest(domes=[dome("a", cap=60, dodo=30, passenger_pigeon=30), dome("b", cap=80, dodo=20)], years=50, runs=300)
    log = run(prepare(req, SPECIES, CONFIG), 50, 300, np.random.default_rng(4))
    assert (log.final.sum(axis=2) <= np.array([60, 80])).all()


def test_more_capacity_more_animals():
    small = simulate(SanctuarySimRequest(domes=[dome("a", cap=60, dodo=10)]), SPECIES, seed=5)
    big = simulate(SanctuarySimRequest(domes=[dome("a", cap=200, dodo=10)]), SPECIES, seed=5)
    assert big.zorps.per_species[0].mean_survivors > 2 * small.zorps.per_species[0].mean_survivors


# ---- outbreaks ----

def test_outbreak_chance_rises_when_crowded():
    base = CONFIG.disasters["disease"].chance
    assert outbreak_chance(np.array(10), np.array(60)) == pytest.approx(base)
    assert outbreak_chance(np.array(48), np.array(60)) == pytest.approx(base)  # 80% full
    assert outbreak_chance(np.array(60), np.array(60)) == pytest.approx(base * (1 + CONFIG.outbreak.crowd_boost))


def test_crowded_dome_gets_more_outbreaks():
    # Outbreaks starting in year 1, before a small group has had time to grow into a crowd:
    # a full dome should be ~5x as likely (5%/yr) as a lightly used one (1%/yr).
    def year1_outbreaks(n):
        req = SanctuarySimRequest(domes=[dome("a", cap=60, dodo=n)], years=1, runs=4000)
        log = run(prepare(req, SPECIES, CONFIG), 1, 4000, np.random.default_rng(6), record=True)
        return log.disease_on[0].sum()
    assert year1_outbreaks(60) > 2.5 * year1_outbreaks(10)


def test_running_outbreak_lingers_and_is_reported_as_ongoing():
    r = adv(dome("a", outbreak={"years_left": 3, "severity": 0.2}, dodo=40), years=10)
    disease = [e for e in r.domes[0].events if e.type == "disease"]
    assert disease and disease[0].year == 1 and disease[0].ongoing and not disease[0].spread
    assert disease[0].lost.get("dodo", 0) > 0


def test_outbreak_state_comes_back():
    r = adv(dome("a", outbreak={"years_left": 15, "severity": 0.05}, dodo=40), years=10)
    assert r.domes[0].outbreak is not None and r.domes[0].outbreak.years_left == 5


def test_finished_outbreak_is_ignored():
    assert dome("a", outbreak={"years_left": 0, "severity": 0.2}, dodo=5).outbreak is None


def test_moved_animals_sometimes_spread_it():
    spread = sum(any(e.spread for e in adv(dome("a", dodo=(20, 10)), seed=s).domes[0].events) for s in range(40))
    never = sum(any(e.spread for e in adv(dome("a", dodo=20), seed=s).domes[0].events) for s in range(40))
    assert spread > 10 and never == 0  # 1 - 0.85^10 ~ 80% of the time with 10 exposed animals


# ---- /advance ----

def test_advance_response_shape():
    r = adv(dome("a", dodo=10, passenger_pigeon=6), dome("b", dodo=5))
    assert r.years == 10 and [d.id for d in r.domes] == ["a", "b"]
    assert r.domes[0].start == {"dodo": 10, "passenger_pigeon": 6}
    assert set(r.domes[0].end) == {"dodo", "passenger_pigeon"}
    assert 0 <= r.luck_percentile <= 1
    assert 0 <= r.species_alive_end <= 2
    for d in r.domes:
        for e in d.events:
            assert 1 <= e.year <= 10 and e.type in ("breach", "power", "meteor", "disease")


def test_advance_end_matches_species_alive():
    r = adv(dome("a", dodo=10, passenger_pigeon=10), dome("b", passenger_pigeon=4), seed=9)
    alive = {sid for d in r.domes for sid, n in d.end.items() if n > 0}
    assert r.species_alive_end == len(alive)


def test_advance_zorps_follow_the_payout_rule():
    r = adv(dome("a", dodo=10, passenger_pigeon=10), seed=3)
    totals = {}
    for d in r.domes:
        for sid, n in d.end.items():
            totals[sid] = totals.get(sid, 0) + n
    expected = sum(round(ECONOMY.zorps_per_survivor * n * era_multiplier(SPECIES[sid].era_year))
                   for sid, n in totals.items() if n >= 2)
    assert r.zorps_earned == expected


def test_advance_luck_varies_and_endpoint_is_fresh_each_call():
    body = {"domes": [{"id": "a", **GOOD, "capacity": 60, "residents": [{"species_id": "dodo", "count": 10}]}], "years": 10}
    lucks = {client.post("/api/sanctuary/advance", json=body).json()["luck_percentile"] for _ in range(8)}
    assert len(lucks) > 1  # a fresh future every call


def test_advance_is_reproducible_with_a_seed():
    a = adv(dome("a", dodo=10, passenger_pigeon=10), seed=42)
    b = adv(dome("a", dodo=10, passenger_pigeon=10), seed=42)
    assert a == b


def test_splitting_loses_less_than_concentrating():
    """Across many advances, the worst decades hurt a concentrated species more."""
    def worst(*domes):
        alive = [adv(*domes, seed=s, years=30).species_alive_end for s in range(60)]
        return np.percentile(alive, 10)
    one = worst(dome("a", dodo=10, passenger_pigeon=10))
    two = worst(dome("a", dodo=5, passenger_pigeon=5), dome("b", dodo=5, passenger_pigeon=5))
    assert two >= one


def test_endpoint_accepts_the_frontend_request():
    body = {"domes": [{"id": "dome-1", **GOOD, "capacity": 60,
                       "outbreak": {"years_left": 3, "severity": 0.2},
                       "residents": [{"species_id": "dodo", "count": 10, "from_infected": 2},
                                     {"species_id": "unicorn", "count": 3}]}],
            "years": 10, "runs": 1000}
    r = client.post("/api/sanctuary/advance", json=body)
    assert r.status_code == 200
    j = r.json()
    assert set(j) == {"years", "domes", "species_alive_end", "luck_percentile", "zorps_earned"}
    assert set(j["domes"][0]) == {"id", "start", "end", "events", "outbreak"}
    assert "unicorn" not in j["domes"][0]["start"]
