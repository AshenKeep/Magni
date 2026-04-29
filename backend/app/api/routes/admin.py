import os
import json
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User, Exercise, SeedLog, ApiKey
from app.schemas.schemas import (
    BackupStatus, AdminUserResponse, PasswordResetRequest, SeedLogResponse,
)
from app.core.security import get_current_user_id, hash_password
from app.core.config import get_settings
from app.services.backup import run_backup
from app.services import ascendapi, workoutx
from app.services.api_keys import (
    get_api_key, set_api_key, delete_api_key, list_api_keys, mask_key,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

@router.get("/backup/status", response_model=BackupStatus)
async def backup_status(_: str = Depends(get_current_user_id)):
    settings = get_settings()
    backup_dir = Path(settings.backup_dir)
    backups = sorted(backup_dir.glob("magni_backup_*.sql.gz")) if backup_dir.exists() else []
    last = backups[-1] if backups else None
    return BackupStatus(
        last_backup=last.name if last else None,
        last_backup_size_bytes=last.stat().st_size if last else None,
        backup_count=len(backups),
        schedule=settings.backup_schedule,
        timezone=settings.tz,
        backup_dir=settings.backup_dir,
        cifs_path=os.environ.get("CIFS_PATH"),
    )


@router.post("/backup/run")
async def trigger_backup(_: str = Depends(get_current_user_id)):
    run_backup()
    return {"status": "backup triggered"}


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(_: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


@router.post("/users/reset-password")
async def reset_password(
    payload: PasswordResetRequest,
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(payload.new_password)
    await db.flush()
    return {"status": "password updated"}


@router.patch("/users/{user_id}/toggle-active")
async def toggle_active(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if str(user_id) == str(current_user_id):
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.flush()
    return {"email": user.email, "is_active": user.is_active}


# ---------------------------------------------------------------------------
# API Keys (database-backed)
# ---------------------------------------------------------------------------

class ApiKeySetPayload(BaseModel):
    provider: str  # "ascendapi" | "workoutx"
    api_key: str


@router.get("/api-keys")
async def list_keys(
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Returns all configured API keys with masked previews (never the full key)."""
    keys = await list_api_keys(db)
    by_provider = {k.provider: k for k in keys}

    return {
        "providers": [
            {
                "provider": "ascendapi",
                "name": "AscendAPI",
                "configured": "ascendapi" in by_provider,
                "enabled": by_provider["ascendapi"].enabled if "ascendapi" in by_provider else False,
                "preview": mask_key(by_provider["ascendapi"].api_key) if "ascendapi" in by_provider else "(not set)",
                "free_quota": ascendapi.FREE_QUOTA,
                "docs_url": "https://rapidapi.com/user/ascendapi",
                "signup_instructions": "Sign up at rapidapi.com → Search 'EDB with Videos and Images by AscendAPI' → Subscribe (Basic, free) → Copy your X-RapidAPI-Key",
            },
            {
                "provider": "workoutx",
                "name": "WorkoutX",
                "configured": "workoutx" in by_provider,
                "enabled": by_provider["workoutx"].enabled if "workoutx" in by_provider else False,
                "preview": mask_key(by_provider["workoutx"].api_key) if "workoutx" in by_provider else "(not set)",
                "free_quota": workoutx.FREE_QUOTA,
                "docs_url": "https://workoutxapp.com/docs.html",
                "signup_instructions": "Sign up at workoutxapp.com → Get API Key (free, no card) → Copy the wx_… key",
            },
        ]
    }


@router.post("/api-keys")
async def save_key(
    payload: ApiKeySetPayload,
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if payload.provider not in ("ascendapi", "workoutx"):
        raise HTTPException(status_code=400, detail=f"Unknown provider: {payload.provider}")
    if not payload.api_key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    record = await set_api_key(db, payload.provider, payload.api_key.strip())
    return {"status": "saved", "provider": record.provider, "preview": mask_key(record.api_key)}


@router.delete("/api-keys/{provider}")
async def remove_key(
    provider: str,
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_api_key(db, provider)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No key configured for {provider}")
    return {"status": "deleted", "provider": provider}


# ---------------------------------------------------------------------------
# Seed logs
# ---------------------------------------------------------------------------

@router.get("/logs/seed", response_model=list[SeedLogResponse])
async def get_seed_logs(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SeedLog).where(SeedLog.user_id == user_id).order_by(SeedLog.started_at.desc()).limit(10)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Exercise seeding
# ---------------------------------------------------------------------------

@router.get("/exercises/media/status")
async def media_status(
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    media_dir = ascendapi.get_media_dir()
    gif_count = len(list(media_dir.glob("*.gif"))) if media_dir and media_dir.exists() else 0

    ascendapi_key = await get_api_key(db, "ascendapi")
    workoutx_key = await get_api_key(db, "workoutx")

    return {
        "media_storage": settings.media_storage,
        "media_dir": settings.media_dir,
        "gif_count": gif_count,
        "cifs_configured": bool(settings.media_cifs_path),
        "providers": {
            "ascendapi": {"configured": bool(ascendapi_key)},
            "workoutx": {"configured": bool(workoutx_key)},
        },
    }


@router.get("/exercises/seed/estimate")
async def seed_estimate(
    provider: str = "ascendapi",
    download_gifs: bool = False,
    _: str = Depends(get_current_user_id),
):
    if provider == "ascendapi":
        estimated = len(ascendapi.BODY_PARTS) * 25
        return ascendapi.estimate_requests(estimated, download_gifs)
    elif provider == "workoutx":
        estimated = len(workoutx.BODY_PARTS) * 10
        return workoutx.estimate_requests(estimated, download_gifs)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")


@router.post("/exercises/seed")
async def seed_exercises(
    provider: str = "ascendapi",
    download_gifs: bool = False,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Seeds exercise library from selected provider.
    provider: "ascendapi" | "workoutx" | "both"
    """
    if provider not in ("ascendapi", "workoutx", "both"):
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    settings = get_settings()
    log_lines: list[str] = []

    def log(msg: str) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        log_lines.append(f"[{ts}] {msg}")

    seed_log = SeedLog(
        user_id=user_id,
        mode=f"{provider}_{'with_gifs' if download_gifs else 'metadata'}",
        status="running",
        added=0, skipped=0, gifs_downloaded=0,
    )
    db.add(seed_log)
    await db.flush()

    log(f"Seed started — provider: {provider}, gifs: {download_gifs}")
    log(f"Media storage: {settings.media_storage}")

    providers_to_run: list[str] = ["ascendapi", "workoutx"] if provider == "both" else [provider]

    total_added = 0
    total_skipped = 0
    total_gifs = 0
    total_fetched = 0

    for prov in providers_to_run:
        api_key = await get_api_key(db, prov)
        if not api_key:
            error_msg = f"{prov} API key is not configured. Add it via Admin → API Keys."
            log(f"ERROR: {error_msg}")
            if provider == "both":
                continue  # skip this provider but try the other
            seed_log.status = "error"
            seed_log.error = error_msg
            seed_log.log_output = "\n".join(log_lines)
            seed_log.finished_at = datetime.now(timezone.utc)
            await db.flush()
            raise HTTPException(status_code=400, detail=error_msg)

        log(f"--- {prov} ---")
        log(f"Fetching exercises from {prov}…")

        try:
            module = ascendapi if prov == "ascendapi" else workoutx
            limit = 25 if prov == "ascendapi" else 10
            raw_exercises = await module.fetch_all_exercises(api_key, limit_per_part=limit)
            log(f"Fetched {len(raw_exercises)} exercises from {prov}")
            total_fetched += len(raw_exercises)
        except Exception as e:
            error_msg = f"{prov} fetch failed: {str(e)}"
            log(f"ERROR: {error_msg}")
            if provider == "both":
                continue
            seed_log.status = "error"
            seed_log.error = error_msg
            seed_log.log_output = "\n".join(log_lines)
            seed_log.finished_at = datetime.now(timezone.utc)
            await db.flush()
            raise HTTPException(status_code=502, detail=error_msg)

        for raw in raw_exercises:
            normalized = module.normalize_exercise(raw)
            ext_id_field = "ascendapi_id" if prov == "ascendapi" else "workoutx_id"
            ext_id = normalized.get(ext_id_field)
            name = normalized.get("name", "unknown")

            # Dedupe by external id
            if ext_id:
                col = Exercise.ascendapi_id if prov == "ascendapi" else Exercise.workoutx_id
                existing = await db.execute(
                    select(Exercise).where(Exercise.user_id == user_id, col == ext_id)
                )
                if existing.scalar_one_or_none():
                    total_skipped += 1
                    continue

            # Also dedupe by name (in case "both" mode pulls same exercise from each)
            existing_by_name = await db.execute(
                select(Exercise).where(
                    Exercise.user_id == user_id,
                    Exercise.name == name,
                )
            )
            if existing_by_name.scalar_one_or_none():
                total_skipped += 1
                continue

            gif_url = normalized.get("gif_url")
            if gif_url and download_gifs and settings.media_storage != "external":
                log(f"Downloading GIF: {name}")
                local_url = await module.download_gif(gif_url, ext_id or "unknown")
                normalized["gif_url"] = local_url
                if local_url and local_url.startswith("/media"):
                    total_gifs += 1

            exercise = Exercise(user_id=user_id, **normalized)
            db.add(exercise)
            total_added += 1

    await db.flush()
    log(f"Seed complete — added: {total_added}, skipped: {total_skipped}, GIFs: {total_gifs}")

    seed_log.status = "success"
    seed_log.added = total_added
    seed_log.skipped = total_skipped
    seed_log.gifs_downloaded = total_gifs
    seed_log.log_output = "\n".join(log_lines)
    seed_log.finished_at = datetime.now(timezone.utc)
    await db.flush()

    return {
        "status": "ok",
        "provider": provider,
        "added": total_added,
        "skipped": total_skipped,
        "total_fetched": total_fetched,
        "gifs_downloaded": total_gifs,
        "media_storage": settings.media_storage,
    }


@router.post("/exercises/download-gifs")
async def download_gifs_for_existing(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    if settings.media_storage == "external":
        raise HTTPException(
            status_code=400,
            detail="MEDIA_STORAGE is set to 'external'. Change to 'local' or 'cifs' in .env first.",
        )

    result = await db.execute(
        select(Exercise).where(
            Exercise.user_id == user_id,
            (Exercise.ascendapi_id.isnot(None)) | (Exercise.workoutx_id.isnot(None)),
        )
    )
    exercises = result.scalars().all()

    log_lines: list[str] = []

    def log(msg: str) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        log_lines.append(f"[{ts}] {msg}")

    seed_log = SeedLog(
        user_id=user_id, mode="download_gifs", status="running",
        added=0, skipped=0, gifs_downloaded=0,
    )
    db.add(seed_log)
    await db.flush()

    log(f"Downloading GIFs for {len(exercises)} exercises…")
    downloaded = 0
    skipped = 0
    failed = 0

    for ex in exercises:
        if ex.gif_url and ex.gif_url.startswith("/media"):
            skipped += 1
            continue
        if not ex.gif_url:
            skipped += 1
            continue

        log(f"Downloading: {ex.name}")
        # Use the appropriate provider's download function
        if ex.source == "workoutx" and ex.workoutx_id:
            local_url = await workoutx.download_gif(ex.gif_url, ex.workoutx_id)
        else:
            local_url = await ascendapi.download_gif(ex.gif_url, ex.ascendapi_id or ex.workoutx_id or "unknown")

        if local_url and local_url.startswith("/media"):
            ex.gif_url = local_url
            downloaded += 1
        else:
            failed += 1

    await db.flush()
    log(f"Done — downloaded: {downloaded}, already local: {skipped}, failed: {failed}")

    seed_log.status = "success"
    seed_log.gifs_downloaded = downloaded
    seed_log.log_output = "\n".join(log_lines)
    seed_log.finished_at = datetime.now(timezone.utc)
    await db.flush()

    return {
        "status": "ok",
        "downloaded": downloaded,
        "skipped_already_local": skipped,
        "failed": failed,
        "total": len(exercises),
    }
