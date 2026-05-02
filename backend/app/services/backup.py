"""
Backup service for v0.0.9.

A "backup" is a single .tar.gz file in /backups with this layout:
    db.sql                — uncompressed SQL dump (outer tar.gz handles compression)
    manifest.json         — { version, created_at, include_media, media: [{path, size, mtime}, ...] }
    media/...             — copy of the media root if include_media was set

Retention: keep N most recent backups, delete the rest after each new backup.
N is read from the BackupSettings singleton in the database.

Media change detection (when include_media is true): compare each file's
size+mtime against the previous backup's manifest. The new backup still writes
a fresh tar (so each tarball is self-contained) but logs whether the media set
was unchanged for diagnostic purposes.
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)

BACKUP_VERSION = "v0.0.9"
BACKUP_PREFIX = "magni_backup_"
BACKUP_SUFFIX = ".tar.gz"
DEFAULT_RETENTION_DAYS = 7


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@dataclass
class BackupInfo:
    filename: str
    size_bytes: int
    created_at: datetime
    has_media: bool


def _backup_dir() -> Path:
    return Path(get_settings().backup_dir)


def _media_dir() -> Path:
    """
    Return the parent of the configured media subdir (i.e. /media) so all
    media folders are captured. settings.media_dir defaults to /media/exercises.
    """
    return Path(get_settings().media_dir).parent


def _build_db_url_sync() -> str:
    """Strip asyncpg driver suffix so pg_dump / psql (libpq) accept the URL."""
    return get_settings().database_url.replace("postgresql+asyncpg://", "postgresql://")


def _scan_media_files(media_root: Path) -> list[dict]:
    out: list[dict] = []
    if not media_root.exists():
        return out
    for f in media_root.rglob("*"):
        if not f.is_file():
            continue
        rel = str(f.relative_to(media_root))
        st = f.stat()
        out.append({"path": rel, "size": st.st_size, "mtime": int(st.st_mtime)})
    out.sort(key=lambda x: x["path"])
    return out


def _media_unchanged(prev: list[dict], curr: list[dict]) -> bool:
    if len(prev) != len(curr):
        return False
    prev_idx = {m["path"]: (m["size"], m["mtime"]) for m in prev}
    for entry in curr:
        p = prev_idx.get(entry["path"])
        if p is None or p != (entry["size"], entry["mtime"]):
            return False
    return True


def _read_manifest_from_tar(tar_path: Path) -> Optional[dict]:
    try:
        with tarfile.open(tar_path, "r:gz") as tar:
            try:
                m = tar.getmember("manifest.json")
            except KeyError:
                return None
            f = tar.extractfile(m)
            if f is None:
                return None
            return json.loads(f.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("Failed to read manifest from %s: %s", tar_path, exc)
        return None


def list_backups() -> list[BackupInfo]:
    out: list[BackupInfo] = []
    if not _backup_dir().exists():
        return out
    for f in _backup_dir().glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}"):
        try:
            st = f.stat()
            manifest = _read_manifest_from_tar(f)
            has_media = bool(manifest and manifest.get("include_media"))
            out.append(BackupInfo(
                filename=f.name,
                size_bytes=st.st_size,
                created_at=datetime.fromtimestamp(st.st_mtime, tz=timezone.utc),
                has_media=has_media,
            ))
        except Exception as exc:
            logger.warning("Skipping unreadable backup %s: %s", f, exc)
    out.sort(key=lambda b: b.created_at, reverse=True)
    return out


def prune_backups(keep_count: int) -> int:
    """
    Keep the `keep_count` most recent backups, delete the rest.
    The user-facing setting is named "retention days" but the simplest
    semantic — and the one the user explicitly asked for — is to keep
    that many files. Returns count deleted.
    """
    if keep_count <= 0:
        return 0
    backups = list_backups()
    deleted = 0
    for b in backups[keep_count:]:
        try:
            (_backup_dir() / b.filename).unlink()
            logger.info("Pruned backup %s", b.filename)
            deleted += 1
        except Exception as exc:
            logger.warning("Failed to prune %s: %s", b.filename, exc)
    return deleted


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def create_backup(include_media: bool = False, retention_days: int = DEFAULT_RETENTION_DAYS) -> Path:
    backup_dir = _backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{BACKUP_PREFIX}{timestamp}{BACKUP_SUFFIX}"
    dest = backup_dir / filename

    logger.info("pg_dump → in-memory")
    try:
        proc = subprocess.run(["pg_dump", _build_db_url_sync()], capture_output=True, check=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"pg_dump failed: {exc.stderr.decode(errors='replace')[:500]}") from exc
    db_bytes = proc.stdout

    media_root = _media_dir()
    media_manifest = _scan_media_files(media_root) if include_media else []

    media_unchanged = False
    if include_media:
        for prev in list_backups():
            prev_manifest = _read_manifest_from_tar(backup_dir / prev.filename)
            if prev_manifest and prev_manifest.get("include_media"):
                if _media_unchanged(prev_manifest.get("media", []), media_manifest):
                    media_unchanged = True
                    logger.info("Media unchanged since %s", prev.filename)
                break

    manifest = {
        "version": BACKUP_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "include_media": include_media,
        "media_unchanged_from_prev": media_unchanged,
        "media": media_manifest,
    }

    with tempfile.TemporaryDirectory() as td:
        tdpath = Path(td)
        (tdpath / "db.sql").write_bytes(db_bytes)
        (tdpath / "manifest.json").write_text(json.dumps(manifest, indent=2))

        with tarfile.open(dest, "w:gz") as tar:
            tar.add(tdpath / "db.sql", arcname="db.sql")
            tar.add(tdpath / "manifest.json", arcname="manifest.json")
            if include_media and media_root.exists():
                tar.add(str(media_root), arcname="media")

    logger.info("Backup written: %s (%d bytes, media=%s)", dest, dest.stat().st_size, include_media)
    prune_backups(retention_days)
    return dest


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

def restore_backup(filename: str, restore_media: bool = True) -> dict:
    """
    Restore the named backup. Drops public schema, replays db.sql, and
    optionally restores the media tree. Raises on failure.
    """
    src = _backup_dir() / filename
    if not src.exists() or not src.is_file():
        raise FileNotFoundError(f"Backup not found: {filename}")
    if not src.name.startswith(BACKUP_PREFIX) or not src.name.endswith(BACKUP_SUFFIX):
        raise ValueError("Refusing to restore a file that doesn't look like a magni backup")

    with tempfile.TemporaryDirectory() as td:
        tdpath = Path(td)
        with tarfile.open(src, "r:gz") as tar:
            names = tar.getnames()
            if "db.sql" not in names:
                raise ValueError("Backup is missing db.sql")
            try:
                tar.extractall(tdpath, filter="data")  # py3.12+
            except TypeError:
                tar.extractall(tdpath)

        sql_path = tdpath / "db.sql"
        manifest: dict = {}
        if (tdpath / "manifest.json").exists():
            try:
                manifest = json.loads((tdpath / "manifest.json").read_text())
            except Exception:
                pass

        db_url_sync = _build_db_url_sync()

        logger.info("Resetting public schema before restore")
        try:
            subprocess.run(
                ["psql", db_url_sync, "-v", "ON_ERROR_STOP=1",
                 "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"],
                check=True, capture_output=True,
            )
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"Schema reset failed: {exc.stderr.decode(errors='replace')[:500]}") from exc

        logger.info("Replaying db.sql via psql")
        try:
            subprocess.run(
                ["psql", db_url_sync, "-v", "ON_ERROR_STOP=1", "-f", str(sql_path)],
                check=True, capture_output=True,
            )
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"psql restore failed: {exc.stderr.decode(errors='replace')[:500]}") from exc

        media_restored = False
        if restore_media and (tdpath / "media").exists():
            media_root = _media_dir()
            try:
                if media_root.exists():
                    shutil.rmtree(media_root)
                shutil.copytree(tdpath / "media", media_root)
                media_restored = True
                logger.info("Media tree restored to %s", media_root)
            except Exception as exc:
                logger.warning("Media restore failed (DB already restored): %s", exc)

    return {
        "filename": filename,
        "manifest_version": manifest.get("version"),
        "media_restored": media_restored,
        "media_present_in_backup": bool(manifest.get("include_media")),
    }


# ---------------------------------------------------------------------------
# Scheduled entry point
# ---------------------------------------------------------------------------

def run_backup() -> None:
    """
    APScheduler entry point. Reads BackupSettings (sync engine, brief connection)
    so the user's retention/include_media choices are honoured.
    """
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.models import BackupSettings

    include_media = False
    retention_days = DEFAULT_RETENTION_DAYS

    try:
        engine = create_engine(_build_db_url_sync())
        with Session(engine) as session:
            row = session.execute(select(BackupSettings).limit(1)).scalar_one_or_none()
            if row is not None:
                include_media = bool(row.include_media)
                retention_days = int(row.retention_days)
        engine.dispose()
    except Exception as exc:
        logger.warning("Could not read BackupSettings, using defaults: %s", exc)

    try:
        create_backup(include_media=include_media, retention_days=retention_days)
    except Exception as exc:
        logger.error("Scheduled backup failed: %s", exc)
