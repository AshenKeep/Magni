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
- Heart rate readings — bulk insert and time-series query
- Batch sync endpoint (`POST /api/sync/`) for offline Android uploads — deduplicates by `client_id`
- Dashboard stats — total workouts, streak, avg duration, today's Garmin strip
- HTTPS security headers on all responses
- `APP_VERSION = "0.0.1"` exposed in `/health` and dashboard response
- API docs disabled in production, available at `/api/docs` in development
- React frontend served directly from FastAPI — single container, single port

#### Infrastructure
- Single combined Docker image — multi-stage build (Node → Python), React compiled into backend image
- `docker-compose.yml` — PostgreSQL 16, Redis 7, combined backend (port 8000), backup service
- `depends_on` with `service_healthy` — backend waits for Postgres and Redis healthchecks before starting
- Backup service — Alpine container runs `pg_dump` on configurable cron schedule, writes compressed `.sql.gz` to CIFS NAS volume, auto-prunes backups older than 30 days
- CIFS backup volume — configured via `CIFS_PATH`, `CIFS_USERNAME`, `CIFS_PASSWORD` env vars
- `TZ` env var controls timezone for backup scheduling
- GitHub Actions — single job builds and pushes combined image to `ghcr.io/ashenkeep/magni-backend`
- Postgres and Redis data volumes remain on local storage (CIFS not supported for live DB data)

#### Web dashboard
- Login page
- Dashboard — stat cards, Garmin today strip, recent workouts
- Workouts list with pagination
- Workout detail — HR line chart, sets table
- Activity page — steps, resting HR, sleep charts, daily breakdown table
- Version shown in sidebar (`v0.0.1`)

#### Docs
- `README.md` — full setup guide, env vars, API reference, backup/restore instructions
- `.env.example` — all variables documented including CIFS and TZ
- `.gitignore` — excludes `.env`, build artifacts
- `CHANGELOG.md` — this file
