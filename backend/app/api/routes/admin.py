import os
import json
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User, Exercise, SeedLog, ApiKey, BackupSettings
from app.schemas.schemas import (
    BackupStatus, AdminUserResponse, PasswordResetRequest, SeedLogResponse,
    BackupListEntry, BackupSettingsResponse, BackupSettingsUpdate,
    BackupCreateRequest, BackupCreateResponse, BackupRestoreResponse,
)
from app.core.security import get_current_user_id, hash_password
from app.core.config import get_settings
from app.services.backup import (
    run_backup, create_backup, restore_backup, list_backups, DEFAULT_RETENTION_DAYS,
)
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
    backups = list_backups()
    last = backups[0] if backups else None
    return BackupStatus(
        last_backup=last.filename if last else None,
        last_backup_size_bytes=last.size_bytes if last else None,
        backup_count=len(backups),
        schedule=settings.backup_schedule,
        timezone=settings.tz,
        backup_dir=settings.backup_dir,
        cifs_path=os.environ.get("CIFS_PATH"),
    )


async def _get_or_create_backup_settings(db: AsyncSession) -> BackupSettings:
    """Lazy singleton — first call creates a row with defaults."""
    row = (await db.execute(select(BackupSettings).limit(1))).scalar_one_or_none()
    if row is None:
        row = BackupSettings(retention_days=DEFAULT_RETENTION_DAYS, include_media=False)
        db.add(row)
        await db.flush()
    return row


