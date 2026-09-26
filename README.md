# Business Analytics Platform

A web platform for business-analytics calculations. The user starts an analysis of the chosen type, goes through a step-by-step process (entering data/criteria) and gets a result with calculations, tables and charts, which can be saved and exported to Excel.

## Analyses

- **SWOT / TOWS / SWOT-TOWS** — evaluates strengths/weaknesses/opportunities/threats via an industry questionnaire, a 5×5 interaction matrix and N/S/R scoring; SWOT-TOWS additionally determines the dominant strategy.
- **ABC/XYZ** — classifies items by value (ABC, Pareto method) and demand stability (XYZ, coefficient of variation), combined into a 3×3 matrix.
- **Eisenhower Matrix** — prioritizes tasks by urgency and importance, sorting them into 4 quadrants (drag & drop).
- **Schedule (Gantt)** — plans project tasks on a timeline with dependencies between tasks.
- **Punktowa (suppliers / customers)** — score-based evaluation and ranking of objects (suppliers or customers) against weighted criteria.
- **Audyt** — score-based quality management system audit with multiple auditors and an acceptance threshold.

## Tools

**Backend**
- Python, FastAPI (async)
- SQLAlchemy 2.0 (async) + asyncpg
- Alembic (database migrations)
- Pydantic v2 / pydantic-settings
- python-jose + passlib/bcrypt (JWT authentication)
- aiosmtplib (password reset via email)
- openpyxl (Excel export)
- aiofiles, python-multipart (files, avatar upload)

**Frontend**
- React 18 + TypeScript
- Vite
- React Router
- Chart.js

**Database**
- PostgreSQL

**Infrastructure**
- Docker / docker-compose
- Nginx (production frontend build + `/api` proxy)

## Project Structure

```
swot/
├── backend/                # FastAPI application
│   ├── app/
│   │   ├── main.py         # App entry point, routers, CORS, static /uploads
│   │   ├── config.py       # Settings from .env (pydantic-settings)
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── repositories/   # Database access
│   │   ├── services/       # Business logic, calculations, Excel export, e-mail
│   │   ├── routers/        # API endpoints (/api/auth, /api/users, /api/analyses/*, /api/ws)
│   │   ├── middleware/     # Auth, logging, rate limiting
│   │   ├── core/           # Logging config, WebSocket manager
│   │   ├── data/           # SWOT industry questionnaires
│   │   └── scripts/        # Guest account & demo data seeding
│   ├── alembic/            # Database migrations
│   ├── uploads/            # User avatars (not in repository)
│   ├── requirements.txt
│   └── .env.example        # Template for .env.local
├── frontend/               # React + TypeScript (Vite)
│   └── src/
│       ├── pages/          # Auth, Dashboard, Profile, Settings, ResetPassword, analyses/*
│       ├── components/     # Layout, Toast, GuidePanel, shared UI
│       ├── api/            # API client
│       ├── context/, hooks/, i18n/   # Auth state, hooks, EN/PL/RU translations
│       └── styles/         # Global styles
├── docker/                 # docker-compose.yml + env templates
└── db_schema.sql           # Reference database schema
```

## Run without Docker

```bash
# backend
cd backend
pip install -r requirements.txt
cp .env.example .env.local        # fill in DATABASE_URL, JWT_SECRET_KEY
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# frontend (in another terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

## Run with Docker

```bash
cd docker
cp postgres.env.example .env                       # fill in POSTGRES_*
cp backend.env.docker.example backend.env.docker    # fill in real values

docker compose up -d --build      # http://<server IP>:8080
```

The guest account and demo data are created automatically on the backend's first start.
