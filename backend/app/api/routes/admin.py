import os
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User, Exercise, SeedLog
from app.schemas.schemas import (
    BackupStatus, AdminUserResponse, PasswordResetRequest, SeedLogResponse,
)
from app.core.security import get_current_user_id, hash_password
from app.core.config import get_settings
from app.services.backup import run_backup
from app.services.ascendapi import (
    fetch_all_exercises, normalize_exercise,
    download_gif, get_media_dir, estimate_requests, BODY_PARTS,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _get_ascendapi_key() -> str:
    """
    Read ASCENDAPI_KEY directly from environment every time — bypasses
    the lru_cache on get_settings() so a key added after first startup works.
    """
    return os.environ.get("ASCENDAPI_KEY", "").strip()


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
# Seed logs
# ---------------------------------------------------------------------------

@router.get("/logs/seed", response_model=list[SeedLogResponse])
async def get_seed_logs(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Returns the last 10 seed attempts for the current user."""
    result = await db.execute(
        select(SeedLog)
        .where(SeedLog.user_id == user_id)
        .order_by(SeedLog.started_at.desc())
        .limit(10)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Exercise seeding — AscendAPI
# ---------------------------------------------------------------------------

@router.get("/exercises/seed/estimate")
async def seed_estimate(
    download_gifs: bool = False,
    _: str = Depends(get_current_user_id),
):
    estimated_exercises = len(BODY_PARTS) * 25
    return estimate_requests(estimated_exercises, download_gifs)


@router.get("/exercises/media/status")
async def media_status(_: str = Depends(get_current_user_id)):
    settings = get_settings()
    media_dir = get_media_dir()
    gif_count = len(list(media_dir.glob("*.gif"))) if media_dir and media_dir.exists() else 0
    key = _get_ascendapi_key()
    return {
        "media_storage": settings.media_storage,
        "media_dir": settings.media_dir,
        "gif_count": gif_count,
        "cifs_configured": bool(settings.media_cifs_path),
        "api_key_configured": bool(key),
        "api_key_preview": f"{key[:6]}…" if len(key) > 6 else ("(not set)" if not key else key),
    }


@router.post("/exercises/seed")
async def seed_exercises(
    download_gifs: bool = False,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Seeds exercise library from AscendAPI with full logging.
    download_gifs=False  → metadata + CDN links (~9 API requests)
    download_gifs=True   → metadata + local GIF downloads
    """
    key = _get_ascendapi_key()
    settings = get_settings()

    log_lines: list[str] = []

    def log(msg: str) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        log_lines.append(line)

    # Create seed log entry
    seed_log = SeedLog(
        user_id=user_id,
        mode="with_gifs" if download_gifs else "metadata_only",
        status="running",
        added=0, skipped=0, gifs_downloaded=0,
    )
    db.add(seed_log)
    await db.flush()

    log(f"Seed started — mode: {'with_gifs' if download_gifs else 'metadata_only'}")
    log(f"Media storage: {settings.media_storage}")
    log(f"API key configured: {bool(key)} — preview: {key[:6] + '…' if len(key) > 6 else '(not set)'}")

    # Key check
    if not key:
        error_msg = "ASCENDAPI_KEY is not set in the container environment. Add it to .env and run: docker compose up -d"
        log(f"ERROR: {error_msg}")
        seed_log.status = "error"
        seed_log.error = error_msg
        seed_log.log_output = "\n".join(log_lines)
        seed_log.finished_at = datetime.now(timezone.utc)
        await db.flush()
        raise HTTPException(status_code=400, detail=error_msg)

    # Temporarily override the key in env for the fetch call
    os.environ["ASCENDAPI_KEY"] = key

    try:
        log(f"Fetching exercises from AscendAPI across {len(BODY_PARTS)} body parts…")
        raw_exercises = await fetch_all_exercises(limit_per_part=25)
        log(f"Fetched {len(raw_exercises)} unique exercises total")
    except Exception as e:
        error_msg = f"AscendAPI fetch failed: {str(e)}"
        log(f"ERROR: {error_msg}")
        seed_log.status = "error"
        seed_log.error = error_msg
        seed_log.log_output = "\n".join(log_lines)
        seed_log.finished_at = datetime.now(timezone.utc)
        await db.flush()
        raise HTTPException(status_code=502, detail=error_msg)

    added = 0
    skipped = 0
    gifs_downloaded = 0

    for raw in raw_exercises:
        normalized = normalize_exercise(raw)
        ascendapi_id = normalized.get("ascendapi_id")
        name = normalized.get("name", "unknown")

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

        gif_url = normalized.get("gif_url")
        if gif_url and download_gifs and settings.media_storage != "external":
            log(f"Downloading GIF for: {name}")
            local_url = await download_gif(gif_url, ascendapi_id or "unknown")
            normalized["gif_url"] = local_url
            if local_url and local_url.startswith("/media"):
                gifs_downloaded += 1
                log(f"  ✓ Saved: {local_url}")
            else:
                log(f"  ⚠ GIF download failed, using CDN URL")

        exercise = Exercise(user_id=user_id, **normalized)
        db.add(exercise)
        added += 1

    await db.flush()

    log(f"Seed complete — added: {added}, skipped: {skipped}, GIFs downloaded: {gifs_downloaded}")

    seed_log.status = "success"
    seed_log.added = added
    seed_log.skipped = skipped
    seed_log.gifs_downloaded = gifs_downloaded
    seed_log.log_output = "\n".join(log_lines)
    seed_log.finished_at = datetime.now(timezone.utc)
    await db.flush()

    return {
        "status": "ok",
        "added": added,
        "skipped": skipped,
        "total_fetched": len(raw_exercises),
        "gifs_downloaded": gifs_downloaded,
        "media_storage": settings.media_storage,
        "log": log_lines,
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
            Exercise.ascendapi_id.isnot(None),
        )
    )
    exercises = result.scalars().all()

    log_lines: list[str] = []

    def log(msg: str) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        log_lines.append(f"[{ts}] {msg}")

    seed_log = SeedLog(
        user_id=user_id,
        mode="download_gifs",
        status="running",
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
        local_url = await download_gif(ex.gif_url, ex.ascendapi_id)
        if local_url and local_url.startswith("/media"):
            ex.gif_url = local_url
            downloaded += 1
            log(f"  ✓ {local_url}")
        else:
            failed += 1
            log(f"  ✗ Failed")

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
        "log": log_lines,
    }
