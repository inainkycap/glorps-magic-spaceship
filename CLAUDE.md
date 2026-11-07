# Glorp's Magic Spaceship — WHACK '26 (Marshall Wace track, theme: "New Worlds")

Glorp's spaceship travels through time to worlds you can't normally visit (first world:
Mauritius, ~1600). The game opens on a full-screen pixel world map with an era timeline
along the bottom; each species is a pin at its real lat/lon. Clicking a pin plays a travel
animation (Glorp flies across the map while the era ticks over to the species' year), then
the player explores a pixel world, scans hotspots to learn facts and collect DNA, unlocks
lab tools, then runs a Monte Carlo sim (1,000 futures) to see whether the species survives.
Saved species live in the player's Sanctuary ("new world").

Flow: Map → travel → Explore → Lab → Sanctuary.

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
- Screens: Map (`/`: full-screen world map + era timeline; clicking a pin opens a travel
  bubble, and confirming plays the travel animation) → Explore → Lab → Sanctuary. Pixel
  art: `image-rendering: pixelated`.
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

## Git workflow
- `main` is protected. Never commit to it directly.
- Branch per feature: `feat/fe-hub`, `feat/be-sim-engine`, `fix/...`.
- Small PRs, merged with squash. The other person reviews.
- Before opening a PR: `git fetch && git rebase origin/main`, make sure it builds.

## Contract changelog
- 2026-11-07 — added lat/lon/era_year for the world map (frontend). Backend: include these
  in every species JSON and in the /api/species summaries.
