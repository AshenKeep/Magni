import os
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User, Exercise
from app.schemas.schemas import (
    BackupStatus, AdminUserResponse, PasswordResetRequest,
)
from app.core.security import get_current_user_id, hash_password
from app.core.config import get_settings
from app.services.backup import run_backup
from app.services.ascendapi import (
    fetch_all_exercises, normalize_exercise,
    download_gif, get_media_dir, estimate_requests, BODY_PARTS,
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
async def list_users(
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
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
# Exercise seeding — AscendAPI
# ---------------------------------------------------------------------------

@router.get("/exercises/seed/estimate")
async def seed_estimate(
    download_gifs: bool = False,
    _: str = Depends(get_current_user_id),
):
    """Returns estimated API request usage before seeding."""
    # Rough estimate: 25 exercises per body part × 9 parts
    estimated_exercises = len(BODY_PARTS) * 25
    return estimate_requests(estimated_exercises, download_gifs)


@router.get("/exercises/media/status")
async def media_status(_: str = Depends(get_current_user_id)):
    """Returns media storage configuration and local GIF count."""
    settings = get_settings()
    media_dir = get_media_dir()
    gif_count = len(list(media_dir.glob("*.gif"))) if media_dir and media_dir.exists() else 0
    return {
        "media_storage": settings.media_storage,
        "media_dir": settings.media_dir,
        "gif_count": gif_count,
        "cifs_configured": bool(settings.media_cifs_path),
    }


@router.post("/exercises/seed")
async def seed_exercises(
    download_gifs: bool = False,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Seeds exercise library from AscendAPI.

    download_gifs=False  → metadata + external CDN links only (~9 API requests)
    download_gifs=True   → metadata + downloads GIFs to local/CIFS storage
    """
    settings = get_settings()
    if not settings.ascendapi_key:
        raise HTTPException(status_code=400, detail="ASCENDAPI_KEY is not configured in .env")

    try:
        raw_exercises = await fetch_all_exercises(limit_per_part=25)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AscendAPI error: {str(e)}")

    added = 0
    skipped = 0
    gifs_downloaded = 0

    for raw in raw_exercises:
        normalized = normalize_exercise(raw)
        ascendapi_id = normalized.get("ascendapi_id")

        if ascendapi_id:
            existing = await db.execute(
                select(Exercise).where(
                    Exercise.user_id == user_id,
                    Exercise.ascendapi_id == ascendapi_id,
                )
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

        # Handle GIF storage
        gif_url = normalized.get("gif_url")
        if gif_url and download_gifs and settings.media_storage != "external":
            local_url = await download_gif(gif_url, ascendapi_id or "unknown")
            normalized["gif_url"] = local_url
            if local_url and local_url.startswith("/media"):
                gifs_downloaded += 1

        exercise = Exercise(user_id=user_id, **normalized)
        db.add(exercise)
        added += 1

    await db.flush()

    return {
        "status": "ok",
        "added": added,
        "skipped": skipped,
        "total_fetched": len(raw_exercises),
        "gifs_downloaded": gifs_downloaded,
        "media_storage": settings.media_storage,
    }


@router.post("/exercises/download-gifs")
async def download_gifs_for_existing(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Downloads GIFs for exercises that currently have external CDN URLs.
    Use this after seeding metadata-only, when ready to cache GIFs locally.
    """
    settings = get_settings()
    if settings.media_storage == "external":
        raise HTTPException(
            status_code=400,
            detail="MEDIA_STORAGE is set to 'external'. Change to 'local' or 'cifs' in .env first.",
        )

    result = await db.execute(
        select(Exercise).where(
            Exercise.user_id == user_id,
            Exercise.ascendapi_id.isnot(None),
        )
    )
    exercises = result.scalars().all()

    downloaded = 0
    skipped = 0
    failed = 0

    for ex in exercises:
        # Skip if already local
        if ex.gif_url and ex.gif_url.startswith("/media"):
            skipped += 1
            continue
        if not ex.gif_url:
            skipped += 1
            continue

        local_url = await download_gif(ex.gif_url, ex.ascendapi_id)
        if local_url and local_url.startswith("/media"):
            ex.gif_url = local_url
            downloaded += 1
        else:
            failed += 1

    await db.flush()

    return {
        "status": "ok",
        "downloaded": downloaded,
        "skipped_already_local": skipped,
        "failed": failed,
        "total": len(exercises),
    }
