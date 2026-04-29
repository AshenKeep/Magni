# Changelog

All notable changes are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [0.0.6] — 2026-04-29

### Added

#### Backend
- **WorkoutX API integration** — second exercise data provider (1,321 exercises, free tier 500 req/month, no card required). New service module `services/workoutx.py`. Uses different auth (`X-WorkoutX-Key` header) and direct API (not RapidAPI).
- **Multi-category muscle tagging** — exercises are now tagged with all muscle categories they target. New `muscle_groups` JSON column on Exercise. Compound movements like push-ups appear under Chest AND Shoulders AND Core.
- **Database-backed API keys** — new `api_keys` table replaces env-var-based key storage. Keys managed via Admin UI, no container restart needed when changing them. Fixes the lru_cache bug from v0.0.5 permanently.
- New shared `services/muscle_mapping.py` module — single source of truth for mapping body parts and muscle names to Magni's simplified categories. Used by both AscendAPI and WorkoutX providers.
- New `services/api_keys.py` module — DB-backed key CRUD with `get_api_key`, `set_api_key`, `delete_api_key`, `list_api_keys`, `mask_key` helpers.
- New endpoints:
  - `GET /api/admin/api-keys` — list configured providers with masked previews
  - `POST /api/admin/api-keys` — save/update a provider key
  - `DELETE /api/admin/api-keys/{provider}` — remove a provider key
- Updated endpoints:
  - `POST /api/admin/exercises/seed?provider={ascendapi|workoutx|both}` — provider selection
  - `GET /api/admin/exercises/seed/estimate?provider=…` — per-provider quota estimates
  - `GET /api/admin/exercises/media/status` — now returns per-provider configured status
- Exercise model gains `muscle_groups`, `source` ("ascendapi"/"workoutx"/"manual"), `workoutx_id` columns
- Migration `0005_v006_changes.py` adds new columns + api_keys table, backfills existing exercises with single-element `muscle_groups` array

#### Frontend
- **API Keys panel in Admin** — per-provider cards with status indicator, masked key preview, Add/Replace/Remove buttons, collapsible setup instructions, free quota display
- **Provider selector in seed panel** — Buttons for AscendAPI / WorkoutX / Both. Disabled when key not configured.
- **Multi-category filter** — exercise filter dropdown now shows exercises that target the selected muscle as primary OR secondary
- **Category tags in exercise list** — small chips next to exercise name showing additional muscle categories beyond the current group
- **Detail modal shows all categories** — every muscle category an exercise targets shown as primary tag
- New helper `lib/muscleGroups.ts` — `parseMuscleGroups`, `exerciseMatchesMuscle`, `MUSCLE_CATEGORIES`
- `ExerciseResponse` type extended with `muscle_groups`, `source`, `workoutx_id`

#### Docs
- README rewritten — both provider credits, API keys section explains DB storage, environment variable table simplified (no `ASCENDAPI_KEY`)
- AscendAPI and WorkoutX both credited prominently
- Multi-category muscle tagging explained
- API reference updated with new admin endpoints

### Removed
- **`ASCENDAPI_KEY` env var** — fully removed. Was previously used to configure the AscendAPI key. Now stored in the database via Admin UI. The previous env var fallback has been removed entirely.
- `ascendapi_key` setting from `app/core/config.py`
- `ASCENDAPI_KEY: ${ASCENDAPI_KEY:-}` line from `docker-compose.yml`
- `ASCENDAPI_KEY=…` line from `.env.example`
- `GET /api/admin/debug/env` endpoint (was a v0.0.5 debug helper, no longer needed)

### Migration notes
- Run `docker compose pull && docker compose up -d` to apply migration `0005`. Existing exercises get a single-item `muscle_groups` array preserving their current tag.
- After upgrading, existing AscendAPI users need to re-add their key via **Admin → API Keys** (the env var is no longer read).

---

## [0.0.5] — 2026-04-24

### Added

#### Backend
- Three media storage modes for exercise GIFs: `external` (CDN links), `local` (Docker volume), `cifs` (NAS share)
- `MEDIA_STORAGE`, `MEDIA_DIR`, `MEDIA_CIFS_PATH/USERNAME/PASSWORD` config settings
- `download_gif()` in `ascendapi.py` — downloads GIF from CDN and saves to `/media/exercises/`
- `get_media_dir()` — returns media directory path based on `MEDIA_STORAGE` setting
- `estimate_requests()` — calculates API quota usage before seeding
- `GET /api/admin/exercises/seed/estimate` — returns request cost estimate (metadata-only vs with GIFs)
- `POST /api/admin/exercises/seed?download_gifs=true/false` — two seed modes
- `POST /api/admin/exercises/download-gifs` — downloads GIFs for already-seeded exercises
- `GET /api/admin/exercises/media/status` — media storage config and local GIF count
- `/media/exercises` served as static files by FastAPI when local/CIFS storage is active
- `media_data` volume in `docker-compose.yml` — configurable as local or CIFS

#### Frontend
- Admin page — seed panel redesigned with three buttons (metadata only, seed + GIFs, download GIFs for existing)
- Quota estimates shown before seeding — metadata requests, GIF requests, total, free quota remaining
- Media storage status indicator — shows current mode and local GIF count
- "Seed + download GIFs" and "Download GIFs" buttons disabled with explanation when `MEDIA_STORAGE=external`
- AscendAPI attribution in seed panel with links to ascendapi.com and RapidAPI
- Setup instructions collapsed into `<details>` to reduce clutter
- System info panel shows media storage mode and GIF count
- Version updated to `v0.0.5`

#### Docs
- README fully rewritten — GitHub Desktop setup section removed entirely
- README deploy section simplified to `docker compose pull && docker compose up -d`
- AscendAPI attribution section added to README
- Exercise seeding section — explains three seed modes and free plan quota strategy
- Media storage options documented — `external`, `local`, `cifs`
- `.env.example` updated with `MEDIA_STORAGE`, `MEDIA_CIFS_*`, `MEDIA_VOLUME_*` vars
- `.env.example` version header updated to `v0.0.5`

---

## [0.0.4] — 2026-04-24

### Added

#### Backend
- `secondary_muscles`, `instructions`, `gif_url`, `video_url`, `ascendapi_id` fields on `Exercise` model
- Migration `0003_exercise_media.py`
- `app/services/ascendapi.py` — AscendAPI (ExerciseDB) client: fetches exercises by body part, normalises muscle groups and equipment, maps to internal schema
- `POST /api/admin/exercises/seed` — imports exercises from AscendAPI into the user's library, skips duplicates by `ascendapi_id`, returns added/skipped counts
- `ASCENDAPI_KEY` setting in config, passed via env var
- `ExerciseCreate` and `ExerciseResponse` schemas updated with all new fields
- `WorkoutSetUpdate` schema — supports partial updates for reps, weight, RPE during live logging

#### Frontend
- **Exercise Library** — GIF thumbnails in exercise list, exercise detail modal with full GIF, step-by-step instructions, muscle badges, secondary muscles
- **Exercise form** — instructions field, GIF URL field added for manual entry
- **New Workout page** — exercise picker shows GIF thumbnails next to exercise names
- **Templates** — empty exercise library state shows helpful message directing to Admin → Seed or Exercise Library
- **Admin page** — AscendAPI seed panel with setup instructions, seed button, result feedback (added/skipped counts)
- Admin page version updated to `v0.0.4`

#### Config
- `ASCENDAPI_KEY` added to `.env.example` with signup instructions
- `ASCENDAPI_KEY` added to `docker-compose.yml` backend environment
- `.env.example` version header updated to `v0.0.4`

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
