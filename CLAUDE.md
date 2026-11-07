# Glorp's Magic Spaceship — WHACK '26 (Marshall Wace track, theme: "New Worlds")

Glorp's spaceship travels through time to rescue extinct species (first world: Mauritius,
~1600) and give them a new home in the player's Sanctuary ("new world"): sealed glass
**domes on Glorp's home planet**, each with its own controlled environment. The loop:

1. **Map**: a full-screen pixel world map with an era timeline; each species is a pin at
   its real lat/lon and era. Travelling costs **fuel** (more the further back in time; see
   "Game rules"), then Glorp flies there while the era ticks over.
2. **Explore**: a pixel scene of the species' world. Scan hotspots to learn facts,
   **discover the species' needs** (ideal terrain, temperature, humidity, oxygen, pressure)
   for the field guide, and **collect DNA** fragments.
3. **DNA Lab**: a quick pairing minigame (frontend-only); its result is the **number of
   individuals rescued** (4–20) for that species. See "Game rules".
4. **Sanctuary**: domes on Glorp's home planet (1 built,
   up to 6; more cost fuel). **Set each dome's conditions** (terrain, temperature,
   humidity, oxygen, pressure), **place rescued individuals**, then **run 1,000 futures**
   (Monte Carlo) for all domes together. Growth depends on how well a dome's conditions fit
   each species' needs. **Disasters strike per dome**, so splitting a species across domes
   is safer. See "Sanctuary sim" and `backend/MODEL.md`.

The old Lab loop (protecting a species *in the past* by picking interventions against
threats, then simulating) is **dropped**.

Flow: Map (fuel) → travel → Explore (scan, discover needs, collect DNA) → DNA Lab
(minigame, score = individuals rescued) → Sanctuary (domes on Glorp's home planet:
conditions, placement, 1,000 futures).

Judged on: Technical Challenge, Innovation, Presentation.

## Stack
- `frontend/`: React + Vite + TypeScript. Dev server on :5173, `/api` proxied to :8000.
- `backend/`: FastAPI (Python). Runs on :8000.

## Ownership — IMPORTANT
- Person A owns `backend/` (data, sim engine, API).
- Person B owns `frontend/` (everything the player sees).
- Never edit the other person's folder. The contract below is the only shared thing.
  If the contract has to change, change it HERE and in `frontend/src/types.ts` in the same
  PR, and tell the other person.

## Contract

### Species file — `backend/data/species/<id>.json`
Adding a species = adding one file. Fields:
- `id`, `name`, `scientific_name`, `status` ("extinct" | "critically_endangered" | ...),
  `era` (string, e.g. "1600"), `location`, `kind` ("bird" | "insect" | "plant" | ...)
- `lat`, `lon` (numbers, required): where the species lived, in degrees
  (lat -90…90, lon -180…180). Used to place its pin on the world map.
- `era_year` (integer, required): the year Glorp travels to, e.g. `1600`. Drives the era
  timeline. **Negative means BCE** (`-2000` = 2000 BCE); there is no year 0; range
  −50,000 to 2026. `era` stays as the display string (e.g. `"~2000 BCE"`, `"900 CE"`).
- `hotspots[]`: `{ id, label, sprite, x, y, fact, dna, reveals? }`
  - `x`, `y` are % positions (0–100) in the explore scene
  - `dna`: boolean — scanning it gives a DNA fragment
  - `reveals`: need key or array of need keys (see "Species content + needs")
- `dna_required` (e.g. 3): DNA fragments needed before the DNA Lab opens
- Content fields (`intro`, `description`, `facts`, `habitat`, `needs`, `sources`): see
  "Species content + needs".
- **Legacy, optional** (from the dropped "protect it in the past" Lab; nothing uses them):
  `hotspots[].unlocks`, `threats[]`, `interventions[]`, `goal_survival`, `max_interventions`,
  `sim`. The backend accepts but doesn't require them; new species files should leave them
  out. To do (frontend): drop them from `types.ts` along with the legacy `simulate()` in
  `api.ts` and the `simulate_*.json` mocks.

