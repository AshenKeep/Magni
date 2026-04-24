# Magni

**Version:** v0.0.5

A self-hosted fitness tracking system. Log workouts, build templates, sync Garmin watch data, and review everything in one dashboard — running entirely on your own server.

---

## Credits

Exercise data powered by **[AscendAPI](https://ascendapi.com)** (formerly ExerciseDB) — structured, expert-validated exercise data with GIFs, videos, and instructions.
- Website: [ascendapi.com](https://ascendapi.com)
- RapidAPI: [rapidapi.com/user/ascendapi](https://rapidapi.com/user/ascendapi)
- GitHub: [github.com/ExerciseDB/exercisedb-api](https://github.com/ExerciseDB/exercisedb-api)

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
- A reverse proxy handling TLS (Nginx Proxy Manager, Traefik, Cloudflare Tunnel, etc.)
- Ports 80 and 443 open on your router/firewall

### Deploy

```bash
# Clone the repo
git clone https://github.com/AshenKeep/magni.git
cd magni

# Configure
cp .env.example .env
nano .env   # fill in all values

# Pull images and start
docker compose pull
docker compose up -d
```

### First run

On first launch, the app detects no users exist and redirects to a setup page where you create your account. The setup page is inaccessible once an account exists.

### Deploying updates

```bash
cd magni
git pull
docker compose pull
docker compose up -d
```

### Reverse proxy

Point your reverse proxy at `http://YOUR_SERVER_IP:8000` — both the frontend dashboard and all `/api/*` are served from a single container on a single port.

---

## docker-compose.yml

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    container_name: magni_db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-magni}
      POSTGRES_USER: ${POSTGRES_USER:-magni}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-magni}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - magni_internal

  redis:
    image: redis:7-alpine
    container_name: magni_redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - magni_internal

  backend:
    image: ghcr.io/ashenkeep/magni-backend:latest
    container_name: magni_backend
    restart: unless-stopped
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-magni}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-magni}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
      SECRET_KEY: ${SECRET_KEY}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS}
      APP_URL: ${APP_URL}
      ENVIRONMENT: ${ENVIRONMENT:-production}
      TZ: ${TZ:-UTC}
      BACKUP_SCHEDULE: ${BACKUP_SCHEDULE:-0 2 * * *}
      BACKUP_DIR: /backups
      ASCENDAPI_KEY: ${ASCENDAPI_KEY:-}
      MEDIA_STORAGE: ${MEDIA_STORAGE:-external}
      MEDIA_DIR: /media/exercises
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - backup_data:/backups
      - media_data:/media/exercises
    networks:
      - magni_internal

volumes:
  postgres_data:
  redis_data:
  backup_data:
    driver: local
    driver_opts:
      type: cifs
      device: "${CIFS_PATH}"
      o: "username=${CIFS_USERNAME},password=${CIFS_PASSWORD},uid=1000,gid=1000"
  media_data:
  # For CIFS NAS storage, replace media_data with:
  # media_data:
  #   driver: local
  #   driver_opts:
  #     type: cifs
  #     device: "//YOUR_NAS_IP/media"
  #     o: "username=YOUR_USER,password=YOUR_PASS,uid=1000,gid=1000"

networks:
  magni_internal:
    driver: bridge
```

---

## Environment variables

| Variable | Description |
|---|---|
| `APP_URL` | Full public URL — must be `https://` |
| `ALLOWED_ORIGINS` | CORS origins — usually same as `APP_URL` |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `REDIS_PASSWORD` | Redis password |
| `SECRET_KEY` | JWT signing key — `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | `production` or `development` |
| `BACKEND_PORT` | Port exposed to host (default `8000`) |
| `TZ` | Timezone e.g. `Australia/Perth` |
| `BACKUP_SCHEDULE` | Cron schedule (default `0 2 * * *` — 2am daily) |
| `BACKUP_DIR` | Backup path in container (default `/backups`) |
| `CIFS_PATH` | NAS backup share e.g. `//192.168.1.x/backups` |
| `CIFS_USERNAME` | NAS username |
| `CIFS_PASSWORD` | NAS password |
| `ASCENDAPI_KEY` | RapidAPI key for AscendAPI exercise seeding |
| `MEDIA_STORAGE` | `external` / `local` / `cifs` (default `external`) |
| `MEDIA_CIFS_PATH` | NAS media share (when `MEDIA_STORAGE=cifs`) |
| `MEDIA_CIFS_USERNAME` | NAS username for media |
| `MEDIA_CIFS_PASSWORD` | NAS password for media |

