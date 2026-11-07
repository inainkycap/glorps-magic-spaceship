# Glorp's Magic Spaceship — WHACK '26 (Marshall Wace track, theme: "New Worlds")

Glorp's spaceship travels through time to worlds you can't normally visit (first world:
Mauritius, ~1600). The player explores a pixel world, scans hotspots to learn facts and
collect DNA, unlocks lab tools, then runs a Monte Carlo sim (1,000 futures) to see whether
the species survives. Saved species live in the player's Sanctuary ("new world").

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
| GET | `/api/species` | `SpeciesSummary[]` (the basic-info fields only) |
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
- Screens: Hub → Explore → Lab → Sanctuary. Pixel art: `image-rendering: pixelated`.
- Fan chart is hand-written SVG (no chart library): 25 sample paths, 50% band (p25–p75),
  90% band (p5–p95), median line (p50).

## Git workflow
- `main` is protected. Never commit to it directly.
- Branch per feature: `feat/fe-hub`, `feat/be-sim-engine`, `fix/...`.
- Small PRs, merged with squash. The other person reviews.
- Before opening a PR: `git fetch && git rebase origin/main`, make sure it builds.
