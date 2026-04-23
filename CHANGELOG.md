# Changelog

All notable changes are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [0.0.1] — 2026-04-23

### Added

#### Backend
- JWT authentication — register, login, `/api/auth/me`
- Workout CRUD with nested sets (reps, weight kg, RPE, duration, distance)
- Exercise library per user
- Daily activity stats — upsert by date, accepts steps, sleep, resting HR, calories, stress, floors, active minutes
- Heart rate readings — bulk insert and time-series query, linked to workout or standalone
- Batch sync endpoint (`POST /api/sync/`) for offline Android uploads — deduplicates by `client_id`
- Dashboard stats — total workouts, this-week count, workout streak, avg duration, today's Garmin strip
- HTTPS security headers on all responses (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- Version constant (`APP_VERSION = "0.0.1"`) exposed in `/health` and dashboard response
- API docs disabled in production, available in development mode at `/api/docs`

#### Infrastructure
- `docker-compose.yml` — PostgreSQL 16, Redis 7, FastAPI backend (port 8000), React frontend (port 3000)
- No bundled reverse proxy — works with any proxy (Nginx Proxy Manager, Traefik, Cloudflare Tunnel, etc.)
- Docker Compose labels with `com.magni.version`
- Multi-stage Docker builds for backend and frontend
- Alembic migration environment wired to async SQLAlchemy

#### Web dashboard
- Login page
- Dashboard — stat cards, Garmin today strip, recent workouts list
- Workouts list with pagination
- Workout detail — meta strip, heart rate line chart (Recharts), sets table
- Activity page — steps bar chart, resting HR line chart, sleep bar chart, daily breakdown table
- Version shown in sidebar (`v0.0.1`)
- API client validates `https://` at startup and logs a warning if misconfigured

#### Docs
- `README.md` — full setup guide including GitHub Desktop workflow, reverse proxy notes, env vars table, API reference, security notes, backup instructions
- `.env.example` — all variables documented
- `.gitignore` — excludes `.env`, `node_modules`, `__pycache__`, build artifacts
- `CHANGELOG.md` — this file