---

## Exercise library seeding (AscendAPI)

Magni integrates with [AscendAPI](https://ascendapi.com) to seed your exercise library with data, GIFs, and instructions.

**Free plan: 2,000 requests/month, no credit card required.**

### Setup

1. Sign up at [rapidapi.com](https://rapidapi.com)
2. Search for **"EDB with Videos and Images by AscendAPI"** → Subscribe (Basic, free)
3. Copy your `X-RapidAPI-Key` → add to `.env` as `ASCENDAPI_KEY`
4. Restart: `docker compose up -d`
5. Go to **Admin → Exercise Library** and choose a seed mode

### Seed modes

| Mode | API requests | Result |
|---|---|---|
| **Seed metadata only** | ~9 | Exercise names, muscles, instructions. GIFs load from AscendAPI CDN |
| **Seed + download GIFs** | ~9 + N | Full data + GIFs saved to your server (local or NAS) |
| **Download GIFs for existing** | ~N | Cache GIFs for already-seeded exercises |

**Tip for free plan users:** Seed metadata first (~9 requests), use the app for a while, then download GIFs (~225 requests) in a separate month to stay well within the 2,000/month quota.

### Media storage options

### Media storage options

Set `MEDIA_STORAGE` in `.env`:

- `external` — GIFs served from AscendAPI CDN (default, no storage needed)
- `local` — GIFs downloaded to a local Docker volume (default `media_data` volume)
- `cifs` — GIFs downloaded to a CIFS NAS share

For CIFS media storage, edit `docker-compose.yml` and replace the `media_data:` volume block with:

```yaml
media_data:
  driver: local
  driver_opts:
    type: cifs
    device: "//YOUR_NAS_IP/media"
    o: "username=YOUR_USER,password=YOUR_PASS,uid=1000,gid=1000"
```

---

## Lost access — emergency recovery

```bash
# Reset a user's password
docker compose exec backend python -m app.cli reset-password --email you@example.com --password newpassword

# Create a new user
docker compose exec backend python -m app.cli create-user --email you@example.com --password newpassword --name "Your Name"

# List all accounts
docker compose exec backend python -m app.cli list-users
```

---

## Backup & restore

Backups run automatically per `BACKUP_SCHEDULE`. Files are written as `magni_backup_YYYYMMDD_HHMMSS.sql.gz`, kept for 30 days.

**Trigger manually:**
```bash
curl -X POST http://localhost:8000/api/admin/backup/run \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Restore:**
```bash
gunzip -c magni_backup_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T db psql -U magni magni
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
| `POST` | `/api/exercises/` | Add exercise |
| `GET` | `/api/exercises/` | List exercises |
| `PATCH` | `/api/exercises/{id}` | Update exercise |
| `DELETE` | `/api/exercises/{id}` | Delete exercise |
| `POST` | `/api/templates/` | Create template |
| `GET` | `/api/templates/` | List templates |
| `POST` | `/api/templates/{id}/start` | Start workout from template |
| `POST` | `/api/stats/daily` | Upsert Garmin daily stats |
| `GET` | `/api/stats/daily` | Query daily stats |
| `POST` | `/api/stats/hr` | Bulk insert HR readings |
| `POST` | `/api/sync/` | Batch sync from Android |
| `GET` | `/api/admin/backup/status` | Backup status |
| `POST` | `/api/admin/backup/run` | Manual backup |
| `GET` | `/api/admin/exercises/seed/estimate` | Quota estimate |
| `POST` | `/api/admin/exercises/seed` | Seed exercises |
| `POST` | `/api/admin/exercises/download-gifs` | Cache GIFs locally |
| `GET` | `/api/admin/exercises/media/status` | Media storage status |
| `GET` | `/health` | Health check + version |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
