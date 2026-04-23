from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings, APP_VERSION
from app.db.redis import get_redis, close_redis
from app.api.routes.auth import router as auth_router
from app.api.routes.workouts import router as workouts_router
from app.api.routes.other import (
    exercises_router,
    stats_router,
    sync_router,
    dashboard_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_redis()
    yield
    await close_redis()


settings = get_settings()

app = FastAPI(
    title="Magni API",
    version=APP_VERSION,
    # Docs only available in development — never expose in production
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


@app.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}
