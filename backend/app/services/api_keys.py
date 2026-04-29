"""
Database-backed API key storage for exercise providers.
Replaces the env-var approach used in v0.0.5 — no more lru_cache bugs,
keys can be added/changed without restarting the container.
"""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import ApiKey


async def get_api_key(db: AsyncSession, provider: str) -> Optional[str]:
    """Returns the API key for a provider if set and enabled, otherwise None."""
    result = await db.execute(
        select(ApiKey).where(ApiKey.provider == provider, ApiKey.enabled == True)
    )
    record = result.scalar_one_or_none()
    return record.api_key if record else None


async def set_api_key(db: AsyncSession, provider: str, api_key: str) -> ApiKey:
    """Inserts or updates the API key for a provider. Always sets enabled=True."""
    result = await db.execute(select(ApiKey).where(ApiKey.provider == provider))
    record = result.scalar_one_or_none()
    if record:
        record.api_key = api_key
        record.enabled = True
    else:
        record = ApiKey(provider=provider, api_key=api_key, enabled=True)
        db.add(record)
    await db.flush()
    return record


async def delete_api_key(db: AsyncSession, provider: str) -> bool:
    """Removes the API key for a provider. Returns True if deleted, False if not found."""
    result = await db.execute(select(ApiKey).where(ApiKey.provider == provider))
    record = result.scalar_one_or_none()
    if not record:
        return False
    await db.delete(record)
    await db.flush()
    return True


async def list_api_keys(db: AsyncSession) -> list[ApiKey]:
    """Returns all configured API keys."""
    result = await db.execute(select(ApiKey).order_by(ApiKey.provider))
    return list(result.scalars().all())


def mask_key(key: str) -> str:
    """Returns a masked preview of a key for display (e.g. 'wx_abc1...xyz9')."""
    if not key:
        return "(empty)"
    if len(key) <= 12:
        return key[:4] + "…"
    return f"{key[:6]}…{key[-4:]}"
