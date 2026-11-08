# The whole game as one container: build the frontend, then FastAPI serves it plus /api.
# Works on Render, Railway, Fly.io, etc. Local: docker build -t glorp . && docker run -p 8000:8000 glorp

# 1. Build the frontend (Vite) → /app/frontend/dist
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Run the backend, which also serves frontend/dist
FROM python:3.12-slim
ENV PYTHONUTF8=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /app/frontend/dist /app/frontend/dist
EXPOSE 8000
# Hosts set $PORT; default 8000 locally
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
