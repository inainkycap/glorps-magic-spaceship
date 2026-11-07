# Glorp's Magic Spaceship — WHACK '26 (Marshall Wace track, theme: "New Worlds")

Glorp's spaceship travels through time to rescue extinct species (first world: Mauritius,
~1600) and give them a new home in the player's Sanctuary ("new world"). The loop:

1. **Map**: a full-screen pixel world map with an era timeline; each species is a pin at
   its real lat/lon and era. Travelling costs **fuel** (more the further back in time; see
   "Game rules"), then Glorp flies there while the era ticks over.
2. **Explore**: a pixel scene of the species' world. Scan hotspots to learn facts,
   **discover the species' needs** (ideal terrain, temperature, humidity, oxygen, pressure)
   for the field guide, and **collect DNA** fragments.
3. **DNA Lab**: a minigame (next branch); its **score is the number of individuals
   rescued**.
4. **Sanctuary** (*PROPOSED, pending backend*): build domes, **set each dome's
   conditions**, **place rescued individuals**, then **run 1,000 futures** (Monte Carlo) to
   see whether they survive. Growth depends on how well a dome's conditions fit each
   species' needs. **Disasters strike per dome**, so splitting a species across domes is
   safer. The sim contract isn't agreed yet: see "Proposed: species content + needs".

The old Lab loop (protecting a species *in the past* by picking interventions against
threats, then simulating) is **dropped**.

Flow: Map (fuel) → travel → Explore (scan, discover needs, collect DNA) → DNA Lab
(minigame, score = individuals rescued) → Sanctuary (domes, placement, 1,000 futures).

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
  - Sanctuary `/sanctuary`: domes with set conditions, place individuals, run 1,000
    futures (PROPOSED; pending the backend sim contract).
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
Low-fuel warning at 25. Travel is the only cost wired up so far; placeholder costs for DNA
retries (5) and opening a sanctuary (10) are defined but unused.

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
  - `terrain` uses `value` (a description); the others use `min`/`max` plus `unit`:
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
