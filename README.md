# Glorp's Magic Spaceship 🛸

**Travel back in time, rescue extinct species, and find out the hard way why you should 
never put all your dodos in one dome.**

WHACK '26 · Marshall Wace track · theme: **New Worlds**

### In 30 seconds

- 🛸 **Travel through time** to rescue 10 real extinct species, from the woolly mammoth to the golden toad.
- 🔮 **Build domes and forecast 1,000 futures** before you commit, then live through one of them.
- ☄️ **Learn why splitting beats concentrating**: a similar average, a much better worst case.

<img width="32" height="32" alt="glorp-idle(1)" src="https://github.com/user-attachments/assets/671d472b-04b3-49a8-9d6d-8b85d9634cae" />

Glorp is a small alien with a time-travelling spaceship. You fly to the eras where species
went extinct (the dodo in 1600, the thylacine in 1900, the woolly mammoth 4,000 years ago),
study each one, rescue its DNA, and give it a **new world**: sealed glass domes on Glorp's
home planet, each with its own climate. Then you live with the consequences, one simulated
decade at a time.

---

## Screenshots

<img width="1916" height="907" alt="image" src="https://github.com/user-attachments/assets/21971391-332c-4ad0-9fc7-8ab323169608" />
<img width="1917" height="913" alt="image" src="https://github.com/user-attachments/assets/d70292c2-3b2a-4392-9528-72ff5c606fb8" />
<img width="1917" height="910" alt="image" src="https://github.com/user-attachments/assets/40578cd4-4a3e-4e24-9067-8f8766c7ad37" />
<img width="1917" height="1078" alt="image" src="https://github.com/user-attachments/assets/d5d23f2b-fb7f-464c-a1eb-ceeadb16aa80" />
<img width="1917" height="1078" alt="image" src="https://github.com/user-attachments/assets/cde3bf48-4820-465c-95ac-8d88a18b9b65" />
<img width="1917" height="1078" alt="image" src="https://github.com/user-attachments/assets/dd4297d7-2e22-4bc8-aab7-1a18f5ce7876" />

---

## How to play

1. **Map**: pick a species' signal on the world map and time-travel there (older eras cost more **Zorps**).
2. **Explore**: scan hotspots to learn facts, discover the species' ideal conditions and collect DNA.
3. **DNA Lab**: a quick base-pairing minigame; the better you do, the more animals you rescue.
4. **Sanctuary**: set up to 6 domes' terrain and climate, and decide who lives where.
5. **Forecast**: simulate 1,000 futures and see survival chances and the worst case.
6. **Advance 10 years**: one future actually happens, and you find out how lucky it was.

**Zorps** pay for travel, domes, capacity upgrades and DNA retries. You earn them from
encyclopedia discoveries and, mostly, from species that thrive when you advance time, so
exploring alone can't fund the game: you have to keep a sanctuary alive.

**Unlock waves**: you start with 3 species. Rescuing 3 detects 3 new signals; rescuing 6
reveals the rest, back to the woolly mammoth.

**The goal**: complete the **encyclopedia**. Every species starts as a black silhouette
and is revealed when you visit it. Each one has a 7-item checklist: found, visited, facts,
needs, DNA, rescued, thriving. Finish with the highest **diversity score** you can.

---

## The science

Everything below comes from [`backend/MODEL.md`](backend/MODEL.md) and its tests.

- **Individuals, not averages.** Each year, in each dome, births are Poisson and deaths
  are binomial, so there are no 3.4 dodos. The birth rate depends on how well the dome
  fits the species (a geometric mean over its needs, with a bell-curve fall-off outside
  each ideal range).
- **Logistic growth.** Births scale with `1 − T/K`, where T is every animal in the dome
  and K its capacity (60 places, upgradable to 200), so species compete for room. An
  **Allee effect** makes tiny groups struggle to find mates, and one animal alone can't
  breed.
- **1,000-run Monte Carlo.** A forecast plays the sanctuary forward 1,000 times with real
  random events and reports percentiles, survival curves and 25 sample futures. Forecasts
  are seeded from the sanctuary itself: change one thing and the difference you see is
  your change, not luck.
- **Correlated disasters, per dome.** Breaches, power failures and meteor strikes hit
  every resident of one dome at once, and never spread to another dome.
- **Capacity and lingering outbreaks.** Disease is an outbreak that lasts 3–5 years and
  kills 20 % of each species in the dome every year. It becomes likelier once a dome is
  over 80 % full (up to 5× when packed), and animals moved out of an infected dome may
  carry it with them.
- **Forecast vs one realised future.** A forecast is a weather forecast; Advance is the
  weather. After each decade, a **luck percentile** says what share of 500 possible
  futures ended no better than yours.
- **Worst case = 5th percentile.** One run in 20 does this badly or worse: the same idea
  as a 95 % **Value at Risk**.