The backend validates every species file at startup (the server won't start on a bad file):
types and ranges, every `unlocks`/`mitigates` id exists, and there are at least
`dna_required` DNA hotspots.

### API
| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok" }` |
| GET | `/api/species` | `SpeciesSummary[]`: the basic-info fields only, which **must include `lat`, `lon`, `era_year`** (the map needs them) |
| GET | `/api/species/{id}` | full species file (404 if unknown); optional fields missing from the file are left out, not `null` |
| POST | `/api/sanctuary/simulate` | `SanctuarySimResponse` (see "Sanctuary sim") |
| GET | `/api/timeline` | `Timeline` (see below): every species' era, sorted, with labels and log-scale positions |
| GET | `/api/economy` (proposed) | zorps rules, prices and per-species era multipliers (see "Proposed: zorps") |
| GET | `/api/travel-cost?from_year=&to_year=` (proposed) | `{ from_year, to_year, zorps }` |
| GET | `/api/wiki/{title}` | `WikiSummary`: `{ title, summary, image_url, url }` (`image_url`/`url` may be `null`); 404 if no article, 502 if Wikipedia is unreachable and it isn't cached |

The old `POST /api/simulate` (single species, interventions) was never built and is gone.

`/api/timeline` (new; the frontend can draw the era timeline straight from it). Eras now run
from 2000 BCE to 1987, so positions are on a **log scale of years before now** (10, 100,
1,000 years ago are evenly spaced; a linear axis would squash everything after 1500 into the
last ~12%). Position 0 = the oldest species, 1 = the present (2026).
```json
{
  "present_year": 2026, "scale": "log", "oldest_year": -2000,
  "eras":  [{ "species_id": "woolly_mammoth", "name": "Woolly mammoth", "era_year": -2000,
              "label": "2000 BCE", "position": 0.0 },
            { "species_id": "elephant_bird", "name": "Elephant bird", "era_year": 900,
              "label": "900 CE", "position": 0.211 }, ...],
  "ticks": [{ "year": -1000, "label": "1000 BCE", "position": 0.047 }, ...]
}
```
- `eras` is sorted oldest first (ties by id); `ticks` are suggested axis labels between
  the oldest era and now. Labels: negative years "N BCE", 1–999 "N CE", then plain years.
- Formula (`backend/app/timeline.py`): `years_ago = 2026 − year + 10`;
  `position = 1 − (ln years_ago − ln 10) / (ln years_ago(oldest) − ln 10)`.

`/api/wiki/{title}` uses the official Wikipedia REST API and caches every answer in
`backend/data/wiki_cache/` (committed), so the text works offline. `title` is an article
title as in the URL (`Ball's_Pyramid`); for a species' `sources[].url`, use the part after
`/wiki/`. Every species source is pre-cached (`python -m scripts.prefetch_wiki` in
`backend/` refreshes it). `image_url` points at Wikimedia, so images still need internet.

TypeScript mirror of all of this: `frontend/src/types.ts`. Keep them in sync.

## Frontend conventions
- Mocks live in `frontend/src/mocks/`. `VITE_USE_MOCKS=true` (in `frontend/.env.local`)
  makes `src/api.ts` serve mocks instead of calling the backend.
- Progress (scanned hotspots, DNA, saved species) persists in localStorage; wrap
  reads/writes in try/catch.
- Screens (pixel art: `image-rendering: pixelated`):
  - Map `/`: world map + era timeline + fuel gauge; clicking a pin opens a travel bubble
    (jump, fuel cost), and confirming plays the travel animation.
  - Explore `/explore/:speciesId`: Glorp's arrival intro, scan hotspots (facts, DNA, needs),
    field guide; "Go to DNA Lab" once DNA ≥ `dna_required`.
  - DNA Lab `/lab/:speciesId`: base-pairing minigame (A↔T, C↔G) against the clock; Glorp
    announces the individuals rescued, then "Send to Sanctuary". Retries cost fuel.
  - Sanctuary `/sanctuary`: Glorp's home planet with up to 6 dome sites (1 built; building
    more costs fuel), the pool of rescued individuals not yet placed, and "Run 1,000
    futures" for all domes together (fan chart of species alive, per-species survival,
    expected and worst-case species saved; compare mode overlays the previous run).
  - Dome `/sanctuary/:domeId`: the dome large, with Glorp's control panel (name, terrain,
    temperature/humidity/oxygen/pressure dials; the interior reacts live), placement
    steppers to/from the pool, a fit bar per resident species (computed from discovered
    needs only; undiscovered needs show as a grey "?" segment and give no hint), and this
    dome's last-run results. Mock mode runs a client-side mock
    (`frontend/src/mocks/mockSanctuarySim.ts`) instead of the backend sim.
  - Dome state, rescued individuals and the last two runs persist in progress.
- Map projection is equirectangular: `x% = (lon+180)/360`, `y% = (90−lat)/180`.
  Glorp's current location (lat/lon/era_year) is part of the persisted progress.
