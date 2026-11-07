# Glorp's Magic Spaceship 🛸

WHACK '26 · Marshall Wace track · theme: **New Worlds**

Glorp's spaceship travels back in time to rescue extinct species and give them a new
world: sealed glass domes on Glorp's home planet.

1. **Map**: pick a species on the world map and spend fuel to travel to its era.
2. **Explore**: scan its world to learn facts, discover what it needs to survive, and
   collect DNA.
3. **DNA Lab**: a quick minigame; the better you do, the more animals you rescue.
4. **Sanctuary**: set each dome's terrain, temperature, humidity, oxygen and pressure,
   place your animals, then run **1,000 simulated futures**. Disasters hit one dome at a
   time, so splitting species across domes is safer: diversification, as in a portfolio.

How the simulation works: [`backend/MODEL.md`](backend/MODEL.md).

## Run it

Backend (port 8000):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (port 5173):
```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173 (API docs: http://localhost:8000/docs).

Tests: `cd backend && pytest`, and `cd frontend && npm test`.

To run the frontend without the backend, create `frontend/.env.local` containing
`VITE_USE_MOCKS=true`.

See `CLAUDE.md` for the data contract, API and team workflow.