- **Diversity scoring**, inspired by Weitzman's *The Noah's Ark Problem* (Econometrica,
  1998): with limited resources, which species do you save? Each species has a
  `diversity_value` from 1 to 5 based on its evolutionary distinctiveness (how long ago its
  line split from its closest living relative, the "ED" half of ZSL's EDGE metric). The
  score is the sum of those values over the species alive in your domes, so a thylacine
  (5) counts for more than a quagga (1).

### The finance link

The game never talks about finance, but this is what playing teaches. The average outcome
of one perfect dome looks fine; then a single meteor wipes it out. Players who split a
species across two domes see their **worst case** improve while the average barely moves.
That is **diversification**: correlated risk inside a dome, independent risk between
domes, judged by the tail rather than the mean. Crowding adds a cost to concentration,
and a limited budget forces you to choose what to protect. Apart from one line under the
forecast chart, players are never told any of this; they learn it by losing a dome.

---

## How it's built

| Part | Stack | Owner |
|---|---|---|
| `frontend/` | React 19 + Vite + TypeScript; hand-written SVG charts (no chart library); pixel-art sprites with built-in fallbacks | Valentina |
| `backend/` | FastAPI (Python) + numpy; a vectorised sim stepping all futures at once (`N[run, dome, species]`) | Annie |

- **Data-driven species.** Each species is one JSON file in `backend/data/species/`: place,
  era, facts, needs with a "why" for each, hotspots, sources, diversity value and unlock
  wave. The backend validates every file at startup. Adding a species means adding a file;
  sim tuning lives in `backend/data/sanctuary.json`.
- **One contract.** [`CLAUDE.md`](CLAUDE.md) is the shared API and data contract, mirrored
  in `frontend/src/types.ts`, with a dated changelog of every change between the two halves.
- **Mock fallback.** The frontend calls the real API first. If the backend is unreachable,
  it falls back to built-in copies of the species and a client-side mock of the sim, and
  says so with a small "offline data" badge.
- **Sim router.** Forecast and Advance must always use the same model, so the frontend
  checks once which one is available and uses either the backend for both or the mock for
  both, never one of each.
- **Tested on both sides.** The tests check, among other things, that splitting beats
  concentrating on the worst case, that a dome never exceeds its capacity, that crowded
  domes get more outbreaks, the unlock-wave and completion logic, and the Zorps budget.

---

## Run it

Needs [Node](https://nodejs.org/) 18.17+ and [Python](https://www.python.org/downloads/) 3.10+.
From the repo root, in any terminal (PowerShell, cmd, macOS, Linux):

```bash
npm run setup   # first time only: creates backend/.venv, installs backend + frontend packages
npm run dev     # starts the backend (:8000) and the frontend (:5173) together
```

When it says **ready**, open **http://localhost:5173** (API docs: http://localhost:8000/docs).
Ctrl+C stops both. For a quick start in the game, use **Settings → Load demo save**.

Tests: `cd backend && pytest` and `cd frontend && npm test`.

<details>
<summary>Running the two halves by hand</summary>

Backend (port 8000):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
PYTHONUTF8=1 uvicorn app.main:app --reload --port 8000   # PowerShell: $env:PYTHONUTF8=1; uvicorn …
```

Frontend (port 5173):
```bash
cd frontend
npm install
npm run dev
```

To run the frontend without the backend, create `frontend/.env.local` containing
`VITE_USE_MOCKS=true`.
</details>

---

## Species

Ten species across 4,000 years, unlocked in three waves.

| Species | Era | Place | Wave |
|---|---|---|---|
| Golden toad | 1987 | Monteverde, Costa Rica | 1 |
| Lord Howe Island stick insect | 1915 | Lord Howe Island, Australia | 1 |
| Pyrenean ibex | 1910 | Pyrenees, Spain | 1 |
| Thylacine | 1900 | Tasmania, Australia | 2 |
| Passenger pigeon | 1870 | Michigan, USA | 2 |
| Quagga | 1870 | Karoo, South Africa | 2 |
| Great auk | 1800 | Funk Island, Newfoundland | 3 |
| Steller's sea cow | 1741 | Bering Island, Commander Islands | 3 |
| Dodo | 1600 | Mauritius | 3 |
| Woolly mammoth | ~2,000 BC | Wrangel Island, Arctic Ocean | 3 |

---

## Credits

- **World map**: built from [Natural Earth](https://www.naturalearthdata.com/) II shaded
  relief and water (public domain), turned into pixel art by
  `frontend/scripts/make-terrain-map.mjs`.
- **Wikipedia**: the "From Wikipedia" summaries in the encyclopedia come from the official
  Wikipedia REST API (cached by the backend). Text is licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), with attribution and a link
  on every page; images are from Wikimedia Commons.
- **Species facts and needs**: written from the sources listed in each species file
  (`backend/data/species/*.json`, mostly English Wikipedia articles plus Audubon), shown
  under "Sources" in each species' field guide.
- **Diversity values**: based on evolutionary distinctiveness, after ZSL's
  [EDGE of Existence](https://www.edgeofexistence.org/) idea, and Weitzman, M. L. (1998),
  "The Noah's Ark Problem", *Econometrica* 66(6).
- **Font**: Press Start 2P by CodeMan38 (SIL Open Font License), via Fontsource.

## Team

| Name | Role | Links |
|---|---|---|
| Annie | Backend: data, simulation engine, API | _GitHub / LinkedIn_ |
| Valentina | Frontend: game, art direction, UI | _GitHub / LinkedIn_ |