- Respect `prefers-reduced-motion` (the travel animation becomes an instant jump).
- Fan chart is hand-written SVG (no chart library): 25 sample paths, 50% band (p25–p75),
  90% band (p5–p95), median line (p50).

## Game rules
Frontend-only for now; fuel constants live in `frontend/src/game/fuel.ts`, DNA Lab rules in
`frontend/src/game/dna.ts` (tests next to them, run with `npm test` in `frontend/`). If the
backend takes these over, add them to the contract above and keep the frontend constants
as fallbacks.

**Fuel.** Glorp starts with 100 fuel (also the tank size), saved in the player's progress.
Low-fuel warning at 25. Costs: travel (below), **building a sanctuary dome: 18**
(`FUEL_COSTS.buildDome`; the first dome is free, 6 sites in all), and **retrying the DNA
Lab: 4** (`FUEL_COSTS.dnaRetry`; the first attempt per species is free). There is no way to
earn fuel back yet.

**Fuel budget target** (enforced by the "fuel budget" tests in `fuel.test.ts`). Starting
fresh with the 2 current species, visiting the newest era first and allowing one DNA retry
per species:
- affordable: **2 species + 2 extra domes** (94) or **3 species + 1 extra dome** (88, with a
  hypothetical ~1750 third species)
- not affordable: 3 species + 2 extra domes (106), or 2 species + all 5 extra domes (148)

So the player has to choose between more species and more domes. Route order matters:
going to 1600 first and back to 1870 re-crosses "thick" time (77 instead of 50 for the two
trips), which costs about a dome. Retune the constants together, and keep those tests
passing.

**DNA Lab (frontend-only).** A pairing minigame: for each base of a strand the player picks
its partner (A↔T, C↔G) before time runs out. Older species are harder; the one difficulty
formula is `dnaDifficulty(era_year)` in `game/dna.ts`:
- bases = 10 + 1 per 150 years before 2026 (max 16)
- degraded bases ("?", their letter flashes briefly on their turn) = 1 per 120 years (max 6,
  at most a third of the strand)
- time = 20 s, plus 1 s per base beyond 12

So the passenger pigeon (1870) gets 11 bases, 1 degraded, 20 s; the dodo (1600) gets 13 bases,
3 degraded, 21 s. Quality = fraction matched correctly; **individuals rescued = 4 + 16 ×
quality, rounded (4–20)**. The best run per species is kept (`Progress.dnaBest`) and its
individuals become that species' rescued total, which fills the Sanctuary's unplaced pool.
**The backend never sees the minigame:** its only effect on the backend is
`residents[].count` in `POST /api/sanctuary/simulate` (how many of those individuals the
player placed in each dome).

**Travel cost.** Clicking a pin (or its timeline diamond) opens a bubble showing the jump
("1600 → 1870 · 270 years into the future") and the fuel it costs; Travel is disabled if
fuel is short. Time is "thicker" the further back you go:

    thickness(year) = 1 + (PRESENT_YEAR − year) / 100        PRESENT_YEAR = 2026
    cost = TRAVEL_BASE_COST + TRAVEL_TIME_COST_K × ∫ thickness(year) d(year) over the years crossed
         = TRAVEL_BASE_COST + TRAVEL_TIME_COST_K × |b − a| × thickness((a + b) / 2)

with `TRAVEL_BASE_COST = 8` and `TRAVEL_TIME_COST_K = 0.025`. The closed form holds because
thickness is linear: the integral is the span times the thickness at the midpoint. The charge
is the exact cost rounded **up** to a whole unit. Properties: direction doesn't matter
(A→B = B→A); a decade further back costs more (1610→1600 = 10 > 2020→2010 = 9); a trip
within the same era costs the base 8; staying put (same place and era) is free. Examples:
2026→1600 = 42, 2026→1870 = 15, 1600→1870 = 35. Thickness reaches 0 at year 2126, so the
formula assumes eras up to about the present.

## Species content + needs
**Status: agreed** (backend implements it since PR #6). The frontend copes with any of
these fields being missing. TypeScript: `Species`, `Need`, `SpeciesFacts`, `Habitat`,
`Source`, `NeedKey` in `frontend/src/types.ts`.

All fields optional, added to the species file:
- `intro`: string, at most 2 sentences in Glorp's voice (shown in Glorp's speech bubble on
  arrival in Explore)
- `description`: string, a paragraph (field guide)
- `facts`: `{ height, weight, diet, lifespan, extinct_year, cause }`, all strings
  (`extinct_year` may be a number)
