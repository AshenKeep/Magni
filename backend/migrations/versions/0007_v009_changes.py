"""v0.0.9 — backup_settings table for retention + media inclusion

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-01

Adds:
  - backup_settings (singleton) — retention_days, include_media

The application creates the singleton row lazily on first read, so the
migration just creates the table with no inserted row.
"""
from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backup_settings",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("include_media", sa.Boolean(), nullable=False, server_default=sa.sql.false()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("backup_settings")
