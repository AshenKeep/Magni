"""v0.0.12 — add is_done to workout_sets

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-02

Adds:
  - workout_sets.is_done (boolean, default false)
    Persists which sets the user has ticked off during an active workout session.
"""
from alembic import op
import sqlalchemy as sa


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workout_sets",
        sa.Column("is_done", sa.Boolean(), nullable=False, server_default=sa.sql.false()),
    )


def downgrade() -> None:
    op.drop_column("workout_sets", "is_done")