- `habitat`: `{ biome, climate, elevation }`, all strings
- `needs`: object with keys `terrain`, `temperature`, `humidity`, `oxygen`, `pressure`; each
  `{ value?, min?, max?, unit?, why }`
  - `terrain` uses `value` (a description) plus `types`: the dome terrains that suit it,
    from `"forest" | "grassland" | "wetland" | "tundra"` (e.g. dodo `["forest","wetland"]`),
    for the sanctuary sim; the others use `min`/`max` plus `unit`:
    `temperature` °C, `humidity` %, `oxygen` %, `pressure` kPa
  - `why`: one sentence on why the species needs this
  - `min`/`max` are numbers, or strings when uncertain: `"~18"` (approximate) or `"?"`
    (unknown). The same `~` / `?` convention applies to the text in `facts`.
- `sources`: `[{ title, url }]`
- `hotspots[].reveals`: optional need key **or array of need keys**, e.g. `"terrain"` or
  `["oxygen", "pressure"]`; scanning that hotspot discovers those needs in the field guide
  (undiscovered needs show "???"). Every need a species has should be revealed by at least
  one hotspot. Oxygen and pressure are usually revealed together by a sea-level/coast
  hotspot.

Example `needs` (dodo):
```json
"needs": {
  "terrain":     { "value": "Forest floor with fallen fruit, near fresh water",
                   "why": "It couldn't fly or climb, so it fed and nested on the ground, and many remains are found around freshwater marshes." },
  "temperature": { "min": "~18", "max": "~30", "unit": "°C",
                   "why": "It lived its whole life on a tropical island that never sees frost or snow." },
  "humidity":    { "min": "~65", "max": "~90", "unit": "%",
                   "why": "Mauritius's lowland forests are humid all year, which keeps fruit trees fruiting." },
  "oxygen":      { "min": "~20", "max": "~21", "unit": "%",
                   "why": "Ordinary sea-level air, like almost every bird alive today." },
  "pressure":    { "min": "~95", "max": "~102", "unit": "kPa",
                   "why": "A lowland island bird: it lived close to sea-level air pressure (~101 kPa)." }
}
```

Notes:
- These fields live in every `backend/data/species/<id>.json` and in
  `GET /api/species/{id}`. The `/api/species` summaries don't include them.
- `needs` drives the sanctuary sim: growth depends on how well a dome's
  terrain/temperature/humidity/oxygen/pressure fit each species' needs. Most real species
  share near-normal oxygen and sea-level pressure; those matter mainly for alien domes.
- To parse an uncertain bound, strip a leading `~`; treat `"?"` as missing.
- The frontend mocks (`frontend/src/mocks/<id>.json`) are copies of the backend files.
  The backend files are the source of truth: edit there, then copy to the mocks.