@router.get("/backup/settings", response_model=BackupSettingsResponse)
async def get_backup_settings(
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_create_backup_settings(db)


@router.patch("/backup/settings", response_model=BackupSettingsResponse)
async def update_backup_settings(
    payload: BackupSettingsUpdate,
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_or_create_backup_settings(db)
    if payload.retention_days is not None:
        if payload.retention_days < 1 or payload.retention_days > 365:
            raise HTTPException(status_code=400, detail="retention_days must be between 1 and 365")
        row.retention_days = payload.retention_days
    if payload.include_media is not None:
        row.include_media = payload.include_media
    await db.flush()
    return row


@router.get("/backup/list", response_model=list[BackupListEntry])
async def list_backup_files(_: str = Depends(get_current_user_id)):
    return [
        BackupListEntry(
            filename=b.filename,
            size_bytes=b.size_bytes,
            created_at=b.created_at,
            has_media=b.has_media,
        )
        for b in list_backups()
    ]


@router.post("/backup/run", response_model=BackupCreateResponse)
async def trigger_backup(
    payload: BackupCreateRequest = BackupCreateRequest(),
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an ad-hoc backup. include_media defaults to whatever is in
    BackupSettings; pass include_media in the body to override for one run.
    """
    settings_row = await _get_or_create_backup_settings(db)
    include_media = payload.include_media if payload.include_media is not None else settings_row.include_media
    try:
        path = create_backup(include_media=include_media, retention_days=settings_row.retention_days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc
    return BackupCreateResponse(
        filename=path.name,
        size_bytes=path.stat().st_size,
        include_media=include_media,
    )


@router.post("/backup/restore/{filename}", response_model=BackupRestoreResponse)
async def restore_backup_file(
    filename: str,
    _: str = Depends(get_current_user_id),
):
    """
    Restore from the named backup. **Destructive** — drops the public schema
    and replays the dump. Media is restored if present in the tarball.
    """
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    try:
        result = restore_backup(filename, restore_media=True)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Backup not found")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}") from exc
    return BackupRestoreResponse(**result)


@router.delete("/backup/{filename}", status_code=204)
async def delete_backup_file(
    filename: str,
    _: str = Depends(get_current_user_id),
):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    target = Path(get_settings().backup_dir) / filename
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")
    target.unlink()


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
    key = payload.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    record = await set_api_key(db, payload.provider, key)
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

            # Empty result with no caught exception means provider returned nothing valid
            if len(raw_exercises) == 0:
                log(f"WARNING: {prov} returned 0 exercises. Check API key validity and quota.")
        except Exception as e:
            error_msg = f"{prov} fetch failed: {type(e).__name__}: {str(e)}"
            log(f"ERROR: {error_msg}")
            if provider == "both":
                # In "both" mode, log the failure but try the other provider
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
            # WorkoutX GIFs MUST be cached locally — their CDN is auth-protected,
            # browsers can't load the URLs directly. So we force-download even in
            # "external" mode for WorkoutX exercises only.
            should_download = (
                gif_url and (
                    download_gifs or prov == "workoutx"
                ) and (
                    settings.media_storage != "external" or prov == "workoutx"
                )
            )
            if should_download:
                log(f"Downloading GIF: {name}")
                if prov == "workoutx":
                    local_url = await module.download_gif(gif_url, ext_id or "unknown", api_key=api_key)
                else:
                    local_url = await module.download_gif(gif_url, ext_id or "unknown")
                normalized["gif_url"] = local_url
                if local_url and local_url.startswith("/media"):
                    total_gifs += 1

            exercise = Exercise(user_id=user_id, **normalized)
            db.add(exercise)
            total_added += 1

    await db.flush()
    log(f"Seed complete — added: {total_added}, skipped: {total_skipped}, GIFs: {total_gifs}")

    # If provider was meant to fetch but returned nothing, treat as error
    # (most common cause: invalid API key — the provider's fetch_all_exercises
    # caught exceptions silently in earlier versions).
    if total_fetched == 0:
        seed_log.status = "error"
        seed_log.error = "No exercises fetched from any provider. Check API keys and quota."
    else:
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


@router.post("/exercises/recategorize")
async def recategorize_exercises(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Recomputes muscle_groups for existing exercises using their stored
    muscle_group + secondary_muscles fields. Useful after upgrading from v0.0.5
    where exercises were tagged with a single category — this re-runs the
    multi-category mapper on existing data without hitting any external API.
    """
    from app.services.muscle_mapping import map_muscles_to_categories, serialize_categories

    result = await db.execute(select(Exercise).where(Exercise.user_id == user_id))
    exercises = result.scalars().all()

    updated = 0
    for ex in exercises:
        secondary: list[str] = []
        if ex.secondary_muscles:
            try:
                parsed = json.loads(ex.secondary_muscles)
                if isinstance(parsed, list):
                    secondary = [str(s) for s in parsed]
            except json.JSONDecodeError:
                pass

        # body_part comes from muscle_group (already mapped to category); pass it
        # as the secondary fallback. The mapper handles already-categorized values.
        cats = map_muscles_to_categories(
            body_part=ex.muscle_group,
            target=None,
            secondary_muscles=secondary,
        )

        new_value = serialize_categories(cats)
        if ex.muscle_groups != new_value:
            ex.muscle_groups = new_value
            updated += 1

    await db.flush()
    return {"status": "ok", "updated": updated, "total": len(exercises)}


@router.get("/debug/workoutx-gif/{exercise_id}")
async def debug_workoutx_gif(
    exercise_id: str,
    _: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Debug endpoint: tries multiple auth strategies on a WorkoutX GIF endpoint
    and reports which (if any) succeed. Helps diagnose 401 issues.

    Try with: GET /api/admin/debug/workoutx-gif/0009
    """
    import httpx as _httpx

    api_key = await get_api_key(db, "workoutx")
    if not api_key:
        raise HTTPException(status_code=400, detail="No WorkoutX API key configured")

    base_url = f"https://api.workoutxapp.com/v1/gifs/{exercise_id}.gif"
    results = []

    strategies = [
        ("header_X-WorkoutX-Key", base_url, {"X-WorkoutX-Key": api_key}),
        ("header_Authorization_Bearer", base_url, {"Authorization": f"Bearer {api_key}"}),
        ("header_x-api-key", base_url, {"x-api-key": api_key}),
        ("query_api-key", f"{base_url}?api-key={api_key}", {}),
        ("query_apiKey", f"{base_url}?apiKey={api_key}", {}),
        ("query_key", f"{base_url}?key={api_key}", {}),
    ]

    async with _httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        for name, url, headers in strategies:
            try:
                resp = await client.get(url, headers=headers)
                results.append({
                    "strategy": name,
                    "status": resp.status_code,
                    "content_type": resp.headers.get("content-type", ""),
                    "content_length": resp.headers.get("content-length", ""),
                    "location": resp.headers.get("location", ""),
                    "body_preview": resp.text[:200] if resp.status_code != 200 else "[binary]",
                })
            except Exception as e:
                results.append({"strategy": name, "error": str(e)})

    # Also try fetching the metadata endpoint to confirm key works at all
    try:
        async with _httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.workoutxapp.com/v1/exercises?limit=1",
                headers={"X-WorkoutX-Key": api_key},
            )
            metadata_check = {
                "status": resp.status_code,
                "body_preview": resp.text[:300],
            }
    except Exception as e:
        metadata_check = {"error": str(e)}

    return {
        "exercise_id": exercise_id,
        "key_preview": mask_key(api_key),
        "metadata_endpoint_check": metadata_check,
        "gif_strategies": results,
    }


@router.post("/exercises/download-gifs")
async def download_gifs_for_existing(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Downloads/caches GIFs for previously seeded exercises.
    WorkoutX GIFs are always cached (their endpoint is auth-protected so the
    browser can't display them directly).
    AscendAPI GIFs only cache when MEDIA_STORAGE is local or cifs.
    """
    settings = get_settings()
    media_dir_path = Path(settings.media_dir)
    media_dir_path.mkdir(parents=True, exist_ok=True)

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

    # Cache the WorkoutX key once (used for all WorkoutX GIF downloads)
    workoutx_key = await get_api_key(db, "workoutx")

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
            local_url = await workoutx.download_gif(ex.gif_url, ex.workoutx_id, api_key=workoutx_key)
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
