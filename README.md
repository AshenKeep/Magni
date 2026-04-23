# Magni

**Version:** v0.0.1

A self-hosted gym workout tracking system. Log workouts offline on Android, sync Garmin watch data (heart rate, steps, sleep, active calories), and view everything in a web dashboard — all running on your own server.

---

## How it works

```
Your server (Docker)                    Your phone (Android app)
──────────────────────                  ──────────────────────────
  PostgreSQL                            Workout logger (offline-first)
  Redis                    ◄──sync──►  Garmin ConnectIQ bridge
  FastAPI REST API                      Background sync engine
  React web dashboard
        ▲
        │ HTTPS (your reverse proxy)
        │
  Internet / your LAN
```

Your reverse proxy (Nginx Proxy Manager, Traefik, Cloudflare Tunnel, etc.) handles TLS. The app **requires HTTPS** — it will not work over plain HTTP.

---

## Part 1 — Docker server & web dashboard

### Prerequisites

- A server or PC running Linux with Docker Engine 24+ and Docker Compose v2
- A domain name pointed at your server's public IP, **or** a DDNS service (e.g. [DuckDNS](https://www.duckdns.org) — free) if your home IP changes
- A reverse proxy configured to forward HTTPS traffic to this server (see below)
- Ports 80 and 443 open on your router/firewall (forwarded to your server)

### Setting up the GitHub repo and deploying

#### Step 1 — Create the GitHub repo (one time only)

1. Install [GitHub Desktop](https://desktop.github.com) and sign in
2. **File → New Repository**
   - Name: `magni`
   - Local path: choose a folder on your PC
   - Tick "Initialize this repository with a README"
   - Click **Create Repository**
3. Click **Publish repository** in the top bar
   - Choose public or private
   - Click **Publish Repository**
4. Copy all files from this zip into that local folder
5. In GitHub Desktop you'll see all files listed as changes
6. Write a commit message (e.g. `Initial commit — v0.0.1`) and click **Commit to main**
7. Click **Push origin** — files are now on GitHub

#### Step 2 — Clone and run on your server

SSH into your server, then:

```bash
git clone https://github.com/YOURUSERNAME/magni.git
cd magni

# Copy and fill in environment config
cp .env.example .env
nano .env   # or use any editor

# Build and start
docker compose up -d --build

# Run database migrations
docker compose exec backend alembic upgrade head
```

#### Step 3 — Configure your reverse proxy

Point your reverse proxy at:
- **Frontend:** `http://YOUR_SERVER_IP:3000`
- **Backend API:** `http://YOUR_SERVER_IP:8000`

Route requests like this:
- `https://gym.yourdomain.com/api/*` → backend on port `8000`
- `https://gym.yourdomain.com/*` → frontend on port `3000`

**Nginx Proxy Manager** is the easiest option for home servers — it has a web UI and handles Let's Encrypt certificates automatically. Add two proxy hosts pointing at the ports above.

**Traefik**, **Cloudflare Tunnel**, and plain **Nginx** all work too.

#### Step 4 — Create your account

Open `https://gym.yourdomain.com` in your browser and register an account.

### Deploying updates

Whenever you push changes to GitHub, deploy on the server with:

```bash
cd magni
git pull
docker compose up -d --build
```

If a migration is included in the update:
```bash
docker compose exec backend alembic upgrade head
```

### Environment variables

| Variable | Description |
|---|---|
| `APP_URL` | Full public URL — must be `https://`. Example: `https://gym.yourdomain.com` |
| `ALLOWED_ORIGINS` | CORS origins — usually the same as `APP_URL` |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `REDIS_PASSWORD` | Redis password |
| `SECRET_KEY` | JWT signing key — generate with `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ENVIRONMENT` | `production` or `development` (development enables `/api/docs`) |
| `BACKEND_PORT` | Port the backend exposes to the host (default `8000`) |
| `FRONTEND_PORT` | Port the frontend exposes to the host (default `3000`) |

### Useful commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart a service
docker compose restart backend

# Database shell
docker compose exec db psql -U magni magni

# Stop everything
docker compose down

# Stop and delete all data (irreversible)
docker compose down -v
```

### Backup

```bash
# Dump database to file
docker compose exec db pg_dump -U magni magni > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T db psql -U magni magni < backup_YYYYMMDD.sql
```

---

## Part 2 — Android app

> Coming in the next build phase.

The Android app is built with Kotlin and Jetpack Compose. It will include:
- Offline-first workout logging (Room database)
- Background sync to this server when connected
- Garmin ConnectIQ SDK bridge — works with all modern Garmin watch families (Forerunner, Fenix, Epix, Venu, Vivoactive, Instinct)
- Live HR streaming during workouts
- Daily activity sync (steps, sleep, calories, resting HR)

---

## API reference

API docs are available at `https://YOUR_DOMAIN/api/docs` when `ENVIRONMENT=development`.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/dashboard/` | Summary stats + today's Garmin data |
| `POST` | `/api/workouts/` | Log a workout |
| `GET` | `/api/workouts/` | List workouts (paginated) |
| `GET` | `/api/workouts/{id}` | Get workout with sets |
| `PATCH` | `/api/workouts/{id}` | Update workout |
| `DELETE` | `/api/workouts/{id}` | Delete workout |
| `POST` | `/api/exercises/` | Add exercise to library |
| `GET` | `/api/exercises/` | List exercises |
| `POST` | `/api/stats/daily` | Upsert daily Garmin stats |
| `GET` | `/api/stats/daily` | Query daily stats |
| `POST` | `/api/stats/hr` | Bulk insert HR readings |
| `GET` | `/api/stats/hr` | Query HR time-series |
| `POST` | `/api/sync/` | Batch sync from Android (offline data) |
| `GET` | `/health` | Health check + version |

### Authentication

All endpoints except `/api/auth/*` and `/health` require a Bearer token:

```
Authorization: Bearer <token>
```

Get a token by posting to `/api/auth/login`.

---

## Security

- All API responses include `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers
- JWT tokens expire after 7 days
- Passwords are hashed with bcrypt
- CORS is locked to `ALLOWED_ORIGINS` — only your domain can call the API from a browser
- API docs (`/api/docs`) are disabled in production mode

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
