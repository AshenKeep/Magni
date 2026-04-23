import gzip
import logging
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def run_backup() -> None:
    """
    Dumps the PostgreSQL database to a gzipped SQL file in the backup directory.
    Deletes backups older than 30 days.
    Called by APScheduler on the configured cron schedule.
    """
    settings = get_settings()
    backup_dir = Path(settings.backup_dir)

    if not backup_dir.exists():
        logger.warning("Backup directory %s does not exist — skipping backup", backup_dir)
        return

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"magni_backup_{timestamp}.sql.gz"
    dest = backup_dir / filename

    # Parse DATABASE_URL to extract connection details
    # Format: postgresql+asyncpg://user:password@host:port/dbname
    db_url = settings.database_url
    # Strip the asyncpg driver prefix for pg_dump (uses psycopg/libpq)
    db_url_sync = db_url.replace("postgresql+asyncpg://", "postgresql://")

    logger.info("Starting backup → %s", filename)

    try:
        result = subprocess.run(
            ["pg_dump", db_url_sync],
            capture_output=True,
            check=True,
        )
        with gzip.open(dest, "wb") as f:
            f.write(result.stdout)

        logger.info("Backup complete: %s (%d bytes)", dest, dest.stat().st_size)

    except subprocess.CalledProcessError as e:
        logger.error("pg_dump failed: %s", e.stderr.decode())
        return
    except Exception as e:
        logger.error("Backup failed: %s", e)
        return

    # Prune backups older than 30 days
    cutoff = datetime.now(timezone.utc).timestamp() - (30 * 86400)
    for old in backup_dir.glob("magni_backup_*.sql.gz"):
        if old.stat().st_mtime < cutoff:
            old.unlink()
            logger.info("Pruned old backup: %s", old.name)
