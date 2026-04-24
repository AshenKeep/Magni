import os
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    BackupStatus, BackupConfigUpdate,
    AdminUserResponse, PasswordResetRequest,
)
from app.core.security import get_current_user_id, hash_password
from app.core.config import get_settings
from app.services.backup import run_backup

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
    """Trigger a manual backup immediately."""
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
