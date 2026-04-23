# Magni

**Version:** v0.0.2

A self-hosted fitness tracking system. Log workouts offline on Android, sync Garmin watch data (heart rate, steps, sleep, active calories), and view everything in a web dashboard — all running on your own server.

---

## How it works

```
Your server (Docker)                    Your phone (Android app)
──────────────────────                  ──────────────────────────
  PostgreSQL                            Workout logger (offline-first)
  Redis                    ◄──sync──►  Garmin ConnectIQ bridge
  FastAPI + React (one container)       Background sync engine
        ▲
        │ HTTPS (your reverse proxy)
        │
  Internet / your LAN
```

The backend and frontend run as a **single container** — FastAPI serves both the REST API and the React dashboard. Scheduled backups also run inside the same container via APScheduler, writing compressed dumps to a CIFS-mounted NAS volume. Your reverse proxy only needs to point at one port (`8000`).

---

## Stack

| Service | Purpose |
|---|---|
| `magni_backend` | FastAPI API + React frontend + backup scheduler (single container) |
| `magni_db` | PostgreSQL — persistent data (local volume only) |
| `magni_redis` | Redis — sync queue and cache (local volume only) |

> **Important:** Postgres and Redis data volumes must be on local storage. Never mount them over CIFS — Postgres requires POSIX file locking which CIFS does not support. The backup volume goes to CIFS; the live databases do not.

---

## Part 1 — Docker server & web dashboard

### Prerequisites

- Linux server with Docker Engine 24+ and Docker Compose v2
- A domain pointed at your server's public IP (or DDNS — [DuckDNS](https://www.duckdns.org) is free)
- A reverse proxy handling TLS (Nginx Proxy Manager, Traefik, Cloudflare Tunnel, etc.)
- Ports 80 and 443 open on your router/firewall
- A CIFS share on your NAS for backups

### Setting up GitHub and deploying

#### Step 1 — GitHub repo (one time only)

1. Install [GitHub Desktop](https://desktop.github.com) and sign in
2. **File → New Repository** — name it `magni`, click **Create Repository**
3. Click **Publish repository**
4. Copy all files from this zip into the local repo folder
5. GitHub Desktop will show all files as changes
6. Commit message: `Initial commit — Magni v0.0.1` → **Commit to main** → **Push origin**

#### Step 2 — Clone and run on your server

```bash
git clone https://github.com/AshenKeep/magni.git
cd magni
cp .env.example .env
nano .env   # fill in all values

docker compose pull
docker compose up -d
docker compose exec backend alembic upgrade head
```

#### Step 3 — Reverse proxy

Point your reverse proxy at `http://YOUR_SERVER_IP:8000` for all routes — the frontend dashboard and all `/api/*` endpoints are served from the same container on the same port.

#### Step 4 — First-time setup

When you open the app for the first time, you'll be automatically redirected to the **setup page** where you create your account. Fill in your name, email and password — you'll be logged straight in. The setup page is permanently inaccessible once an account exists.

### Lost access — emergency recovery

If you lose access to your account, use the CLI inside the backend container to recover without needing to log in:

```bash
# Reset a user's password
docker compose exec backend python -m app.cli reset-password --email you@example.com --password newpassword

# Create a new user account directly
docker compose exec backend python -m app.cli create-user --email you@example.com --password newpassword --name "Your Name"

# List all accounts
docker compose exec backend python -m app.cli list-users
```

These commands talk directly to the database and bypass authentication entirely.

### GitHub secrets required

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `APP_URL` | `https://gym.yourdomain.com` |

### docker-compose.yml

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
      test: ["CMD", "redis-cli", "--no-auth-warning", "-a", "${REDIS_PASSWORD}", "ping"]
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
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - backup_data:/backups
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

networks:
  magni_internal:
    driver: bridge
```

### Local testing (no reverse proxy)

```bash
cp .env.example .env
# Set ENVIRONMENT=development in .env
docker compose pull
docker compose up -d
docker compose exec backend alembic upgrade head
```

Then open:
- `http://localhost:8000` — React dashboard
- `http://localhost:8000/api/docs` — Swagger API docs (development mode only)
- `http://localhost:8000/health` — health check

### Deploying updates

```bash
cd magni
git pull
docker compose pull
docker compose up -d
# If the update includes migrations:
docker compose exec backend alembic upgrade head
```

### Environment variables

| Variable | Description |
|---|---|
| `APP_URL` | Full public URL — must be `https://` |
| `ALLOWED_ORIGINS` | CORS origins — usually same as `APP_URL` |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `REDIS_PASSWORD` | Redis password |
| `SECRET_KEY` | JWT signing key — `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | `production` or `development` |
| `BACKEND_PORT` | Port exposed to host (default `8000`) |
| `TZ` | Timezone e.g. `Australia/Perth` (used by backup scheduler) |
| `BACKUP_SCHEDULE` | Cron schedule for backups (default `0 2 * * *` — 2am daily) |
| `BACKUP_DIR` | Path inside the container where backups are written (default `/backups`) |
| `CIFS_PATH` | NAS share path e.g. `//192.168.1.x/backups` |
| `CIFS_USERNAME` | NAS username |
| `CIFS_PASSWORD` | NAS password |

### Useful commands

```bash
# View logs
docker compose logs -f backend

# Restart
docker compose restart backend

# Database shell
docker compose exec db psql -U magni magni

# Trigger a manual backup immediately
curl -X POST http://localhost:8000/api/backup/run

# Stop everything
docker compose down

# Stop and wipe all data (irreversible)
docker compose down -v
```

### Backups

Backups run automatically inside the backend container on the schedule set by `BACKUP_SCHEDULE`. Files are written to the CIFS-mounted NAS volume as `magni_backup_YYYYMMDD_HHMMSS.sql.gz` and auto-deleted after 30 days.

To trigger a backup manually:
```bash
curl -X POST http://localhost:8000/api/backup/run
```

To restore from a backup:
```bash
gunzip -c magni_backup_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T db psql -U magni magni
```

---

## Part 2 — Android app

> Coming in the next build phase.

Kotlin + Jetpack Compose. Offline-first workout logging, Garmin ConnectIQ bridge (all watch families), background sync to this server.

---

## API reference

Available at `http://localhost:8000/api/docs` when `ENVIRONMENT=development`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/setup-required` | Returns `{"required": true}` if no accounts exist |
| `POST` | `/api/auth/setup` | Create first account (only works if no users exist) |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/dashboard/` | Summary stats |
| `POST` | `/api/workouts/` | Log a workout |
| `GET` | `/api/workouts/` | List workouts |
| `GET` | `/api/workouts/{id}` | Workout detail |
| `PATCH` | `/api/workouts/{id}` | Update workout |
| `DELETE` | `/api/workouts/{id}` | Delete workout |
| `POST` | `/api/exercises/` | Add exercise |
| `GET` | `/api/exercises/` | List exercises |
| `POST` | `/api/stats/daily` | Upsert daily Garmin stats |
| `GET` | `/api/stats/daily` | Query daily stats |
| `POST` | `/api/stats/hr` | Bulk insert HR readings |
| `GET` | `/api/stats/hr` | Query HR time-series |
| `POST` | `/api/sync/` | Batch sync from Android |
| `POST` | `/api/backup/run` | Trigger manual backup |
| `GET` | `/health` | Health check + version |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
