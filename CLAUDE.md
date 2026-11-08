# Glorp's Magic Spaceship — WHACK '26 (Marshall Wace track, theme: "New Worlds")

Glorp's spaceship travels through time to rescue extinct species (first world: Mauritius,
~1600) and give them a new home in the player's Sanctuary ("new world"): sealed glass
**domes on Glorp's home planet**, each with its own controlled environment. The loop:

1. **Map**: a full-screen pixel world map with an era timeline; each species is a pin at
   its real lat/lon and era. Travelling costs **Zorps** (Glorp's currency; more the further
   back in time; see "Game rules"), then Glorp flies there while the era ticks over.
2. **Explore**: a pixel scene of the species' world. Scan hotspots to learn facts,
   **discover the species' needs** (ideal terrain, temperature, humidity, oxygen, pressure)
   for the field guide, and **collect DNA** fragments.
3. **DNA Lab**: a quick pairing minigame (frontend-only); its result is the **number of
   individuals rescued** (4–20) for that species. See "Game rules".
4. **Sanctuary**: domes on Glorp's home planet (1 built,
   up to 6; more cost Zorps). **Set each dome's conditions** (terrain, temperature,
   humidity, oxygen, pressure), **place rescued individuals**, then **Forecast** (1,000
   Monte Carlo futures for all domes together) and **Advance 10 years** (one future actually
   happens: populations are replaced by the survivors, a report shows what struck which
   dome, and thriving species pay Zorps). Growth depends on how well a dome's conditions fit
   each species' needs. **Disasters strike per dome**, so splitting a species across domes
   is safer. See "Sanctuary sim" and `backend/MODEL.md`.

The old Lab loop (protecting a species *in the past* by picking interventions against
threats, then simulating) is **dropped**.

Flow: Map (Zorps) → travel → Explore (scan, discover needs, collect DNA) → DNA Lab
(minigame, score = individuals rescued) → Sanctuary (domes on Glorp's home planet:
conditions, placement, Forecast → Advance → Report, which earns the Zorps for the next trips).

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
  out. The frontend no longer has types for them (only `hotspots[].unlocks?` remains).

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
| POST | `/api/sanctuary/advance` | `SanctuaryAdvanceResponse` (see "Forecast → Advance") |
| GET | `/api/timeline` | `Timeline` (see below): every species' era, sorted, with labels and log-scale positions |
| GET | `/api/economy` | zorps rules, prices and per-species era multipliers (see "Zorps") |
| GET | `/api/travel-cost?from_year=&to_year=` | `{ from_year, to_year, zorps }`: the frontend's travel formula ("Game rules → Travel cost") |
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
              "label": "2,000 BC", "position": 0.0 },
            { "species_id": "elephant_bird", "name": "Elephant bird", "era_year": 900,
              "label": "900 CE", "position": 0.211 }, ...],
  "ticks": [{ "year": -1000, "label": "1,000 BC", "position": 0.047 }, ...]
}
```
- `eras` is sorted oldest first (ties by id); `ticks` are suggested axis labels between
  the oldest era and now. Labels match the frontend's `formatEra` (backend `app/years.py`):
  "today", "1987", "900 CE", "2,000 BC", "14,025 yrs ago", "66 million yrs ago".
- Formula (`backend/app/timeline.py`): `years_ago = 2026 − year + 10`;
  `position = 1 − (ln years_ago − ln 10) / (ln years_ago(oldest) − ln 10)`.

`/api/wiki/{title}` uses the official Wikipedia REST API and caches every answer in
`backend/data/wiki_cache/` (committed), so the text works offline. `title` is an article
title as in the URL (`Ball's_Pyramid`); for a species' `sources[].url`, use the part after
`/wiki/`. Every species source is pre-cached (`python -m scripts.prefetch_wiki` in
`backend/` refreshes it). `image_url` points at Wikimedia, so images still need internet.

TypeScript mirror of all of this: `frontend/src/types.ts`. Keep them in sync.

