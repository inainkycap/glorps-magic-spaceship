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
3. **DNA Lab**: a minigame (next branch); its **score is the number of individuals
   rescued**.
4. **Sanctuary** (*sim PROPOSED, pending backend*): domes on Glorp's home planet (1 built,
   up to 6; more cost fuel). **Set each dome's conditions** (terrain, temperature,
   humidity, oxygen, pressure), **place rescued individuals**, then **run 1,000 futures**
   (Monte Carlo) for all domes together. Growth depends on how well a dome's conditions fit
   each species' needs. **Disasters strike per dome**, so splitting a species across domes
   is safer. The sim contract isn't agreed yet: see "Proposed: sanctuary sim".

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
- `era_year` (number, required): the year Glorp travels to, e.g. `1600`. Drives the era
  timeline. `era` stays as the display string.
- `hotspots[]`: `{ id, label, sprite, x, y, fact, dna, unlocks }`
  - `x`, `y` are % positions (0–100) in the explore scene
  - `dna`: boolean — scanning it gives a DNA fragment
  - `unlocks`: intervention id or `null`
- `threats[]`: `{ id, name, description, effect }`
  - `effect`: object with any of `mortality` (extra annual death fraction),
    `habitat_decline` (annual carrying-capacity loss fraction),
    `shock_prob` + `shock_severity` (chance per year of a shock, fraction killed)
- `interventions[]`: `{ id, name, description, mitigates }`
  - `mitigates`: `{ [threat_id]: fraction_removed (0–1) }`
- `goal_survival` (e.g. 0.8), `max_interventions` (e.g. 2), `dna_required` (e.g. 3)
- `sim`: `{ model, start_year, years, start_population, carrying_capacity, growth_rate }`
  - `model`: "logistic" (later "predator_prey")

### API
| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok" }` |
| GET | `/api/species` | `SpeciesSummary[]`: the basic-info fields only, which **must include `lat`, `lon`, `era_year`** (the map needs them) |
| GET | `/api/species/{id}` | full species file |
| POST | `/api/simulate` body `{ species_id, interventions: string[], runs }` | `SimulateResponse` |
| GET | `/api/wiki/{title}` (stretch) | `{ title, summary, image_url }` |

`SimulateResponse`:
```json
{
  "years": [1600, 1601, ...],
  "percentiles": { "p5": [...], "p25": [...], "p50": [...], "p75": [...], "p95": [...] },
  "sample_paths": [[...], ...],          // 25 paths, each same length as years
  "survival_probability": 0.83,          // fraction of runs with population > 0 at the end
  "success": true,                       // survival_probability >= goal_survival
  "advice": [                            // one per threat you did NOT tackle
    { "threat_id": "rats", "threat_name": "...", "intervention_id": "rat_control",
      "survival_probability": 0.91 }
  ]
}
```

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
  - DNA Lab `/lab/:speciesId`: minigame (placeholder page for now); score = individuals
    rescued.
  - Sanctuary `/sanctuary`: Glorp's home planet with up to 6 dome sites (1 built; building
    more costs fuel), the pool of rescued individuals not yet placed, and "Run 1,000
    futures" for all domes together (fan chart of species alive, per-species survival,
    expected and worst-case species saved; compare mode overlays the previous run).
  - Dome `/sanctuary/:domeId`: the dome large, with Glorp's control panel (name, terrain,
    temperature/humidity/oxygen/pressure dials; the interior reacts live), placement
    steppers to/from the pool, a fit bar per resident species (undiscovered needs show
    "???"), and this dome's last-run results. The sim is PROPOSED, pending backend; mock
    mode runs a client-side mock (`frontend/src/mocks/mockSanctuarySim.ts`).
  - Dome state, rescued individuals and the last two runs persist in progress.
- Map projection is equirectangular: `x% = (lon+180)/360`, `y% = (90−lat)/180`.
  Glorp's current location (lat/lon/era_year) is part of the persisted progress.
- Respect `prefers-reduced-motion` (the travel animation becomes an instant jump).
- Fan chart is hand-written SVG (no chart library): 25 sample paths, 50% band (p25–p75),
  90% band (p5–p95), median line (p50).

