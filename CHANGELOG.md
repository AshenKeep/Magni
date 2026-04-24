# Changelog

All notable changes are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [0.0.3] — 2026-04-24

### Added

#### Backend
- `Template` and `TemplateExercise` models — named workout plans with ordered exercises, target sets/reps/weight
- Migration `0002_templates.py`
- `POST/GET/PATCH/DELETE /api/templates/` — full template CRUD
- `POST /api/templates/{id}/exercises` — add exercise to template
- `DELETE /api/templates/{id}/exercises/{ex_id}` — remove exercise from template
- `POST /api/templates/{id}/start` — create a new workout pre-filled from a template
- `POST /api/workouts/{id}/sets` — add a set to a live workout
- `PATCH /api/workouts/{id}/sets/{set_id}` — update a set in real time
- `DELETE /api/workouts/{id}/sets/{set_id}` — delete a set
- `PATCH /api/exercises/{id}` — update an exercise
- `WorkoutSetUpdate` schema
- `GET /api/admin/backup/status` — backup status, schedule, NAS path, last backup info
- `POST /api/admin/backup/run` — manual backup trigger
- `GET /api/admin/users` — list all users
- `POST /api/admin/users/reset-password` — reset any user's password
- `PATCH /api/admin/users/{id}/toggle-active` — enable/disable user accounts

#### Frontend — full redesign
- OLED black (`#000000`) background, dark grey cards, electric blue (`#5B7FFF`) and magenta (`#CC2ECC`) accents pulled from brand image
- Tailwind config rebuilt with semantic colour tokens
- Global CSS component classes (`btn-primary`, `btn-secondary`, `btn-danger`, `card`, `input`, `label`, `badge-blue`, `badge-magenta`)
- **Dashboard** — stat cards with accent colour borders, quick-start button, recent workouts list
- **Workouts list** — with "New workout" and "From template" buttons
- **New/Active workout page** — live timer, exercise picker modal (grouped by muscle), per-exercise set logging (weight, reps, RPE), add set, delete set, finish workout
- **Workout detail** — sets grouped by exercise, HR chart, delete workout
- **Exercise library** — full CRUD, muscle group filter, search, grouped display
- **Templates** — create/edit/delete templates with ordered exercises and target sets/reps/weight, start workout from template
- **Activity** — 4 charts (steps, resting HR, sleep, active calories), daily breakdown table, 7/30/90 day toggle
- **Admin** — backup status panel, manual backup trigger, user list with enable/disable, password reset form, system info
- **Login/Setup** — redesigned with new theme
- Sidebar updated with all new nav items (Exercises, Templates, Admin)
- Loading screen with Magni branding

#### Docs
- README updated — v0.0.3, new API endpoints documented
- CHANGELOG — this entry

---

## [0.0.2] — 2026-04-23

### Added

#### Backend
- `GET /api/auth/setup-required` — returns `{"required": true}` if no users exist, `{"required": false}` otherwise
- `POST /api/auth/setup` — creates the first user account and returns a JWT token immediately. Returns 403 if any user already exists
- `SetupRequest` Pydantic schema for the setup endpoint
- `app/cli.py` — emergency account management CLI, bypasses authentication entirely:
  - `reset-password --email --password` — reset any user's password directly via the database
  - `create-user --email --password --name` — create a new account
  - `list-users` — list all accounts with status and creation date

#### Frontend
- `SetupPage.tsx` — first-run setup page with display name, email, password, confirm password fields. Logs user straight in on success. Shows a notice that the page is only accessible once
- `App.tsx` — on load, checks `/api/auth/setup-required` before rendering anything. Redirects to `/setup` if needed, redirects away from `/setup` if setup is already complete
- Version bumped to `v0.0.2` in sidebar

#### Docs
- README updated — first-time setup instructions replace manual account creation step
- README — lost access / emergency recovery section with CLI commands
- README — API reference updated with setup endpoints

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
- Backup scheduler via APScheduler — runs `pg_dump` inside the backend process on a configurable cron schedule, writes gzipped SQL files to CIFS-mounted NAS volume, auto-prunes after 30 days
- `POST /api/backup/run` — manual backup trigger endpoint

#### Infrastructure
- Single combined Docker image — multi-stage build (Node → Python), React compiled into backend image
- `postgresql-client` included in backend image for `pg_dump`
- `docker-compose.yml` — PostgreSQL 16, Redis 7, single backend container (port 8000)
- `depends_on` with `service_healthy` — backend waits for Postgres and Redis healthchecks before starting, preventing name resolution failures on cold boot
- CIFS backup volume mounted into backend container at `/backups` — configured via `CIFS_PATH`, `CIFS_USERNAME`, `CIFS_PASSWORD`
- `TZ` env var controls timezone for backup scheduling
- `BACKUP_SCHEDULE` env var — cron format, default `0 2 * * *` (2am daily)
- `BACKUP_DIR` env var — path inside container, default `/backups`
- Postgres and Redis data volumes remain on local storage (CIFS not supported for live DB data)
- GitHub Actions — single job builds and pushes combined image to `ghcr.io/ashenkeep/magni-backend`

#### Web dashboard
- Login page
- Dashboard — stat cards, Garmin today strip, recent workouts
- Workouts list with pagination
- Workout detail — HR line chart, sets table
- Activity page — steps, resting HR, sleep charts, daily breakdown table
- Version shown in sidebar (`v0.0.1`)

#### Docs
- `README.md` — full setup guide, env vars table, docker-compose example, API reference, backup/restore instructions, manual backup endpoint
- `.env.example` — all variables documented including CIFS, TZ, BACKUP_DIR
- `.gitignore` — excludes `.env`, build artifacts
- `CHANGELOG.md` — this file
