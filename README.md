# Glorp's Magic Spaceship 🛸

WHACK '26 · Marshall Wace track · theme: **New Worlds**

Glorp's spaceship travels back in time to rescue extinct species and give them a new
world: sealed glass domes on Glorp's home planet.

1. **Map**: pick a species on the world map and spend Zorps to travel to its era.
2. **Explore**: scan its world to learn facts, discover what it needs to survive, and
   collect DNA.
3. **DNA Lab**: a quick minigame; the better you do, the more animals you rescue.
4. **Sanctuary**: set each dome's terrain, temperature, humidity, oxygen and pressure,
   place your animals, then run **1,000 simulated futures**. Disasters hit one dome at a
   time, so splitting species across domes is safer: diversification, as in a portfolio.

How the simulation works: [`backend/MODEL.md`](backend/MODEL.md).

## Run it

Needs [Node](https://nodejs.org/) 18.17+ and [Python](https://www.python.org/downloads/) 3.10+.
From the repo root, in any terminal (PowerShell, cmd, macOS, Linux):

```bash
npm run setup   # first time only: creates backend/.venv, installs backend + frontend packages
npm run dev     # starts the backend (:8000) and the frontend (:5173) together
```

When it says **ready**, open http://localhost:5173 (API docs: http://localhost:8000/docs).
Output is labelled `[api]` / `[web]`; Ctrl+C stops both. The backend reloads on Python
changes and the frontend hot-reloads.

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
</details>

Tests: `cd backend && pytest`, and `cd frontend && npm test`.

To run the frontend without the backend, create `frontend/.env.local` containing
`VITE_USE_MOCKS=true`.

See `CLAUDE.md` for the data contract, API and team workflow.
