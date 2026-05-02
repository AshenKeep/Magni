# Magni

**Version:** v0.0.10

A self-hosted fitness tracking system. Log workouts, build templates, sync Garmin watch data, and review everything in one dashboard — running entirely on your own server.

---

## Credits

Magni integrates with two exercise data providers, both with free tiers:

**[AscendAPI](https://ascendapi.com)** — formerly ExerciseDB. Structured, expert-validated exercise data with GIFs, videos, instructions.
- Free tier: 2,000 requests/month
- RapidAPI: [rapidapi.com/user/ascendapi](https://rapidapi.com/user/ascendapi)
- GitHub: [github.com/ExerciseDB/exercisedb-api](https://github.com/ExerciseDB/exercisedb-api)

**[WorkoutX](https://workoutxapp.com)** — 1,321 exercises with GIF animations, body part filters, target muscle data, equipment types, instructions.
- Free tier: 500 requests/month, no card required
- Docs: [workoutxapp.com/docs.html](https://workoutxapp.com/docs.html)
- Direct API (not RapidAPI)

You can use either, both, or neither — all keys are configured in the Admin UI.

---

## Stack

| Service | Purpose |
|---|---|
| `magni_backend` | FastAPI API + React dashboard + backup scheduler |
| `magni_db` | PostgreSQL — all persistent data (local volume only) |
| `magni_redis` | Redis — sync queue and cache (local volume only) |

> **Important:** Postgres and Redis data volumes must stay on local storage — they require POSIX file locking which CIFS does not support. Backup and media volumes support CIFS.

---

## Deployment

### Prerequisites

- Linux server with Docker Engine 24+ and Docker Compose v2
- A domain pointed at your server's public IP (or DDNS — [DuckDNS](https://www.duckdns.org) is free)
- A reverse proxy handling TLS (Nginx Proxy Manager, Traefik, Cloudflare Tunnel, etc.) — optional for LAN-only use
- Ports 80 and 443 open on your router/firewall (if using public access)

### Deploy

```bash
git clone https://github.com/AshenKeep/magni.git
cd magni

cp .env.example .env
nano .env   # fill in all values

docker compose pull
docker compose up -d
```

### First run

On first launch, the app detects no users exist and redirects to a setup page where you create your account. The setup page is inaccessible once an account exists.

After signing in, go to **Admin → API Keys** to add your provider keys (optional — only needed if you want to seed exercises from external sources).

### Updates

```bash
cd magni
git pull
docker compose pull
docker compose up -d
```

---

## Environment variables

API keys for exercise providers (AscendAPI, WorkoutX) are **NOT** in `.env` — they're managed via the Admin UI and stored in the database. This avoids container restart hassles when changing keys.

| Variable | Description |
|---|---|
| `APP_URL` | Full public URL — must be `https://` (or `http://` for LAN) |
| `ALLOWED_ORIGINS` | CORS origins — usually same as `APP_URL` |
| `POSTGRES_DB` | PostgreSQL database name (default `magni`) |
| `POSTGRES_USER` | PostgreSQL username (default `magni`) |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `REDIS_PASSWORD` | Redis password |
| `SECRET_KEY` | JWT signing key — `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | `production` or `development` |
| `BACKEND_PORT` | Port exposed to host (default `8000`) |
| `TZ` | Timezone e.g. `Australia/Perth` |
| `BACKUP_SCHEDULE` | Cron schedule (default `0 2 * * *` — 2am daily) |
| `CIFS_PATH` | NAS backup share e.g. `//192.168.1.x/backups` |
| `CIFS_USERNAME` | NAS username |
| `CIFS_PASSWORD` | NAS password |
| `MEDIA_STORAGE` | `external` / `local` / `cifs` (default `external`) |
| `MEDIA_CIFS_PATH` | NAS media share (when `MEDIA_STORAGE=cifs`) |
| `MEDIA_CIFS_USERNAME` | NAS username for media |
| `MEDIA_CIFS_PASSWORD` | NAS password for media |

---

## Exercise library seeding

Magni can pull exercise data from AscendAPI and/or WorkoutX. Both have free tiers.

### Setup

1. Sign up for whichever provider(s) you want:
   - **AscendAPI**: [rapidapi.com](https://rapidapi.com) → Search "EDB with Videos and Images by AscendAPI" → Subscribe (Basic, free)
   - **WorkoutX**: [workoutxapp.com/dashboard.html](https://workoutxapp.com/dashboard.html#register) → Get API Key (free, no card)
2. Go to **Admin → API Keys** in Magni
3. Click "Add key" next to the provider, paste the key, save
4. Go to **Admin → Exercise Library — Seed**, choose provider, click a seed button

### Seed modes

| Mode | API requests | Result |
|---|---|---|
| **Seed metadata only** | ~9–10 | Exercise names, muscles, instructions. GIFs load from CDN |
| **Seed + download GIFs** | ~9 + N | Full data + GIFs cached on your server |
| **Download GIFs for existing** | ~N | Cache GIFs for already-seeded exercises |

### Multi-category muscle tagging

Exercises are tagged with **all** muscle categories they target — primary, secondary, supporting. So filtering by "Chest" shows compound movements like push-ups (Chest + Shoulders + Core), not just isolation lifts.

### Media storage options

Set `MEDIA_STORAGE` in `.env`:

- `external` — GIFs load from provider CDN (default, no storage needed)
- `local` — GIFs downloaded to a local Docker volume
- `cifs` — GIFs downloaded to a CIFS NAS share

For `cifs`, also set `MEDIA_CIFS_PATH/USERNAME/PASSWORD` in `.env` and uncomment the CIFS block in `docker-compose.yml`.

---

## Lost access — emergency recovery

```bash
docker compose exec backend python -m app.cli reset-password --email you@example.com --password newpassword
docker compose exec backend python -m app.cli create-user --email you@example.com --password newpassword --name "Your Name"
docker compose exec backend python -m app.cli list-users
```

---

## Backup & restore

Backups run automatically per `BACKUP_SCHEDULE`. As of v0.0.9 they are written as `magni_backup_YYYYMMDD_HHMMSS.tar.gz`, each tarball containing:

- `db.sql` — pg_dump output
- `manifest.json` — backup metadata + media file list with sizes/mtimes
- `media/...` — copy of `/media` (only if "Include media" is enabled in Admin → Backup)

**Retention** is configurable from Admin → Backup → Settings (default 7 most recent backups). Older backups are pruned after each run.

**Restore** from the UI: Admin → Backup → pick a backup → Restore. This drops the public schema, replays `db.sql`, and (if media is in the tarball) replaces `/media`. Restore is destructive and cannot be undone — confirm carefully.

Manual restore from CLI (rare — UI is preferred):
```bash
# Extract the archive somewhere temporary
tar -xzf magni_backup_YYYYMMDD_HHMMSS.tar.gz -C /tmp/restore

# Replay the SQL
docker compose exec -T db psql -U magni -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
docker compose exec -T db psql -U magni magni < /tmp/restore/db.sql

# Restore media (if present in the archive)
rm -rf /path/to/media && cp -r /tmp/restore/media /path/to/media
```

---

## Useful commands

```bash
docker compose logs -f backend     # live logs
docker compose restart backend     # restart backend
docker compose exec db psql -U magni magni  # database shell
docker compose down                # stop everything
docker compose down -v             # stop and wipe all data (irreversible)
```

---

## API reference

Available at `http://localhost:8000/api/docs` when `ENVIRONMENT=development`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/setup-required` | First-run setup check |
| `POST` | `/api/auth/setup` | Create first account |
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/dashboard/` | Summary stats |
| `POST` | `/api/workouts/` | Create workout |
| `GET` | `/api/workouts/` | List workouts |
| `GET` | `/api/workouts/{id}` | Workout detail |
| `PATCH` | `/api/workouts/{id}` | Update workout |
| `DELETE` | `/api/workouts/{id}` | Delete workout |
| `POST` | `/api/workouts/{id}/sets` | Add set |
| `PATCH` | `/api/workouts/{id}/sets/{set_id}` | Update set |
| `DELETE` | `/api/workouts/{id}/sets/{set_id}` | Delete set |
| `POST` | `/api/workouts/{id}/save-as-template` | Convert a logged workout into a reusable template |
| `POST` | `/api/exercises/` | Add exercise |
| `GET` | `/api/exercises/` | List exercises |
| `PATCH` | `/api/exercises/{id}` | Update exercise |
| `DELETE` | `/api/exercises/{id}` | Delete exercise |
| `POST` | `/api/templates/` | Create template (typically with no exercises — add them after) |
| `GET` | `/api/templates/` | List templates |
| `GET` | `/api/templates/{id}` | Get template with exercises and per-set targets |
| `PATCH` | `/api/templates/{id}` | Update template name/notes |
| `DELETE` | `/api/templates/{id}` | Delete template |
| `POST` | `/api/templates/{id}/exercises` | Add an exercise (with per-set targets) to a template |
| `PATCH` | `/api/templates/{id}/exercises/{te_id}` | Edit log type or sets on a template-exercise |
| `DELETE` | `/api/templates/{id}/exercises/{te_id}` | Remove an exercise from a template |
| `POST` | `/api/templates/{id}/start` | Start workout from template (pre-fills sets you can edit) |
| `POST` | `/api/stats/daily` | Upsert Garmin daily stats |
| `GET` | `/api/stats/daily` | Query daily stats |
| `POST` | `/api/stats/hr` | Bulk insert HR readings |
| `POST` | `/api/sync/` | Batch sync from Android |
| `GET` | `/api/admin/api-keys` | List configured provider keys |
| `POST` | `/api/admin/api-keys` | Save/update provider key |
| `DELETE` | `/api/admin/api-keys/{provider}` | Remove provider key |
| `GET` | `/api/admin/backup/status` | Backup status |
| `GET` | `/api/admin/backup/list` | List available backups |
| `GET` | `/api/admin/backup/settings` | Get retention/include_media settings |
| `PATCH` | `/api/admin/backup/settings` | Update retention/include_media |
| `POST` | `/api/admin/backup/run` | Manual backup (optional `include_media` body) |
| `POST` | `/api/admin/backup/restore/{filename}` | Restore from a backup (DESTRUCTIVE) |
| `DELETE` | `/api/admin/backup/{filename}` | Delete a backup file |
| `POST` | `/api/exercises/{id}/upload-image` | Upload PNG/JPG/GIF/WEBP image (≤5 MB) |
| `GET` | `/api/admin/exercises/seed/estimate` | Quota estimate |
| `POST` | `/api/admin/exercises/seed` | Seed exercises (provider param) |
| `POST` | `/api/admin/exercises/download-gifs` | Cache GIFs locally |
| `GET` | `/api/admin/exercises/media/status` | Media storage status |
| `GET` | `/api/admin/logs/seed` | Last 10 seed attempts |
| `GET` | `/health` | Health check + version |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