## Frontend conventions
- Mocks live in `frontend/src/mocks/` (`mocks/species/<id>.json` are copies of every
  backend species file). `src/api.ts` calls the real backend first and **falls back to the
  mocks** on a network error, a 5xx, or a 404 from an endpoint the backend hasn't built yet
  (`/api/sanctuary/advance`); a small "offline data: …" badge then shows in the HUD.
  `VITE_USE_MOCKS=true` (in `frontend/.env.local`) uses the mocks only.
- **Forecast and Advance always use the same model** (`frontend/src/simRouter.ts`, tested
  in `simRouter.test.ts`): the frontend probes `POST /api/sanctuary/advance` once; if it
  exists (any answer but 404), both use the backend; if it's missing or the backend is
  unreachable, both use the mock (`mockSanctuarySim.ts`) and the HUD shows "offline sim".
  A backend failure mid-session switches both to the mock; it re-checks after 60 s.
- Progress (scanned hotspots, DNA, rescued animals, Zorps, domes, sanctuary clock) persists
  in localStorage; wrap reads/writes in try/catch. Old saves are migrated on load
  (`migrate()` in `hooks/useProgress.ts` drops retired fields and repairs broken ones).
- Eras are formatted one way everywhere (`formatEra` in `game/time.ts`): "today", "1987",
  "900 CE", "1,000 BC", "14,025 yrs ago", "66 million yrs ago".
- Screens (pixel art: `image-rendering: pixelated`):
  - Map `/`: world map + era timeline + Zorps counter; clicking a pin opens a travel bubble
    (jump, Zorps cost), and confirming plays the travel animation. The timeline scales to
    the species: oldest era to today plus padding, log scale when the span is over ~1,000
    years (`buildEraScale` in `game/time.ts`), with ticks like "today", "100 yrs ago",
    "1,000 BC", "66 million yrs ago". The travel animation's year counter moves in log time.
  - Explore `/explore/:speciesId`: Glorp's arrival intro, scan hotspots (facts, DNA, needs),
    field guide; "Go to DNA Lab" once DNA ≥ `dna_required`.
  - DNA Lab `/lab/:speciesId`: base-pairing minigame (A↔T, C↔G) against the clock; Glorp
    announces the individuals rescued, then "Send to Sanctuary". Retries cost Zorps.
  - Sanctuary `/sanctuary`: Glorp's home planet with up to 6 dome sites (1 built; building
    more costs Zorps), the pool of rescued individuals not yet placed, the sanctuary clock
    ("Year +N"), and two actions for all domes together:
    - **Forecast**: 1,000 futures over 50 years, with a short simulating animation (plain
      "Simulating…" under reduced motion). Shows per-species survival curves labelled at
      their line ends plus a dashed "expected species alive" line (the band chart is
      behind "Details", and is the fallback when `survival_by_year` is missing); compare
      mode fades in the previous forecast.
    - **Advance 10 years**: one future happens (`POST /api/sanctuary/advance`). Dome
      populations are replaced by the survivors, the clock moves on, and an animated recap
      leads to report cards ("Meteor strike on Dome Zib in year +4: 6 passenger pigeons
      lost"), the Zorps earned and a luck line from `luck_percentile`.
  - Dome `/sanctuary/:domeId`: three columns that fit 1280×720 with no page scroll. Left:
    the capacity bar with "Upgrade capacity (+20) for N Zorps", then residents
    (collapsible rows with placement steppers, a fit bar and per-need fit + why;
    undiscovered needs show as a grey "?" and give no hint). Steppers can't go over the
    dome's capacity. Centre: the dome large (the interior reacts live; an outbreak badge
    with years left) with compact last-forecast and last-advance summaries. Right:
    Glorp's control panel (name, terrain, temperature/humidity/oxygen/pressure dials);
    disasters are explained behind a "?" button (a popover kept inside the viewport).
  - Capacity: every dome has one (default 60, all species share it). The capacity bar
    (overview and dome screen) is green, amber from 80% ("crowded"), red at 100% ("full").
  - Lingering disease: a dome with an outbreak (from the last advance) shows a badge with
    the years left; the report says "Outbreak continues (3 years left)." or "Outbreak
    ended.". Moving animals out of an infected dome warns that they may carry it; they're
    marked "exposed" and sent as `from_infected` when placed in another dome, until the
    next advance.
  - Dome state (incl. capacity, outbreak, exposure), rescued individuals, the pool, the
    clock, the last advance and the last two forecasts persist in progress.
