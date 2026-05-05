from contextlib import asynccontextmanager
from pathlib import Path
import logging
import mimetypes

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings, APP_VERSION
from app.db.redis import get_redis, close_redis
from app.services.backup import run_backup
from app.api.routes.auth import router as auth_router
from app.api.routes.workouts import router as workouts_router
from app.api.routes.templates import router as templates_router
from app.api.routes.admin import router as admin_router
from app.api.routes.other import (
    exercises_router,
    stats_router,
    sync_router,
    dashboard_router,
)

# Ensure .gif files are served with correct content-type
mimetypes.add_type("image/gif", ".gif")

logger = logging.getLogger(__name__)
STATIC_DIR = Path("/app/static")
INDEX = STATIC_DIR / "index.html"
MEDIA_DIR = Path("/media")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    get_redis()

    scheduler = AsyncIOScheduler(timezone=settings.tz)
    cron_parts = settings.backup_schedule.split()
    if len(cron_parts) == 5:
        minute, hour, day, month, day_of_week = cron_parts
        scheduler.add_job(
            run_backup,
            CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week),
        )
        scheduler.start()
        logger.info("Backup scheduler started — %s %s", settings.backup_schedule, settings.tz)

    yield

    scheduler.shutdown(wait=False)
    await close_redis()


settings = get_settings()

app = FastAPI(
    title="Magni API",
    version=APP_VERSION,
    docs_url="/api/docs" if settings.environment == "development" else None,
    redoc_url="/api/redoc" if settings.environment == "development" else None,
    openapi_url="/api/openapi.json" if settings.environment == "development" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Magni-Version"] = APP_VERSION
    return response


app.include_router(auth_router, prefix="/api")
app.include_router(workouts_router, prefix="/api")
app.include_router(exercises_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(sync_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(templates_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    # Mount /icons explicitly so PWA icons and favicons are served correctly
    # and not caught by the SPA catch-all below
    icons_dir = STATIC_DIR / "icons"
    if icons_dir.exists():
        app.mount("/icons", StaticFiles(directory=str(icons_dir)), name="icons")

    # Serve manifest and service worker directly from static root
    # (Vite copies public/ into the build output root)

# Serve locally stored exercise GIFs - MUST be before the SPA fallback route
if MEDIA_DIR.exists():
    app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

# SPA fallback - this catches ALL remaining routes, so it must be last
if STATIC_DIR.exists():
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        return FileResponse(str(INDEX))