## Sanctuary sim
**Status: agreed** (backend implements it since PR #7). TypeScript: `SanctuarySimRequest`,
`SanctuarySimResponse` and related types in `frontend/src/types.ts`. With
`VITE_USE_MOCKS=true` the frontend runs a client-side **mock** model instead
(`frontend/src/mocks/mockSanctuarySim.ts`; mock only, not the real model). The real model
is explained in `backend/MODEL.md`.

`POST /api/sanctuary/simulate`

Request:
```json
{
  "domes": [
    { "id": "dome-1", "terrain": "forest", "temperature": 24, "humidity": 75,
      "oxygen": 21, "pressure": 101,
      "residents": [{ "species_id": "dodo", "count": 5 }, { "species_id": "passenger_pigeon", "count": 5 }] }
  ],
  "years": 50,
  "runs": 1000
}
```
- `terrain` is one of `forest | grassland | wetland | tundra`; `temperature` °C,
  `humidity` %, `oxygen` %, `pressure` kPa (the units of species `needs`).

Response:
```json
{
  "years": [0, 1, ..., 50],
  "species_alive": { "p5": [...], "p25": [...], "p50": [...], "p75": [...], "p95": [...] },
  "sample_paths": [[...], ...],
  "per_species": [{ "species_id": "dodo", "survival_probability": 0.98 }],
  "per_dome": [{ "id": "dome-1",
                 "survival_by_species": [{ "species_id": "dodo", "survival_probability": 0.9 }],
                 "disaster_rate": 0.42 }],
  "expected_species_saved": 1.96,
  "worst_case_species_saved": 2
}
```
- `species_alive`: percentiles across runs of how many species are alive, per year.
  **A species counts as surviving if any dome still has it.**
- `sample_paths`: 25 runs of the same count (for the fan chart).
- `per_species[].survival_probability`: fraction of runs with the species alive in any dome
  at the end. `per_dome[].survival_by_species`: alive in that dome at the end.
- `per_dome[].disaster_rate`: fraction of runs in which that dome had at least one disaster.
- `expected_species_saved`: mean species alive at the end. `worst_case_species_saved`: the
  5th percentile of that, as a whole number of species (lower nearest rank).

How the backend behaves:
- **Disasters are per dome**: dome breach, power failure, meteor strike, disease outbreak.
  They are **correlated within a dome** (one event hits every resident of that dome at once)
  and **independent between domes**, so splitting a species across domes raises
  `worst_case_species_saved` (the backend tests check this across several seeds).
- **Fit** uses the same formula as `frontend/src/game/fit.ts` (1 inside the ideal range,
  bell-curve falloff outside, geometric mean across needs), so the fit bars match the sim.
  Poor fit means fewer births and more deaths; small populations can collapse.
- **Same request, same result**: the random seed comes from the request, so re-running an
  unchanged sanctuary gives identical numbers, and compare mode shows the player's change,
  not luck.
- **Untrusted input is sanitised, not rejected**: `residents[].count` is clamped to 0–50 per
  species per dome; unknown `species_id`s are dropped; dome conditions are clamped to the
  control-panel ranges (temperature −30–50 °C, humidity 0–100 %, oxygen 10–35 %, pressure
  50–200 kPa). An unknown `terrain`, or more than 12 domes, is a 422.
- All tuning (birth/death rates, dome capacity, disaster chances and kill fractions) lives
  in `backend/data/sanctuary.json`.

## Proposed: zorps (backend, needs frontend ok)
**Status: proposal** (implemented in the backend). Zorps replace fuel: an alien currency,
**uncapped**, spent on travel and habitats, and earned by animals that survive sanctuary
runs. Older species earn more. Code: `backend/app/economy.py`; numbers:
`backend/data/economy.json`. No `types.ts` changes yet (frontend to add).

Everything uses the timeline's log scale of years before now, `age(y) = log10(2026 − y + 10)`
(1.0 for the present):
- **Era multiplier** `= 1 + 1.535 × (age − 1)`: ×1 now, ×2.1 golden toad (1987), ×2.9
  passenger pigeon, ×3.5 dodo, ×4.6 aurochs, ×5.0 mammoth (2000 BCE).
- **Zorps earned by a run** `= 0.5 × Σ species (mean survivors after the run × era multiplier)`,
  where mean survivors = animals alive at the end, averaged over all runs, summed over domes.
  Dead species earn 0. Typical: 10 dodos in a good dome ≈ 110; 10 dodos + 10 pigeons split
  over two good domes ≈ 187; a poor dome ≈ 20.
- **Travel cost** `= ceil(8 + 30 × |age(a) − age(b)|)`, 0 for the same era: from 2026,
  golden toad 29, pigeon 45, dodo 58, moa 64, aurochs 78, **mammoth 87**. Further back
  always costs more, but each decade gets cheaper the further back it is (the opposite of
  the old fuel rule; it's what keeps deep time affordable).
- **Habitat (dome) cost** 25; **start** with 100 zorps. Suggested values: the frontend owns
  how they're charged.

API:
- `POST /api/sanctuary/simulate` response gains
  `"zorps": { "total": 110, "per_species": [{ "species_id": "dodo", "mean_survivors": 62.41,
  "era_multiplier": 3.52, "zorps": 110 }] }` (same layout, same zorps: it's seeded).
- `GET /api/economy`: `{ present_year, start_zorps, zorps_per_survivor, habitat_cost,
  travel_base_cost, era_multiplier_per_decade_of_age, travel_cost_per_decade_of_age,
  species: [{ species_id, era_year, era_label, era_multiplier, travel_cost_from_present }] }`
  (species oldest first).
- `GET /api/travel-cost?from_year=2026&to_year=-2000` → `{ from_year, to_year, zorps }`
  (422 outside −50,000…2026).

**Still to agree (anti-farming):** the backend reports what a run *would* earn; it doesn't
track balances. Since the same layout always gives the same result, the frontend should
pay out only once per layout (e.g. per `runKey`), or only the improvement over the best
layout so far, or once per "season". Also note splitting animals across more domes earns
more (more room to grow), so the habitat cost is a balance lever.

## Git workflow
- `main` is protected. Never commit to it directly.
- Branch per feature: `feat/fe-hub`, `feat/be-sim-engine`, `fix/...`.
- Small PRs, merged with squash. The other person reviews.
- Before opening a PR: `git fetch && git rebase origin/main`, make sure it builds.

## Contract changelog
- 2026-11-07 — added lat/lon/era_year for the world map (frontend). Backend: include these
  in every species JSON and in the /api/species summaries.
- 2026-11-07: PROPOSED species content fields (intro, description, facts, habitat, needs with
  why, sources, hotspot.reveals). Backend: confirm or change, then add to species files.
- 2026-11-07: NEW GAME LOOP. Map (fuel) → Explore (scan, needs, DNA) → DNA Lab minigame
  (score = individuals rescued) → Sanctuary (domes, conditions, placement, 1,000 futures,
  per-dome disasters). The old "protect the species in the past" Lab is dropped: the
  frontend no longer uses `threats`, `interventions`, `hotspots[].unlocks` or `/api/simulate`
  with interventions. Keep them until a sanctuary sim contract replaces them (PROPOSED,
  pending backend). `hotspots[].reveals` may now be a need key or an array of keys.
- 2026-11-07: PROPOSED sanctuary sim: `POST /api/sanctuary/simulate` (domes with terrain,
  temperature, humidity, oxygen, pressure and residents → species-alive fan chart,
  per-species and per-dome survival, disaster rate, expected and worst-case species saved),
  plus `needs.terrain.types`. Disasters (breach, power failure, meteor, disease) are per
  dome: correlated within a dome, independent between domes. Backend: confirm or change,
  then implement; the frontend uses a mock until then.
- 2026-11-07: DNA Lab minigame (frontend-only) sets individuals rescued; fit bar hides undiscovered
  needs; fuel rebalanced. Backend: clamp residents[].count.
- 2026-11-07: AGREED species content + needs and the sanctuary sim (backend PRs #6, #7).
  Backend now clamps residents/conditions and drops unknown species instead of a 422.
  Legacy fields (`threats`, `interventions`, `goal_survival`, `max_interventions`, `sim`,
  `hotspots[].unlocks`) are optional; `POST /api/simulate` removed from the contract.
  Frontend: drop the legacy types, `simulate()` and `simulate_*.json` when convenient.
- 2026-11-07: `GET /api/wiki/{title}` implemented (cached, works offline for text); response
  gains `url`. New `WikiSummary` type in `types.ts`. New species: `lord_howe_stick_insect`
  (Lord Howe Island, 1915), which needs sprites from the frontend.
- 2026-11-07: Species pack (no contract change): `quagga` (1870), `golden_toad` (1987),
  `pyrenean_ibex` (1910), `thylacine` (1900), `great_auk` (1800), `stellers_sea_cow` (1741),
  `woolly_mammoth` (-2000). Placeholder sprites for these and the stick insect (residents,
  Explore backgrounds, 34 hotspot icons) were added as new files in
  `frontend/public/sprites/` by `frontend/scripts/make-species-sprites.mjs`; no frontend
  code changed. Frontend to-dos: the mammoth (era -2000) costs ~2,135 fuel with the current
  travel formula, so it's unreachable until travel cost is capped or reworked for deep time;
  the era timeline now spans -2000 to 1987; quagga and passenger pigeon share 1870; the
  mocks and `api.ts` mock list only have the dodo and pigeon.
- 2026-11-07: Deep time. `era_year` may be negative (BCE; no year 0; validated). New
  `GET /api/timeline` (log-scale positions + BCE/CE labels) for the era timeline. Four
  stepping-stone species between the mammoth and 1500: `aurochs` (50 BCE), `elephant_bird`
  (900 CE), `haasts_eagle` (1300), `moa` (1350). Frontend to-dos: add a `Timeline` type to
  `types.ts` and draw the timeline from `/api/timeline`; sprites for the four new species
  (residents, backgrounds) and new hotspot icons `scroll`, `giant-egg`, `talon`, `pebbles`.
  Note: stepping stones alone don't make the mammoth reachable with the current travel
  formula (the time cost of a route is the same however you split it, plus a base cost per
  hop); travel cost needs a cap, a log-time formula, or refuelling.
- 2026-11-07: PROPOSED (backend) zorps replace fuel: uncapped currency for travel and
  habitats, earned by surviving animals, scaled by era (log scale). Sim response gains
  `zorps`; new `GET /api/economy` and `GET /api/travel-cost`. Anti-farming rule still to
  agree. Frontend: add types, replace the fuel UI and rules.