## Game rules
Frontend-only for now; all constants live in `frontend/src/game/fuel.ts` (tests in
`fuel.test.ts`, run with `npm test` in `frontend/`). If the backend takes these over, add
them to the contract above and keep the frontend constants as fallbacks.

**Fuel.** Glorp starts with 100 fuel (also the tank size), saved in the player's progress.
Low-fuel warning at 25. Costs: travel (below) and **building a sanctuary dome: 15**
(`FUEL_COSTS.buildDome`; the first dome is free, 6 sites in all). A placeholder cost for
DNA retries (5) is defined but unused. There is no way to earn fuel back yet.

**Travel cost.** Clicking a pin (or its timeline diamond) opens a bubble showing the jump
("1600 → 1870 · 270 years into the future") and the fuel it costs; Travel is disabled if
fuel is short. Time is "thicker" the further back you go:

    thickness(year) = 1 + (PRESENT_YEAR − year) / 100        PRESENT_YEAR = 2026
    cost = TRAVEL_BASE_COST + TRAVEL_TIME_COST_K × ∫ thickness(year) d(year) over the years crossed
         = TRAVEL_BASE_COST + TRAVEL_TIME_COST_K × |b − a| × thickness((a + b) / 2)

with `TRAVEL_BASE_COST = 10` and `TRAVEL_TIME_COST_K = 0.03`. The closed form holds because
thickness is linear: the integral is the span times the thickness at the midpoint. The charge
is the exact cost rounded **up** to a whole unit. Properties: direction doesn't matter
(A→B = B→A); a decade further back costs more (1610→1600 = 12 > 2020→2010 = 11); a trip
within the same era costs the base 10; staying put (same place and era) is free. Examples:
2026→1600 = 51, 2026→1870 = 19, 1600→1870 = 42. Thickness reaches 0 at year 2126, so the
formula assumes eras up to about the present.

## Proposed: species content + needs (frontend, needs backend ok)
**Status: proposal.** The frontend already reads these fields (from mocks) and copes with
any of them being missing. They are NOT part of the agreed contract until the backend
confirms. TypeScript: `Species`, `Need`, `SpeciesFacts`, `Habitat`, `Source`, `NeedKey` in
`frontend/src/types.ts`.

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

Notes for the backend:
- These fields belong in every `backend/data/species/<id>.json` and in
  `GET /api/species/{id}`. The `/api/species` summaries don't need them.
- `needs` will drive the sanctuary sim: growth depends on how well a sanctuary's
  terrain/temperature/humidity/oxygen/pressure fit each species' needs. Most real species
  share near-normal oxygen and sea-level pressure; those matter mainly for alien sanctuary
  domes.
- The frontend mocks in `frontend/src/mocks/` (`dodo.json`, `passenger_pigeon.json`) hold the
  draft content for the dodo and passenger pigeon; copy it into the real files. To parse an
  uncertain bound, strip a leading `~`; treat `"?"` as missing.

## Proposed: sanctuary sim (frontend, needs backend ok)
**Status: proposal.** Replaces the old `/api/simulate`. TypeScript: `SanctuarySimRequest`,
`SanctuarySimResponse` and related types in `frontend/src/types.ts`. With
`VITE_USE_MOCKS=true` the frontend runs a client-side **mock** model instead
(`frontend/src/mocks/mockSanctuarySim.ts`; mock only, not the real model).

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

Notes for the backend:
- **Disasters are per dome**: dome breach, power failure, meteor strike, disease outbreak.
  They are **correlated within a dome** (one event hits every resident of that dome at once)
  and **independent between domes**. That is what makes splitting a species across domes
  safer, and the player should see that in `worst_case_species_saved`.
- Growth should depend on how well each dome fits each species' `needs` (see the proposed
  content section, including `needs.terrain.types`); poor fit should shrink a population,
  and small populations should be able to collapse. The frontend's fit proposal is in
  `frontend/src/game/fit.ts` (1 inside the ideal range, bell-curve falloff outside;
  geometric mean across needs); the backend can use it or replace it.
- The mock's tuning (disaster chances, growth, carrying capacity) is just a starting point.
  Its unit test (`mockSanctuarySim.test.ts`) checks that splitting beats concentrating on
  the worst case; the real model should keep that property.

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
