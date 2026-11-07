# Glorp's Magic Spaceship 🛸

WHACK '26 · Marshall Wace track · theme: **New Worlds**

Glorp's spaceship travels back in time to worlds you can't normally visit. Explore them,
learn why their species vanished, then use the lab to change history. A Monte Carlo
simulation runs 1,000 possible futures for every decision.

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

To run the frontend without the backend, create `frontend/.env.local` containing
`VITE_USE_MOCKS=true`.

See `CLAUDE.md` for the data contract, API and team workflow.