- Every Zorps gain pops up as "+N Zorps · reason" (`components/ZorpsToasts.tsx`).
- Buttons size with `min-width` + padding, never a fixed width, so labels never overflow.
- Map projection is equirectangular: `x% = (lon+180)/360`, `y% = (90−lat)/180`.
  Glorp's current location (lat/lon/era_year) is part of the persisted progress.
- Respect `prefers-reduced-motion` (the travel animation becomes an instant jump, the
  forecast shows plain "Simulating…", the advance report skips the recap).
- Charts are hand-written SVG (no chart library). Survival chart: one curve per species
  (`survival_by_year`), labels at the line ends, dashed expected-species-alive line. Band
  ("fan") chart: 25 sample paths, 50% band (p25–p75), 90% band (p5–p95), median line (p50).

## Game rules
Zorps rules live in `frontend/src/game/zorps.ts`, era/time helpers in `game/time.ts`, DNA Lab
rules in `game/dna.ts` (tests next to them, run with `npm test` in `frontend/`).

**Zorps** (Glorp's alien currency, **no cap**, saved in the player's progress, shown in the
HUD; every gain pops up "+N Zorps"). Where each number comes from:

| Rule | Value | Source |
|---|---|---|
| Starting balance | 100 | **backend** `GET /api/economy` `start_zorps` |
| Building a dome (habitat) | 25 (first dome free, 6 sites) | **backend** `habitat_cost` |
| Payout per thriving species on "Advance 10 years" | `zorps_per_survivor` (0.5) × animals alive × era multiplier, for species with ≥ 2 alive | **backend**: the advance response's `zorps_earned` when present; otherwise computed in the frontend from `/api/economy` (`zorps_per_survivor`, per-species `era_multiplier`) |
| Travel | formula below | **frontend** `game/zorps.ts`; the backend's `/api/travel-cost` uses the same formula and gives the same numbers |
| DNA Lab retry | 5 (first attempt per species free) | **frontend** `DNA_RETRY_COST` |
| Dome capacity upgrade (+20, up to 200) | 10, then +5 per upgrade of the same dome (10, 15, 20, …) | **frontend** `capacityUpgradeCost` |
| New fact (first scan of a hotspot) | +1 | **frontend** `REWARDS.newFact` |
| New need discovered | +2 each | **frontend** `REWARDS.newNeed` |
| DNA complete (all fragments) | +3 | **frontend** `REWARDS.dnaComplete` |
| Species rescued (first DNA Lab result) | +5 | **frontend** `REWARDS.rescue` |

