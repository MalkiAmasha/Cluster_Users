# Neuball Cluster Dashboard

React + Vite frontend paired with a FastAPI backend to visualize the hosted MySQL “cluster” data for Neuball’s fantasy-cricket players. It shows KPI tiles, stacked bar charts, detailed tables, ad‑hoc user lookups, and CSV exports per segment.

> Note: The app now reads exclusively from the hosted MySQL database; no local CSV imports or write operations are performed.

## Quick Start

```bash
# 0. (First time) create & activate Python virtualenv
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate

# 1. Install frontend deps
npm install  

# 2. Install backend deps (inside the activated venv)
python -m pip install -r backend/requirements.txt

# 3. Configure environment
cp backend/.env.example backend/.env
# Copy-Item -Path backend\.env.example -Destination backend\.env -Force  -- windows
# edit backend/.env with MySQL credentials (see Configuration)

# 4. Run backend (FastAPI on port 8000)
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 5. Run frontend (Vite on port 5173)
npm run dev

```

## Requirements

- Node.js 18+
- npm 10+
- Python 3.11+ (for the FastAPI backend)

## Configuration

- `backend/.env`
	- Provide `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_TABLE`, and optional overrides such as `MYSQL_PORT` (defaults to 3306), `MYSQL_OPTIONS`, `MYSQL_POOL_SIZE`, and `MYSQL_POOL_MAX_OVERFLOW`.
- Data source defaults:
	- The API reads from the `dbNeuBall.user_cluster` table, which exposes eight behavioral columns (`Core Gamer`, `Regular`, `Casual`, `Previously Active (last 3 months)`, `Previously Active (before 3 months)`, `Starters`, `Inactive`, `New Users`) plus the `Segment` label. Override `MYSQL_TABLE` if you need a different view.
- Frontend env: set `VITE_API_BASE_URL` if your backend does not run on `http://127.0.0.1:8000`.

### Python environment tips

- Re-activate the venv in each new terminal session: `source .venv/bin/activate` (macOS/Linux) or `.venv\\Scripts\\activate` (Windows).
- Upgrade pip when needed: `python -m pip install --upgrade pip`.
- To reset the environment, delete `.venv/` and recreate it with `python3 -m venv .venv` before reinstalling dependencies.

## Full Local Setup Checklist

1. Install prerequisites (Node.js 18+, npm 10+, Python 3.11+).
2. Clone this repository and `cd` into `dashboard ui`.
3. Create & activate `.venv`: `python3 -m venv .venv && source .venv/bin/activate`.
4. Install backend deps: `python -m pip install -r backend/requirements.txt`.
5. Copy `.env.example` → `.env` and paste your MySQL credentials.
6. Install frontend deps: `npm install`.
7. Start backend: `uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload`.
8. Start frontend: `npm run dev` (or `npm run build` + `npm run preview` for production bundle).
9. Optionally set `VITE_API_BASE_URL` if backend runs elsewhere.
10. Visit `http://localhost:5173` and verify KPI tiles, charts, search, and CSV export.

## Backend API (FastAPI + SQLAlchemy)
- `backend/` – FastAPI service, SQLAlchemy + PyMySQL helpers, requirements.

Located in `backend/`. Useful commands:

```bash
# Install deps
python -m pip install -r backend/requirements.txt

# Launch server
uvicorn backend.main:app --reload

# Optional: format env template
cp backend/.env.example backend/.env
```

Available endpoints:

- `GET /health` – verifies MySQL connectivity.
- `GET /tables` – lists tables in the connected schema.
- `GET /tables/{table}?limit=25` – provides a preview slice.
- `GET /stats/segments` – returns per-cluster aggregates for New Users, Inactive, Core Gamers, Starters, Regulars, Casuals, and Previously Active counts.
- `GET /segments/{segment}/insights?weeks=8` – aggregates ARPU-style metrics plus recent weekly totals for a single cluster.
- `GET /segments/trends?segments=Segment&weeks=12` – compares multi-segment weekly contest totals within an optional date window.
- `GET /users/search?q=term&limit=5` – fuzzy match by user ID, name, email, or phone to inspect specific players.
- `GET /users/{userId}/timeline?start=YYYY-MM-DD&end=YYYY-MM-DD` – returns weekly contest counts for a single user, filtered by optional date range.
- `GET /export/users?segments=Segment&segments=Another` – streams a CSV for all users or selected segments.

> Note: Data is fetched on demand; the frontend does not subscribe to real-time database updates. Refresh the page or add polling if you need live updates.


## Frontend (Vite + React + Recharts)

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production bundle
npm run preview

# Run lint
npm run lint
```

Features:

- KPI “bubbles” summarizing total counts per behavioral segment.
- Coverage for all eight clusters present in `dbNeuBall.user_cluster`.
- Segment deep-dive panel that shows richer metrics (average contests, balances, recent activity rate) plus a mini trend chart for the selected cluster.
- Trend comparison chart that overlays multiple segments across the latest 4–16 weeks for quick cohort shifts inspection.
- User-level timeline card with weekly contest activity, hover tooltips, and optional date filtering.
- Recharts stacked bar visual for segment composition.
- Detail table with per-segment counts and totals.
- User lookup form with inline result list + detail panel.
- CSV export controls that trigger `/export/users`.

## Project Structure

- `src/` – React UI, charts, styles (`App.tsx`, `App.css`).
- `backend/` – FastAPI service, SQLAlchemy + PyMySQL helpers, requirements.
- `.github/copilot-instructions.md` – workspace automation checklist.

Feel free to extend charts, add auth, or hook into a streaming layer if continuous updates are required.
	```