Discovery rewards are paid once each (per hotspot, need, species). If the backend is down,
`FALLBACK_ECONOMY` in `zorps.ts` (a copy of `backend/data/economy.json`) stands in. The
forecast's `zorps` field (what a run *would* earn) is not paid out: only Advance pays,
because it actually happens (so the anti-farming question doesn't arise; see "Proposed:
zorps").

**Budget target** (enforced by the "early-game Zorps budget" tests in `zorps.test.ts`).
From a fresh start (100 Zorps at home in 2026), the first wave is the stick insect (1915),
the passenger pigeon (1870) and the dodo (1600), newest first:
- affordable: rescue all 3 **and build 2 domes** with a DNA retry each, or **3 domes**
  without retries
- not affordable: the remaining species from discoveries alone, or the mammoth right
  after wave 1. Later waves need Advance payouts.

**Travel cost.** Clicking a pin (or its timeline diamond) opens a bubble showing the jump
("today → 2,000 BC · 4,025 years into the past") and the Zorps it costs ("Costs 62 (you
have 100)"); Travel is disabled if Zorps are short. Using `t` = years ago (no year 0):

    depth(t) = t² / (2·KNEE)                 for t ≤ KNEE
             = KNEE · (ln(t / KNEE) + ½)     beyond       (continuous and smooth at the knee)
    cost     = TRAVEL_BASE + TRAVEL_K × |depth(t_from) − depth(t_to)|, rounded up

with `TRAVEL_BASE = 28`, `TRAVEL_K = 0.03`, `KNEE = 400` years. For the last ~400 years each
year crossed costs more the older it is (the same jump costs more further back: 1610→1600
> 2020→2010 exactly; 1700→1600 > 2000→1900 after rounding). Beyond that, time is
logarithmic: every factor of 10 further back costs the same, which keeps deep time
affordable. Direction doesn't matter, costs are never negative or NaN, and staying put is
free. Examples from today: 1987/1915/1870 = 29, 1600 = 35, 900 CE = 47, 50 BC = 54,
2,000 BC = 62, **66 million yrs ago = 179 (≈ 5× the trip to 1600)**. 1600→1870 = 34.

**DNA Lab (frontend-only).** A pairing minigame: for each base of a strand the player picks
its partner (A↔T, C↔G) before time runs out. Older species are harder; the one difficulty
formula is `dnaDifficulty(era_year)` in `game/dna.ts` (age = years ago, capped at 3,000):
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
- The frontend mocks (`frontend/src/mocks/species/<id>.json`) are copies of the backend files.
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
- **Untrusted input is sanitised, not rejected**: `residents[].count` is clamped to 0–the
  dome's `capacity` (domes over capacity are trimmed proportionally); unknown `species_id`s are dropped; dome conditions are clamped to the
  control-panel ranges (temperature −30–50 °C, humidity 0–100 %, oxygen 10–35 %, pressure
  50–200 kPa). An unknown `terrain`, or more than 12 domes, is a 422.
- All tuning (birth/death rates, default/max capacity, disaster chances and kill fractions,
  outbreak rules) lives in `backend/data/sanctuary.json`.

## Zorps (backend, needs frontend ok)
**Status: agreed.** The backend's travel cost now uses the frontend formula. Previously:
**accepted by the frontend except travel cost** (frontend uses `GET /api/economy`
for the start balance, habitat cost, per-survivor payout and era multipliers; types
`Economy`, `EconomySpecies`, `ZorpsEarned` are in `types.ts`; see "Game rules"). Zorps are
the only currency: an alien currency, **uncapped**, spent on travel and habitats, and
earned by animals that survive in the sanctuary. Older species earn more. Code:
`backend/app/economy.py`; numbers: `backend/data/economy.json`.

Everything uses the timeline's log scale of years before now, `age(y) = log10(2026 − y + 10)`
(1.0 for the present):
- **Era multiplier** `= 1 + 1.535 × (age − 1)`: ×1 now, ×2.1 golden toad (1987), ×2.9
  passenger pigeon, ×3.5 dodo, ×4.6 aurochs, ×5.0 mammoth (2000 BCE).
- **Zorps earned by a run** `= 0.5 × Σ species (mean survivors after the run × era multiplier)`,
  where mean survivors = animals alive at the end, averaged over all runs, summed over domes.
  Dead species earn 0. Typical: 10 dodos in a good dome ≈ 110; 10 dodos + 10 pigeons split
  over two good domes ≈ 187; a poor dome ≈ 20.
- **Travel cost**: the frontend formula ("Game rules → Travel cost": quadratic time-depth
  up to 400 years ago, logarithmic beyond; base 28, K 0.03), the same numbers as
  `game/zorps.ts` (1600 = 35, 2,000 BC = 62, 66 million yrs ago = 179). Same era: 0.
- **Habitat (dome) cost** 25; **start** with 100 zorps. Suggested values: the frontend owns
  how they're charged.

API:
- `POST /api/sanctuary/simulate` response gains
  `"zorps": { "total": 110, "per_species": [{ "species_id": "dodo", "mean_survivors": 62.41,
  "era_multiplier": 3.52, "zorps": 110 }] }` (same layout, same zorps: it's seeded).
- `GET /api/economy`: `{ present_year, start_zorps, zorps_per_survivor, habitat_cost,
  travel_base_cost, era_multiplier_per_decade_of_age, travel_k, travel_knee_years,
  travel_cost_per_decade_of_age, species: [{ species_id, era_year, era_label,
  era_multiplier, travel_cost_from_present }] }` (species oldest first; `travel_base_cost`
  is now 28; `travel_k` and `travel_knee_years` are new; `travel_cost_per_decade_of_age` is
  deprecated and always 0; `era_label` uses `formatEra` style).
- `GET /api/travel-cost?from_year=2026&to_year=-2000` → `{ from_year, to_year, zorps }`
  (422 outside −100,000,000…2026).

**Still to agree (anti-farming):** the backend reports what a run *would* earn; it doesn't
track balances. Since the same layout always gives the same result, the frontend should
pay out only once per layout (e.g. per `runKey`), or only the improvement over the best
layout so far, or once per "season". Also note splitting animals across more domes earns
more (more room to grow), so the habitat cost is a balance lever.
**Frontend answer:** forecasts never pay. Only "Advance 10 years" pays (one future that
actually happens and moves the sanctuary clock on), so re-running a layout earns nothing.

## Forecast → Advance
**Status: agreed and built by the backend** (proposed by the frontend 2026-11-07/08; the
backend implements every item below in `backend/app/sanctuary/engine.py`, tests in
`backend/tests/test_advance.py`). The client-side mock
(`frontend/src/mocks/mockSanctuarySim.ts`) stays as the offline fallback.
Backend notes: `survival_by_year` is always sent; `zorps_earned` is always sent; disease
events always carry `ongoing` and `spread` (false when not set); every dome in the advance
response carries `outbreak` (an object or `null`); advance `runs` defaults to 500
(clamped 10–500); `years` defaults to 10 (clamped 1–50).
TypeScript: `SpeciesForecast`, `SanctuaryAdvanceRequest`, `SanctuaryAdvanceResponse`,
`AdvanceDome`, `AdvanceEvent`, `DisasterType` in `frontend/src/types.ts`.

1. **`POST /api/sanctuary/simulate`: `per_species[].survival_by_year`** (optional):
   `number[]`, one entry per entry of `years`, the fraction of runs in which that species
   is alive in any dome in that year (so its last entry = `survival_probability`). Drives
   the per-species survival curves; without it the frontend falls back to the band chart.
2. **`POST /api/sanctuary/advance`**: same request as `/simulate` (domes with live
   populations, `years` = 10; `runs` optional). Plays **one** future and reports it:
   ```json
   {
     "years": 10,
     "domes": [{ "id": "dome-1",
                 "start": { "dodo": 10, "passenger_pigeon": 6 },
                 "end":   { "dodo": 14, "passenger_pigeon": 0 },
                 "events": [{ "year": 4, "type": "meteor",
                              "lost": { "passenger_pigeon": 6 } }] }],
     "species_alive_end": 1,
     "luck_percentile": 0.18,
     "zorps_earned": 49
   }
   ```
   - `type` is `breach | power | meteor | disease` (the disaster keys in
     `backend/data/sanctuary.json`); `year` is
     1…`years`; `lost` = animals of each species killed by that event.
   - `end` replaces the dome's populations in the player's save (the frontend does this).
   - `luck_percentile` (0–1): where this future ranks among many futures of the same
     request: the fraction of futures that ended **no better** (fewer or equal species
     alive at the end; ties broken by total animals alive). 0.1 = unlucky (90% of
     futures were better), 0.9 = lucky.
   - `zorps_earned` (optional, a whole number of Zorps): the payout for this decade. If missing the frontend pays `zorps_per_survivor` × animals alive × era
     multiplier per species with ≥ 2 alive (`advancePayout` in `game/zorps.ts`).
   - Not deterministic like `/simulate`: each call is a fresh future (a seed from the
     request plus the sanctuary clock is fine too, if you want replays).
3. **Counts clamp to 0…the dome's capacity, not 0…50.** Advance lets populations grow past
   50, so `residents[].count` (and `start`/`end`) are clamped to the dome's `capacity`
   (item 4), and a dome's total never exceeds it.
4. **Dome capacity and lingering outbreaks** (2026-11-08). Types: `SanctuaryDomeInput`,
   `SpeciesCount`, `Outbreak`, `AdvanceDome`, `AdvanceEvent` in `types.ts`.
   - Request (both `/simulate` and `/advance`), per dome:
     ```json
     { "id": "dome-1", "terrain": "forest", "temperature": 24, "humidity": 75,
       "oxygen": 21, "pressure": 101,
       "capacity": 60,
       "outbreak": { "years_left": 3, "severity": 0.2 },
       "residents": [{ "species_id": "dodo", "count": 10, "from_infected": 2 }] }
     ```
     - `capacity` (whole number, default 60, the frontend sends 60–200): animals the dome
       holds **in all, shared by every species inside**. The player upgrades it (+20 each,
       paid in Zorps, frontend-only).
     - `outbreak` (optional, or `null`): an outbreak still running from the last advance;
       `years_left` ≥ 1, `severity` 0–1 = fraction of each species killed per year.
     - `residents[].from_infected` (optional): how many of `count` were moved here from a
       dome with an active outbreak since the last advance.
   - Sim:
     - **Species share the capacity.** Crowding slows growth: the mock multiplies births by
       `max(0, 1 − total/capacity)` (logistic), and trims the dome back to `capacity` if it
       goes over. (This replaces the global `dome_capacity: 30` crowding constant.)
     - **Disease chance rises with crowding**: base 1%/year up to 80% full, then linear up
       to (1 + 4) × base = 5%/year when full (mock: `outbreakChance`).
     - **An outbreak lingers**: it lasts 3–5 years (counting the year it starts) and kills
       `severity` (mock: 0.2) of each species in the dome every year; no new outbreak starts
       in a dome while one runs. Over 3–5 years that's ≈ 49–67% dead, close to today's
       one-shot 55% disease kill.
     - **Moved animals can carry it**: each `from_infected` animal starts an outbreak in its
       new dome in year 1 with a chance (mock: 15% each). The backend decides; the frontend
       only warns the player.
   - Advance response, per dome: **`outbreak`**: the outbreak state at the end (`{ years_left,
     severity }`) or `null`. The frontend saves it and sends it back as the dome's
     `outbreak` next time. Events: an outbreak is **one** `disease` event (its `lost` sums all
     its years within this advance), with `ongoing: true` if it was already running before
     this advance, or `spread: true` if moved animals brought it in.
   - The mock implements all of it (`frontend/src/mocks/mockSanctuarySim.ts`), with tests:
     a crowded dome gets more outbreaks than an uncrowded one, totals never exceed capacity,
     an outbreak lingers and its end state comes back, moved animals sometimes spread it.

## Notes for backend (from frontend)
For Annie's Claude Code. Written 2026-11-07 by the frontend; nothing here changes the agreed
contract until the backend accepts it (move items into the contract above as you do).

**Where the game is going.** The target is **10 species**, **6 domes** and **unlock
waves**: the player starts with a first wave (currently stick insect 1915, passenger
pigeon 1870, dodo 1600) and has to grow a sanctuary (Forecast → Advance 10 years → Report)
to earn the Zorps for later, older waves. main has 14 species now; pick the 10 that make
the best set (see below) or tell the frontend to plan for 14. Unlock waves aren't
implemented yet in either half (only the Zorps budget enforces them).

**Endpoints the frontend uses:**
| Endpoint | Status | Frontend use |
|---|---|---|
| `GET /api/species`, `GET /api/species/{id}` | agreed | map pins, Explore, field guide |
| `POST /api/sanctuary/simulate` | agreed, sends `survival_by_year` | Forecast |
| `POST /api/sanctuary/advance` | **built** (2026-11-08) | Advance 10 years + report |
| `GET /api/economy` | agreed, used | start Zorps, habitat cost, payouts, era multipliers |
| `GET /api/travel-cost` | built, now the frontend formula | (frontend may use it or keep its own; same numbers) |
| `GET /api/timeline` | built, labels now `formatEra` style, **not used** | frontend needs padding + continuous positions for Glorp |
| `GET /api/wiki/{title}` | built | not yet used |

**To do for the backend:** items 1–5 below are **done** (backend, 2026-11-08). Remaining:
species guidance (10 vs 14 species, `diversity_value`, `interactions`) is still open.
1. Build `POST /api/sanctuary/advance` and add `per_species[].survival_by_year` to
   `/simulate` (see "Forecast → Advance"; the mock in
   `frontend/src/mocks/mockSanctuarySim.ts` mirrors `MODEL.md` and is a working reference,
   with tests: luck in [0, 1], concentrating a species loses more than splitting it).
2. Dome **capacity** (shared by all species; clamp counts to it instead of 50) and
   **lingering outbreaks** (crowding raises the chance; `outbreak` in the request and the
   advance response; `from_infected`): see "Forecast → Advance", item 4. (Done: both
   `/simulate` and `/advance` now use capacity and outbreaks.)
3. **Bug (Windows):** the server crashes at startup with `UnicodeDecodeError` because
   `read_text()` in `app/species.py` uses the system code page (cp1252). Pass
   `encoding="utf-8"` to every `read_text()`/`open()` of the JSON files. Workaround until
   then: run with `PYTHONUTF8=1`.
4. **Travel cost:** `/api/travel-cost` makes recent decades cost more than older ones
   (`ceil(8 + 30 × |Δlog10|)`), but the game rule is that the same jump costs more the
   further back it is. If the backend takes travel over, please use the frontend formula
   (Game rules → Travel cost; `game/zorps.ts`, tests in `zorps.test.ts`): it also keeps
   66 million years ago at ≈ 5× a trip to 1600.
5. `/api/timeline` labels say "BCE"; the frontend says "BC" and "N yrs ago" for deep time
   (`formatEra` in `game/time.ts`). Align if you keep the endpoint.

**Current disaster probabilities** (backend `data/sanctuary.json` as of 2026-11-08; the mock
copies them). Per dome, per year, independent between domes; each hits every resident:

| Disaster (`type`) | Chance per year | Each resident dies with | ≥ 1 in 10 years | ≥ 1 in 50 years |
|---|---|---|---|---|
| Dome breach (`breach`) | 0.6% | 80% | 5.8% | 26.0% |
| Power failure (`power`) | 1.5% | 35% | 14.0% | 53.0% |
| Meteor strike (`meteor`) | 0.3% | 97% | 3.0% | 13.9% |
| Disease outbreak (`disease`) | 1.0% | 55% (one-shot today) | 9.6% | 39.5% |
| Any of them | 3.36% | | 29.0% | 81.9% |

**Disease is now an outbreak (built, 2026-11-08):** 1.0% a year up to 80% full, rising to
5.0% when full, lingering 3–5 years at 20% a year instead of a one-shot 55% (the 55% in the
table is unused). Values in `backend/data/sanctuary.json` → `outbreak`. If these numbers
change, update this table (and `MOCK_MODEL` in the mock) so we both know them.

**Species guidance (for the next species files):**
- Aim for **3–4 climate groups with partial overlap**, so a dome can host 2–3 species but
  not everyone, roughly: *warm and humid* (dodo, golden toad, elephant bird, stick insect),
  *temperate forest* (passenger pigeon, aurochs, thylacine, moa, Haast's eagle), *dry
  grassland* (quagga), *cold* (mammoth, great auk, Steller's sea cow, Pyrenean ibex).
  Overlap = neighbouring groups share a few degrees/percent of their ranges, so placement
  is a real choice. Check the current `needs` ranges against this; a group of one (quagga)
  means a dome for one species.
- Add a **`diversity_value`** per species (proposed, number, ~1–3): how much saving it adds
  to the sanctuary score (e.g. rarer lineages higher), so "species saved" isn't just a
  count.
- Optional **`interactions`**: `[{ "with": "<species id>", "effect": "helps" | "competes" |
  "preys_on", "strength": 0..1 }]`, applied only when both share a dome (e.g. Haast's eagle
  `preys_on` moa). The frontend will show them in the dome's resident rows once they exist.
- Every species file needs the content fields (`intro`, `description`, `facts`, `habitat`,
  `needs` with `why` and `terrain.types`, `sources`, hotspots with `reveals` covering every
  need) plus `lat`, `lon`, `era_year`. Copy new files to `frontend/src/mocks/species/` too
  (or tell the frontend).

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
- 2026-11-07: Sanctuary v2 (frontend). **Fuel is gone**; Zorps are the only currency.
  Frontend accepts the backend's zorps proposal for start balance, habitat cost, per-survivor
  payout and era multipliers (`GET /api/economy`; types `Economy`, `EconomySpecies`,
  `ZorpsEarned`), but keeps its own travel formula (the backend's makes recent decades cost
  more) plus DNA retry and discovery rewards (see "Game rules"). Forecasts never pay; only
  Advance does. PROPOSED (frontend, see "Proposed: Forecast → Advance"):
  `per_species[].survival_by_year` on `/simulate`; new `POST /api/sanctuary/advance`
  (`{ years, domes: [{ id, start, end, events: [{ year, type, lost }] }],
  species_alive_end, luck_percentile, zorps_earned? }`); counts clamp to 0–carrying
  capacity instead of 0–50. Legacy types, `simulate()` and the `simulate_*.json` mocks are
  removed from the frontend; mocks of all 14 species in `frontend/src/mocks/species/`.
  New "Notes for backend (from frontend)" section, incl. a Windows UTF-8 startup bug.
- 2026-11-08: PROPOSED (frontend) dome capacity + lingering outbreaks, see "Proposed:
  Forecast → Advance" item 4. Requests: each dome gains `capacity` (default 60, shared by
  all species) and optional `outbreak: { years_left, severity }`; `residents[]` gains
  optional `from_infected`. Sim: crowding slows growth; disease chance rises above 80%
  full; an outbreak lasts 3–5 years killing a fraction each year; moved animals may carry
  it. Advance response: each dome gains `outbreak` (state at the end, or null); disease
  events gain `ongoing?` / `spread?`. Counts clamp to the dome capacity, not 50. Current
  disaster probabilities listed in "Notes for backend". Also fixed the doc: the advance
  `zorps_earned` is a number (as in `types.ts`). Frontend-only: capacity upgrades (+20)
  cost 10, 15, 20, … Zorps.
- 2026-11-08: Backend builds Forecast → Advance (all items): `per_species[].survival_by_year`
  on `/simulate`; `POST /api/sanctuary/advance` (one future, events, luck, `zorps_earned`);
  dome `capacity` shared by all species (replaces the `dome_capacity: 30` crowding constant;
  counts clamp to capacity); lingering outbreaks with crowding-driven chance, `outbreak` in
  and out, `from_infected` spread, `ongoing`/`spread` on disease events. `/api/travel-cost`
  and `/api/economy` use the frontend's travel formula (`travel_k`, `travel_knee_years` new;
  `travel_cost_per_decade_of_age` deprecated, 0). Timeline/economy labels use `formatEra`
  style ("2,000 BC"). All JSON reads are UTF-8 (fixes the Windows startup crash).
  `backend/MODEL.md` updated. Frontend: optionally add `travel_k`/`travel_knee_years` to the
  `Economy` type.
